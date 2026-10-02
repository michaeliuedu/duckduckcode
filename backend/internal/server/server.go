// Package server wires the HTTP API, health checks and WebSocket endpoint.
package server

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/duckduckcode/backend/internal/hub"
	"github.com/duckduckcode/backend/internal/seed"
	"github.com/duckduckcode/backend/internal/store"
	"github.com/duckduckcode/backend/internal/yproto"
)

// Options configures the server.
type Options struct {
	// AllowedOrigins are full origins (scheme://host[:port]) permitted for
	// CORS and cross-origin WebSocket upgrades. Empty = same-origin only.
	AllowedOrigins []string
	SnapshotEvery  int
	Version        string
	// SessionTTL is how long a login lasts without use. Zero means
	// auth.DefaultSessionTTL.
	SessionTTL time.Duration
	// CrossSiteCookie sends the session cookie as SameSite=None; Secure, for a
	// frontend hosted on a different site from this API. See config.Config.
	CrossSiteCookie bool
	// Rate limits; zero means the default. LoginAttemptsPerIP and SignupsPerIP
	// are per quarter hour and per hour respectively, and exist to blunt floods
	// rather than to stop a targeted attack — many legitimate people can share
	// one address. LoginAttemptsPerEmail is the one that matters for guessing.
	LoginAttemptsPerIP    int
	LoginAttemptsPerEmail int
	SignupsPerIP          int
}

func orDefault(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

// Server is the HTTP handler set.
type Server struct {
	store   *store.Store
	hub     *hub.Hub
	log     *slog.Logger
	opts    Options
	handler http.Handler
	started time.Time

	// Guard rails on the two endpoints worth attacking. Per-IP limits are
	// generous because a lecture hall behind one campus NAT is a single address
	// as far as we can tell; the tight limit is per email, which is what
	// actually stops someone grinding a password.
	loginIPLimit    *limiter
	loginEmailLimit *limiter
	signupIPLimit   *limiter
}

// New builds the server and its routes.
func New(st *store.Store, log *slog.Logger, opts Options) *Server {
	var originPatterns []string
	for _, o := range opts.AllowedOrigins {
		if u, err := url.Parse(o); err == nil && u.Host != "" {
			originPatterns = append(originPatterns, u.Host)
		}
	}
	s := &Server{
		store:           st,
		log:             log,
		opts:            opts,
		started:         time.Now(),
		loginIPLimit:    newLimiter(orDefault(opts.LoginAttemptsPerIP, 30), 15*time.Minute),
		loginEmailLimit: newLimiter(orDefault(opts.LoginAttemptsPerEmail, 5), 15*time.Minute),
		signupIPLimit:   newLimiter(orDefault(opts.SignupsPerIP, 30), time.Hour),
	}
	s.hub = hub.New(st, log, hub.Options{SnapshotEvery: opts.SnapshotEvery, OriginPatterns: originPatterns})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleReadyz)

	// Accounts. Rooms deliberately need none of this: a link is still enough
	// to join and edit, which is the whole point of sharing one.
	mux.HandleFunc("POST /api/auth/signup", s.handleSignup)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/auth/me", s.handleMe)
	mux.HandleFunc("PATCH /api/auth/profile", s.requireUser(s.handleUpdateProfile))
	mux.HandleFunc("POST /api/auth/password", s.requireUser(s.handleChangePassword))
	// Problems. Browsing is open to everyone; writing needs an account, and
	// every write re-checks ownership in the handler.
	mux.HandleFunc("GET /api/home", s.handleHomeFeed)
	mux.HandleFunc("GET /api/problems", s.handleListProblems)
	mux.HandleFunc("GET /api/problems/{slug}", s.handleGetProblem)
	mux.HandleFunc("POST /api/problems", s.requireUser(s.handleCreateProblem))
	mux.HandleFunc("PATCH /api/problems/{slug}", s.requireUser(s.handleUpdateProblem))
	mux.HandleFunc("PUT /api/problems/{slug}/visibility", s.requireUser(s.handleSetProblemVisibility))
	mux.HandleFunc("DELETE /api/problems/{slug}", s.requireUser(s.handleDeleteProblem))

	// Lists.
	mux.HandleFunc("GET /api/lists", s.requireUser(s.handleMyLists))
	mux.HandleFunc("POST /api/lists", s.requireUser(s.handleCreateList))
	mux.HandleFunc("GET /api/lists/{id}", s.handleGetList)
	mux.HandleFunc("PATCH /api/lists/{id}", s.requireUser(s.handleUpdateList))
	mux.HandleFunc("DELETE /api/lists/{id}", s.requireUser(s.handleDeleteList))
	mux.HandleFunc("POST /api/lists/{id}/items", s.requireUser(s.handleAddListItem))
	mux.HandleFunc("DELETE /api/lists/{id}/items/{problemId}", s.requireUser(s.handleRemoveListItem))

	mux.HandleFunc("GET /api/users/{handle}", s.handleGetProfile)

	// Progress. Self-reported, because the tests run in the browser.
	mux.HandleFunc("POST /api/progress", s.requireUser(s.handleRecordAttempt))
	mux.HandleFunc("GET /api/progress", s.requireUser(s.handleMyProgress))

	mux.HandleFunc("POST /api/rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /api/rooms/{id}", s.handleGetRoom)
	mux.HandleFunc("GET /ws/rooms/{id}", s.handleRoomSocket)

	// Outermost first: log everything, answer CORS preflights before anything
	// else looks at the request, refuse cross-origin writes, then resolve the
	// session so handlers can read it.
	s.handler = s.logging(s.cors(s.requireSameOrigin(s.withUser(mux))))
	return s
}

// Handler returns the root HTTP handler.
func (s *Server) Handler() http.Handler { return s.handler }

// Hub exposes the WebSocket hub (for shutdown and tests).
func (s *Server) Hub() *hub.Hub { return s.hub }

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"version": s.opts.Version,
		"uptime":  time.Since(s.started).Round(time.Second).String(),
	})
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "unavailable", "error": "database unreachable"})
		return
	}
	st := s.hub.Stats()
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "rooms": st.Rooms, "clients": st.Clients})
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

type createRoomRequest struct {
	Mode string `json:"mode"`
	// ProblemID is a problem slug.
	ProblemID string `json:"problemId"`
}

// RoomResponse is the payload returned for room creation and lookup.
//
// Problem is the copy stored with the room, not a live read: an author editing
// their problem must not change what a pair is already looking at.
type RoomResponse struct {
	Room    store.Room     `json:"room"`
	Problem *store.Problem `json:"problem,omitempty"`
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	var (
		mode      store.Mode
		problemID *string
		problem   *store.Problem
		seedBytes []byte
		snapshot  []byte
		language  = seed.Language
	)

	switch store.Mode(req.Mode) {
	case store.ModePractice:
		found, err := s.store.ProblemBySlug(r.Context(), req.ProblemID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusBadRequest, "unknown problemId")
			return
		}
		if err != nil {
			s.log.Error("load problem", "err", err)
			writeError(w, http.StatusInternalServerError, "could not create room")
			return
		}
		// A draft is not something to start a room from unless it is yours.
		if found.Visibility == store.VisibilityDraft && !s.isAuthor(r, found) {
			writeError(w, http.StatusBadRequest, "unknown problemId")
			return
		}

		encoded, err := json.Marshal(found)
		if err != nil {
			s.log.Error("encode problem snapshot", "err", err)
			writeError(w, http.StatusInternalServerError, "could not create room")
			return
		}
		mode = store.ModePractice
		problem = &found
		problemID = &found.ID
		snapshot = encoded
		language = found.Language
		seedBytes = yproto.SeedTextUpdate(SeedClientID, "content", found.StarterCode)

	case store.ModeBlank:
		if req.ProblemID != "" {
			writeError(w, http.StatusBadRequest, "problemId is only valid for practice mode")
			return
		}
		mode = store.ModeBlank

	default:
		writeError(w, http.StatusBadRequest, `mode must be "practice" or "blank"`)
		return
	}

	room, err := s.store.CreateRoom(r.Context(), mode, problemID, language, seedBytes, snapshot)
	if err != nil {
		s.log.Error("create room", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create room")
		return
	}
	if problem != nil {
		// Popularity is "how many rooms were started from this", counted here.
		// Failing to count is not a reason to fail the room.
		if err := s.store.NoteProblemUsed(r.Context(), problem.ID); err != nil {
			s.log.Error("count problem use", "err", err, "slug", problem.ID)
		}
	}
	s.log.Info("room created", "room", room.ID, "mode", room.Mode, "problem", req.ProblemID)
	writeJSON(w, http.StatusCreated, RoomResponse{Room: room, Problem: problem})
}

func (s *Server) handleGetRoom(w http.ResponseWriter, r *http.Request) {
	room, err := s.store.GetRoom(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	if err != nil {
		s.log.Error("get room", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load room")
		return
	}
	writeJSON(w, http.StatusOK, RoomResponse{Room: room, Problem: s.roomProblem(r, room)})
}

// roomProblem returns the problem a room displays: its own snapshot, or — for
// rooms created before snapshots existed — a live lookup by slug.
func (s *Server) roomProblem(r *http.Request, room store.Room) *store.Problem {
	if len(room.ProblemSnapshot) > 0 {
		var problem store.Problem
		if err := json.Unmarshal(room.ProblemSnapshot, &problem); err == nil {
			return &problem
		}
		s.log.Error("decode room problem snapshot", "room", room.ID)
	}
	if room.ProblemID == nil {
		return nil
	}
	problem, err := s.store.ProblemBySlug(r.Context(), *room.ProblemID)
	if err != nil {
		// The problem was deleted or renamed. The room still works; it just
		// has no statement to show.
		return nil
	}
	return &problem
}

func (s *Server) handleRoomSocket(w http.ResponseWriter, r *http.Request) {
	s.hub.ServeRoom(w, r, r.PathValue("id"))
}

// SeedClientID is the Yjs client id used for server-authored seed updates.
// Yjs clients pick random 32-bit ids, so a fixed value has a negligible chance
// of colliding and keeps the seed update deterministic.
const SeedClientID uint32 = 0xD0C5EED

// ---------------------------------------------------------------------------
// Middleware & helpers
// ---------------------------------------------------------------------------

// allowedMethods is advertised in the CORS preflight response.
const allowedMethods = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range s.opts.AllowedOrigins {
		allowed[strings.ToLower(o)] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[strings.ToLower(origin)] {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			// Every method the routes actually use. Missing one here fails only
			// cross-origin — which in practice means local development and the
			// e2e suite, never production, where everything is same-origin.
			// TestCORSAllowsEveryMethodTheRoutesUse guards against drift.
			h.Set("Access-Control-Allow-Methods", allowedMethods)
			h.Set("Access-Control-Allow-Headers", "Content-Type")
			// The session lives in a cookie, so a cross-origin frontend (local
			// development against a remote backend) has to be allowed to send
			// it. Safe only because the allow-list is explicit: it is never "*".
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Max-Age", "600")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Unwrap lets http.ResponseController reach the underlying writer (needed
// for WebSocket hijacking through the middleware chain).
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// Hijack forwards to the underlying writer for libraries that type-assert
// http.Hijacker directly.
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := r.ResponseWriter.(http.Hijacker); ok {
		r.status = http.StatusSwitchingProtocols
		return hj.Hijack()
	}
	return nil, nil, errors.New("response writer does not support hijacking")
}

// Flush forwards to the underlying writer when supported.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		lvl := slog.LevelInfo
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			lvl = slog.LevelDebug
		}
		s.log.Log(r.Context(), lvl, "http",
			"method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration", time.Since(start).Round(time.Microsecond).String(), "remote", r.RemoteAddr)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
