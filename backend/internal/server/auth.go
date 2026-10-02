package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/duckduckcode/backend/internal/auth"
	"github.com/duckduckcode/backend/internal/store"
)

// SessionCookieName is the cookie holding the session token.
const SessionCookieName = "ddc_session"

type contextKey int

const userContextKey contextKey = 0

// UserFrom returns the signed-in user attached by the withUser middleware.
func UserFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(userContextKey).(store.User)
	return u, ok
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

// secureRequest reports whether the browser reached us over HTTPS.
//
// X-Forwarded-Proto comes from the ALB. Trusting it can only ever add the
// Secure attribute, never remove it, so a spoofed header cannot weaken the
// cookie.
func secureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// sameSite is Lax unless the deployment puts the frontend on another site.
//
// Lax still sends the cookie on top-level navigation, so following a room link
// keeps you signed in, while blocking it on cross-site POSTs. None is needed
// when the frontend is hosted separately — a cross-site fetch drops a Lax
// cookie entirely — and browsers only accept None together with Secure.
func (s *Server) sameSite() (http.SameSite, bool) {
	if s.opts.CrossSiteCookie {
		return http.SameSiteNoneMode, true
	}
	return http.SameSiteLaxMode, false
}

func (s *Server) setSessionCookie(w http.ResponseWriter, r *http.Request, token string, expires time.Time) {
	sameSite, forceSecure := s.sameSite()
	http.SetCookie(w, &http.Cookie{
		Name:  SessionCookieName,
		Value: token,
		Path:  "/",
		// HttpOnly: script must not be able to read the session, so an XSS bug
		// in a problem statement cannot become account takeover.
		HttpOnly: true,
		Secure:   forceSecure || secureRequest(r),
		SameSite: sameSite,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	// The attributes must match the ones it was set with, or the browser keeps
	// the original cookie alongside the expired one.
	sameSite, forceSecure := s.sameSite()
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   forceSecure || secureRequest(r),
		SameSite: sameSite,
		MaxAge:   -1,
	})
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// withUser resolves the session cookie and attaches the account to the request
// context. Requests without a cookie skip the database entirely, so anonymous
// traffic — which is most of it, since rooms need no account — costs nothing.
func (s *Server) withUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(SessionCookieName)
		if err != nil || cookie.Value == "" {
			next.ServeHTTP(w, r)
			return
		}
		hash := auth.HashSessionToken(cookie.Value)
		user, err := s.store.UserBySessionToken(r.Context(), hash)
		if err != nil {
			// Expired, revoked or forged. Clear it so the browser stops sending
			// a cookie that will never work again.
			if errors.Is(err, store.ErrNotFound) {
				s.clearSessionCookie(w, r)
			} else {
				s.log.Error("resolve session", "err", err)
			}
			next.ServeHTTP(w, r)
			return
		}
		s.refreshSession(r, hash)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey, user)))
	})
}

// refreshSession slides the expiry forward, at most once an hour per session so
// that reading a page is not also a write.
func (s *Server) refreshSession(r *http.Request, hash []byte) {
	stale, err := s.store.SessionNeedsTouch(r.Context(), hash, auth.RefreshAfter)
	if err != nil || !stale {
		return
	}
	if err := s.store.TouchSession(r.Context(), hash, time.Now().Add(s.sessionTTL())); err != nil {
		s.log.Error("touch session", "err", err)
	}
}

// requireUser rejects anonymous requests.
func (s *Server) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := UserFrom(r.Context()); !ok {
			writeError(w, http.StatusUnauthorized, "sign in to do that")
			return
		}
		next(w, r)
	}
}

// requireSameOrigin is the CSRF defence for cookie-authenticated writes.
//
// Browsers send Origin on every unsafe request, including form posts, so a
// cross-site POST that rides along on the session cookie is rejected here.
// A missing Origin means the caller is not a browser (curl, the Go tests),
// which is exactly the case CSRF does not apply to — there is no cookie jar to
// borrow from.
func (s *Server) requireSameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" || s.originAllowed(origin, r) {
			next.ServeHTTP(w, r)
			return
		}
		s.log.Warn("cross-origin write rejected", "origin", origin, "path", r.URL.Path)
		writeError(w, http.StatusForbidden, "cross-origin request refused")
	})
}

func (s *Server) originAllowed(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	for _, allowed := range s.opts.AllowedOrigins {
		if strings.EqualFold(allowed, origin) {
			return true
		}
	}
	return false
}

func (s *Server) sessionTTL() time.Duration {
	if s.opts.SessionTTL > 0 {
		return s.opts.SessionTTL
	}
	return auth.DefaultSessionTTL
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type authResponse struct {
	// User is null for an anonymous caller, so the client can boot without
	// treating "not signed in" as an error.
	User *store.User `json:"user"`
}

type signupRequest struct {
	Email       string `json:"email"`
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !s.signupIPLimit.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "too many accounts from here. Try again later.")
		return
	}

	fields, errs := auth.Signup{
		Email:       req.Email,
		Handle:      req.Handle,
		DisplayName: req.DisplayName,
		Password:    req.Password,
	}.Validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}

	hash, err := auth.HashPassword(fields.Password)
	if err != nil {
		s.log.Error("hash password", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the account")
		return
	}

	user, err := s.store.CreateUser(r.Context(), fields.Email, fields.Handle, fields.DisplayName, hash)
	switch {
	case errors.Is(err, store.ErrEmailTaken):
		writeFields(w, http.StatusConflict, "That email already has an account.",
			auth.FieldErrors{"email": "That email already has an account. Sign in instead?"})
		return
	case errors.Is(err, store.ErrHandleTaken):
		writeFields(w, http.StatusConflict, "That username is taken.",
			auth.FieldErrors{"handle": "That username is taken."})
		return
	case err != nil:
		s.log.Error("create user", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the account")
		return
	}

	if !s.startSession(w, r, user) {
		return
	}
	s.log.Info("account created", "user", user.ID, "handle", user.Handle)
	writeJSON(w, http.StatusCreated, authResponse{User: &user})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	email := auth.NormalizeEmail(req.Email)

	// Two buckets. The per-address one is loose, because a shared network is
	// one address; the per-email one is tight, because that is the bucket a
	// password-guessing attempt has to go through however it is distributed.
	if !s.loginIPLimit.allow(clientIP(r)) || !s.loginEmailLimit.allow(email) {
		writeError(w, http.StatusTooManyRequests, "too many attempts. Wait a minute and try again.")
		return
	}

	// Deliberately identical for "no such account" and "wrong password":
	// anything else turns the login form into an account-existence oracle.
	const rejection = "That email and password do not match an account."

	creds, err := s.store.CredentialsByEmail(r.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		// Spend the same time a real verification would, so the response time
		// does not reveal that the account is missing.
		auth.WasteTimeLikeAVerify(req.Password)
		writeError(w, http.StatusUnauthorized, rejection)
		return
	}
	if err != nil {
		s.log.Error("load credentials", "err", err)
		writeError(w, http.StatusInternalServerError, "could not sign you in")
		return
	}

	ok, err := auth.VerifyPassword(creds.PasswordHash, req.Password)
	if err != nil {
		s.log.Error("verify password", "err", err, "user", creds.User.ID)
		writeError(w, http.StatusInternalServerError, "could not sign you in")
		return
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, rejection)
		return
	}

	// A successful sign-in clears the slate: one mistyped password should not
	// count against someone for the next quarter of an hour.
	s.loginIPLimit.reset(clientIP(r))
	s.loginEmailLimit.reset(email)

	if !s.startSession(w, r, creds.User) {
		return
	}
	writeJSON(w, http.StatusOK, authResponse{User: &creds.User})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(SessionCookieName); err == nil && cookie.Value != "" {
		if err := s.store.DeleteSession(r.Context(), auth.HashSessionToken(cookie.Value)); err != nil {
			s.log.Error("delete session", "err", err)
		}
	}
	s.clearSessionCookie(w, r)
	writeJSON(w, http.StatusOK, authResponse{User: nil})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if user, ok := UserFrom(r.Context()); ok {
		writeJSON(w, http.StatusOK, authResponse{User: &user})
		return
	}
	writeJSON(w, http.StatusOK, authResponse{User: nil})
}

type updateProfileRequest struct {
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
}

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req updateProfileRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Reuse the signup rules for the two fields being changed; the email and
	// password on the probe are the account's existing, already-valid ones.
	probe := auth.Signup{
		Email:       user.Email,
		Handle:      req.Handle,
		DisplayName: req.DisplayName,
		Password:    strings.Repeat("x", auth.MinPasswordLength),
	}
	fields, errs := probe.Validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}

	updated, err := s.store.UpdateProfile(r.Context(), user.ID, fields.Handle, fields.DisplayName)
	switch {
	case errors.Is(err, store.ErrHandleTaken):
		writeFields(w, http.StatusConflict, "That username is taken.",
			auth.FieldErrors{"handle": "That username is taken."})
		return
	case err != nil:
		s.log.Error("update profile", "err", err)
		writeError(w, http.StatusInternalServerError, "could not save your profile")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{User: &updated})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req changePasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if msg := auth.ValidatePassword(req.NewPassword); msg != "" {
		writeFields(w, http.StatusBadRequest, msg, auth.FieldErrors{"newPassword": msg})
		return
	}

	creds, err := s.store.CredentialsByEmail(r.Context(), user.Email)
	if err != nil {
		s.log.Error("load credentials", "err", err)
		writeError(w, http.StatusInternalServerError, "could not change your password")
		return
	}
	ok, err := auth.VerifyPassword(creds.PasswordHash, req.CurrentPassword)
	if err != nil || !ok {
		writeFields(w, http.StatusUnauthorized, "That is not your current password.",
			auth.FieldErrors{"currentPassword": "That is not your current password."})
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		s.log.Error("hash password", "err", err)
		writeError(w, http.StatusInternalServerError, "could not change your password")
		return
	}
	if err := s.store.UpdatePassword(r.Context(), user.ID, hash); err != nil {
		s.log.Error("update password", "err", err)
		writeError(w, http.StatusInternalServerError, "could not change your password")
		return
	}

	// Changing a password is how someone reacts to a suspected compromise, so
	// every other session must die — including any the attacker holds.
	if err := s.store.DeleteUserSessions(r.Context(), user.ID); err != nil {
		s.log.Error("revoke sessions", "err", err)
	}
	if !s.startSession(w, r, user) {
		return
	}
	s.log.Info("password changed", "user", user.ID)
	writeJSON(w, http.StatusOK, authResponse{User: &user})
}

// startSession issues a token, stores its hash and sets the cookie. It reports
// false when it has already written an error response.
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, user store.User) bool {
	token, err := auth.NewSessionToken()
	if err != nil {
		s.log.Error("new session token", "err", err)
		writeError(w, http.StatusInternalServerError, "could not start a session")
		return false
	}
	expires := time.Now().Add(s.sessionTTL())
	if err := s.store.CreateSession(r.Context(), auth.HashSessionToken(token), user.ID, expires, r.UserAgent()); err != nil {
		s.log.Error("create session", "err", err)
		writeError(w, http.StatusInternalServerError, "could not start a session")
		return false
	}
	s.setSessionCookie(w, r, token, expires)
	return true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// decodeJSON reads a small JSON body, writing a 400 and returning false if it
// cannot. The size cap keeps an oversized body from becoming a memory problem.
func decodeJSON(w http.ResponseWriter, r *http.Request, into any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if err := json.NewDecoder(r.Body).Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

// writeFields returns a message for the form plus per-field messages for the
// inputs.
func writeFields(w http.ResponseWriter, status int, message string, fields auth.FieldErrors) {
	writeJSON(w, status, map[string]any{"error": message, "fields": fields})
}
