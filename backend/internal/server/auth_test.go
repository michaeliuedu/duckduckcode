package server_test

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/duckduckcode/backend/internal/server"
	"github.com/duckduckcode/backend/internal/store"
	"github.com/duckduckcode/backend/internal/testutil"
)

// Each test needs its own email and handle: the schema is migrated once per
// test binary, so accounts created by one test are still there for the next.
var accountSeq atomic.Int64

func uniqueAccount() (email, handle string) {
	n := accountSeq.Add(1)
	return fmt.Sprintf("ana%d@example.edu", n), fmt.Sprintf("ana%d", n)
}

// client is an http.Client with a cookie jar, i.e. a browser-like session.
func client(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar}
}

type authBody struct {
	User *struct {
		ID          string `json:"id"`
		Email       string `json:"email"`
		Handle      string `json:"handle"`
		DisplayName string `json:"displayName"`
	} `json:"user"`
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields"`
}

func post(t *testing.T, c *http.Client, url, body string) (int, authBody) {
	t.Helper()
	return do(t, c, http.MethodPost, url, body, nil)
}

func do(t *testing.T, c *http.Client, method, url, body string, headers map[string]string) (int, authBody) {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out authBody
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return resp.StatusCode, out
}

func get(t *testing.T, c *http.Client, url string) (int, authBody) {
	t.Helper()
	return do(t, c, http.MethodGet, url, "", nil)
}

// signUp registers a fresh account and returns the signed-in client.
func signUp(t *testing.T, ts *httptest.Server) (*http.Client, string, string) {
	t.Helper()
	c := client(t)
	email, handle := uniqueAccount()
	status, body := post(t, c, ts.URL+"/api/auth/signup", fmt.Sprintf(
		`{"email":%q,"handle":%q,"displayName":"Ana the Great","password":"a good long password"}`, email, handle))
	if status != http.StatusCreated {
		t.Fatalf("signup: status %d (%s %v)", status, body.Error, body.Fields)
	}
	return c, email, handle
}

// ---------------------------------------------------------------------------
// Signing up and in
// ---------------------------------------------------------------------------

func TestSignupCreatesAnAccountAndSignsIn(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, email, handle := signUp(t, ts)

	status, body := get(t, c, ts.URL+"/api/auth/me")
	if status != http.StatusOK {
		t.Fatalf("me: status %d", status)
	}
	if body.User == nil {
		t.Fatal("signup did not leave the caller signed in")
	}
	if body.User.Email != email || body.User.Handle != handle {
		t.Fatalf("unexpected account: %+v", body.User)
	}
	if body.User.DisplayName != "Ana the Great" {
		t.Fatalf("display name: %q", body.User.DisplayName)
	}
}

func TestSignupSetsAnHttpOnlySessionCookie(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c := client(t)
	email, handle := uniqueAccount()

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/signup", strings.NewReader(
		fmt.Sprintf(`{"email":%q,"handle":%q,"displayName":"Ana","password":"a good long password"}`, email, handle)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var session *http.Cookie
	for _, cookie := range resp.Cookies() {
		if cookie.Name == server.SessionCookieName {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("no session cookie was set")
	}
	if !session.HttpOnly {
		t.Error("session cookie must be HttpOnly so script cannot read it")
	}
	if session.SameSite != http.SameSiteLaxMode {
		t.Errorf("session cookie should be SameSite=Lax, got %v", session.SameSite)
	}
	if session.Path != "/" {
		t.Errorf("session cookie path: %q", session.Path)
	}
	if session.Value == "" {
		t.Error("session cookie is empty")
	}
}

func TestSignupNormalizesEmailAndHandle(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c := client(t)
	email, handle := uniqueAccount()

	status, body := post(t, c, ts.URL+"/api/auth/signup", fmt.Sprintf(
		`{"email":"  %s  ","handle":"@%s","displayName":"  Ana   B  ","password":"a good long password"}`,
		strings.ToUpper(email), strings.ToUpper(handle)))
	if status != http.StatusCreated {
		t.Fatalf("status %d: %s %v", status, body.Error, body.Fields)
	}
	if body.User.Email != email {
		t.Errorf("email not normalised: %q", body.User.Email)
	}
	if body.User.Handle != handle {
		t.Errorf("handle not normalised: %q", body.User.Handle)
	}
	if body.User.DisplayName != "Ana B" {
		t.Errorf("display name not normalised: %q", body.User.DisplayName)
	}
}

func TestSignupRejectsDuplicateEmailAndHandle(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, email, handle := signUp(t, ts)

	otherEmail, otherHandle := uniqueAccount()

	status, body := post(t, client(t), ts.URL+"/api/auth/signup", fmt.Sprintf(
		`{"email":%q,"handle":%q,"displayName":"Imposter","password":"a good long password"}`, email, otherHandle))
	if status != http.StatusConflict {
		t.Fatalf("duplicate email: status %d", status)
	}
	if _, ok := body.Fields["email"]; !ok {
		t.Errorf("duplicate email should point at the email field, got %v", body.Fields)
	}

	status, body = post(t, client(t), ts.URL+"/api/auth/signup", fmt.Sprintf(
		`{"email":%q,"handle":%q,"displayName":"Imposter","password":"a good long password"}`, otherEmail, handle))
	if status != http.StatusConflict {
		t.Fatalf("duplicate handle: status %d", status)
	}
	if _, ok := body.Fields["handle"]; !ok {
		t.Errorf("duplicate handle should point at the handle field, got %v", body.Fields)
	}
}

func TestSignupReportsPerFieldValidationErrors(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	status, body := post(t, client(t), ts.URL+"/api/auth/signup",
		`{"email":"nope","handle":"x","displayName":"","password":"short"}`)
	if status != http.StatusBadRequest {
		t.Fatalf("status %d", status)
	}
	for _, field := range []string{"email", "handle", "password"} {
		if _, ok := body.Fields[field]; !ok {
			t.Errorf("expected an error on %q, got %v", field, body.Fields)
		}
	}
}

func TestSignupNeverReturnsThePasswordHash(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c := client(t)
	email, handle := uniqueAccount()
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/signup", strings.NewReader(fmt.Sprintf(
		`{"email":%q,"handle":%q,"displayName":"Ana","password":"a good long password"}`, email, handle)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	for _, leak := range []string{"argon2", "password", "hash"} {
		if strings.Contains(strings.ToLower(string(raw)), leak) {
			t.Fatalf("signup response mentions %q: %s", leak, raw)
		}
	}
}

func TestLogin(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, email, _ := signUp(t, ts)

	fresh := client(t)
	status, body := post(t, fresh, ts.URL+"/api/auth/login",
		fmt.Sprintf(`{"email":%q,"password":"a good long password"}`, email))
	if status != http.StatusOK {
		t.Fatalf("login: status %d (%s)", status, body.Error)
	}
	if body.User == nil || body.User.Email != email {
		t.Fatalf("unexpected login response: %+v", body)
	}

	_, me := get(t, fresh, ts.URL+"/api/auth/me")
	if me.User == nil {
		t.Fatal("login did not establish a session")
	}
}

func TestLoginIsNotAnAccountOracle(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, email, _ := signUp(t, ts)

	_, wrongPassword := post(t, client(t), ts.URL+"/api/auth/login",
		fmt.Sprintf(`{"email":%q,"password":"not the password"}`, email))
	_, noSuchAccount := post(t, client(t), ts.URL+"/api/auth/login",
		`{"email":"nobody-at-all@example.edu","password":"not the password"}`)

	if wrongPassword.Error == "" {
		t.Fatal("expected an error message")
	}
	if wrongPassword.Error != noSuchAccount.Error {
		t.Fatalf("a wrong password and a missing account must be indistinguishable:\n  %q\n  %q",
			wrongPassword.Error, noSuchAccount.Error)
	}
}

func TestLoginWithTheWrongPasswordLeavesYouSignedOut(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, email, _ := signUp(t, ts)

	c := client(t)
	status, _ := post(t, c, ts.URL+"/api/auth/login", fmt.Sprintf(`{"email":%q,"password":"wrong"}`, email))
	if status != http.StatusUnauthorized {
		t.Fatalf("status %d", status)
	}
	_, me := get(t, c, ts.URL+"/api/auth/me")
	if me.User != nil {
		t.Fatal("a failed login created a session")
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, email, _ := signUp(t, ts)

	// The limiter allows 10 attempts per IP per quarter hour. Every request in
	// this test comes from the same loopback address.
	var sawTooMany bool
	for i := 0; i < 15; i++ {
		status, _ := post(t, client(t), ts.URL+"/api/auth/login",
			fmt.Sprintf(`{"email":%q,"password":"wrong guess"}`, email))
		if status == http.StatusTooManyRequests {
			sawTooMany = true
			break
		}
	}
	if !sawTooMany {
		t.Fatal("password guessing was never rate limited")
	}
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

func TestMeIsAnonymousWithoutACookie(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	status, body := get(t, client(t), ts.URL+"/api/auth/me")
	// Never 401: the SPA calls this on boot and "signed out" is not an error.
	if status != http.StatusOK {
		t.Fatalf("status %d", status)
	}
	if body.User != nil {
		t.Fatalf("expected no user, got %+v", body.User)
	}
}

func TestLogoutRevokesTheSessionServerSide(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, _, _ := signUp(t, ts)

	// Keep the cookie so we can replay it after logging out.
	var stolen *http.Cookie
	for _, cookie := range c.Jar.Cookies(mustURL(t, ts.URL)) {
		if cookie.Name == server.SessionCookieName {
			stolen = cookie
		}
	}
	if stolen == nil {
		t.Fatal("no session cookie to steal")
	}

	if status, _ := post(t, c, ts.URL+"/api/auth/logout", ""); status != http.StatusOK {
		t.Fatalf("logout: status %d", status)
	}
	if _, me := get(t, c, ts.URL+"/api/auth/me"); me.User != nil {
		t.Fatal("still signed in after logout")
	}

	// The real check: replaying the old cookie must not work either. If logout
	// only cleared the cookie, this would still authenticate.
	replay := client(t)
	replay.Jar.SetCookies(mustURL(t, ts.URL), []*http.Cookie{stolen})
	if _, me := get(t, replay, ts.URL+"/api/auth/me"); me.User != nil {
		t.Fatal("a logged-out session token still authenticates")
	}
}

func TestForgedSessionCookieIsRejected(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c := client(t)
	c.Jar.SetCookies(mustURL(t, ts.URL), []*http.Cookie{{
		Name:  server.SessionCookieName,
		Value: "definitely-not-a-real-token",
	}})
	status, body := get(t, c, ts.URL+"/api/auth/me")
	if status != http.StatusOK || body.User != nil {
		t.Fatalf("a forged cookie authenticated: status %d user %+v", status, body.User)
	}
}

func TestChangingThePasswordRevokesOtherSessions(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	first, email, _ := signUp(t, ts)

	// A second device signs in to the same account.
	second := client(t)
	if status, _ := post(t, second, ts.URL+"/api/auth/login",
		fmt.Sprintf(`{"email":%q,"password":"a good long password"}`, email)); status != http.StatusOK {
		t.Fatal("second sign-in failed")
	}

	status, body := post(t, first, ts.URL+"/api/auth/password",
		`{"currentPassword":"a good long password","newPassword":"an even better password"}`)
	if status != http.StatusOK {
		t.Fatalf("change password: status %d (%s %v)", status, body.Error, body.Fields)
	}

	// The device that made the change stays signed in...
	if _, me := get(t, first, ts.URL+"/api/auth/me"); me.User == nil {
		t.Error("changing the password signed out the device that did it")
	}
	// ...and every other session is gone, which is the point of doing it.
	if _, me := get(t, second, ts.URL+"/api/auth/me"); me.User != nil {
		t.Error("the other session survived a password change")
	}

	// The new password works and the old one does not.
	if status, _ := post(t, client(t), ts.URL+"/api/auth/login",
		fmt.Sprintf(`{"email":%q,"password":"an even better password"}`, email)); status != http.StatusOK {
		t.Error("the new password does not work")
	}
	if status, _ := post(t, client(t), ts.URL+"/api/auth/login",
		fmt.Sprintf(`{"email":%q,"password":"a good long password"}`, email)); status == http.StatusOK {
		t.Error("the old password still works")
	}
}

func TestChangePasswordRequiresTheCurrentOne(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, _, _ := signUp(t, ts)

	status, body := post(t, c, ts.URL+"/api/auth/password",
		`{"currentPassword":"not it","newPassword":"an even better password"}`)
	if status != http.StatusUnauthorized {
		t.Fatalf("status %d", status)
	}
	if _, ok := body.Fields["currentPassword"]; !ok {
		t.Errorf("expected an error on currentPassword, got %v", body.Fields)
	}
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

func TestUpdateProfile(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, _, _ := signUp(t, ts)
	_, newHandle := uniqueAccount()

	status, body := do(t, c, http.MethodPatch, ts.URL+"/api/auth/profile",
		fmt.Sprintf(`{"handle":%q,"displayName":"Ana B"}`, newHandle), nil)
	if status != http.StatusOK {
		t.Fatalf("status %d (%s %v)", status, body.Error, body.Fields)
	}
	if body.User.Handle != newHandle || body.User.DisplayName != "Ana B" {
		t.Fatalf("profile not updated: %+v", body.User)
	}
}

func TestUpdateProfileRequiresSigningIn(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	status, _ := do(t, client(t), http.MethodPatch, ts.URL+"/api/auth/profile",
		`{"handle":"someone","displayName":"Someone"}`, nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous profile edit returned %d, want 401", status)
	}
}

func TestUpdateProfileRejectsATakenHandle(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	_, _, taken := signUp(t, ts)
	c, _, _ := signUp(t, ts)

	status, body := do(t, c, http.MethodPatch, ts.URL+"/api/auth/profile",
		fmt.Sprintf(`{"handle":%q,"displayName":"Ana"}`, taken), nil)
	if status != http.StatusConflict {
		t.Fatalf("status %d", status)
	}
	if _, ok := body.Fields["handle"]; !ok {
		t.Errorf("expected an error on handle, got %v", body.Fields)
	}
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

func TestCrossOriginWriteIsRefused(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, _, _ := signUp(t, ts)

	// A form on evil.example submitting to our API, carrying the session
	// cookie the browser attaches automatically.
	status, _ := do(t, c, http.MethodPatch, ts.URL+"/api/auth/profile",
		`{"handle":"stolen","displayName":"Stolen"}`,
		map[string]string{"Origin": "https://evil.example"})
	if status != http.StatusForbidden {
		t.Fatalf("cross-origin write returned %d, want 403", status)
	}
}

func TestSameOriginWriteIsAllowed(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	c, _, _ := signUp(t, ts)
	_, newHandle := uniqueAccount()

	status, body := do(t, c, http.MethodPatch, ts.URL+"/api/auth/profile",
		fmt.Sprintf(`{"handle":%q,"displayName":"Ana"}`, newHandle),
		map[string]string{"Origin": ts.URL})
	if status != http.StatusOK {
		t.Fatalf("same-origin write returned %d (%s %v)", status, body.Error, body.Fields)
	}
}

func TestCrossOriginReadIsAllowed(t *testing.T) {
	ts, _ := newTestServer(t, 200)
	// GET is safe: the origin check exists to stop state changes, and blocking
	// reads here would break nothing an attacker cares about while breaking
	// legitimate clients.
	status, _ := do(t, client(t), http.MethodGet, ts.URL+"/api/auth/me", "",
		map[string]string{"Origin": "https://somewhere.example"})
	if status != http.StatusOK {
		t.Fatalf("cross-origin read returned %d", status)
	}
}

// ---------------------------------------------------------------------------
// Rooms stay anonymous
// ---------------------------------------------------------------------------

func TestRoomsStillWorkWithoutAnAccount(t *testing.T) {
	ts, _ := newTestServer(t, 200)

	// The whole point of a room link: it is enough on its own.
	status, created := createRoom(t, ts, `{"mode":"blank"}`)
	if status != http.StatusCreated {
		t.Fatalf("anonymous room creation returned %d", status)
	}

	status, _ = get(t, client(t), ts.URL+"/api/rooms/"+created.Room.ID)
	if status != http.StatusOK {
		t.Fatalf("anonymous room lookup returned %d", status)
	}
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// TestCORSAllowsEveryMethodTheRoutesUse guards a failure mode that only shows
// up cross-origin: the frontend on :3000 talking to the backend on :8080, which
// is exactly the local development and end-to-end setup. In production both
// share an origin, so a missing method here would never be noticed there.
func TestCORSAllowsEveryMethodTheRoutesUse(t *testing.T) {
	const origin = "http://localhost:3000"
	st := store.New(testutil.Pool(t))
	srv := server.New(st, slog.New(slog.NewTextHandler(io.Discard, nil)), server.Options{
		SnapshotEvery:  200,
		Version:        "test",
		AllowedOrigins: []string{origin},
	})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	req, err := http.NewRequest(http.MethodOptions, ts.URL+"/api/problems/anything/visibility", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", origin)
	req.Header.Set("Access-Control-Request-Method", http.MethodPut)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	allowed := resp.Header.Get("Access-Control-Allow-Methods")
	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"} {
		if !strings.Contains(allowed, method) {
			t.Errorf("preflight does not allow %s; got %q", method, allowed)
		}
	}
	if resp.Header.Get("Access-Control-Allow-Credentials") != "true" {
		t.Error("the session cookie cannot be sent cross-origin without allow-credentials")
	}
}
