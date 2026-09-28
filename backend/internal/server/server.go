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
	"github.com/duckduckcode/backend/internal/problems"
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
}

// Server is the HTTP handler set.
type Server struct {
	store   *store.Store
	hub     *hub.Hub
	log     *slog.Logger
	opts    Options
	handler http.Handler
	started time.Time
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
		store:   st,
		log:     log,
		opts:    opts,
		started: time.Now(),
	}
	s.hub = hub.New(st, log, hub.Options{SnapshotEvery: opts.SnapshotEvery, OriginPatterns: originPatterns})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /readyz", s.handleReadyz)
	mux.HandleFunc("GET /api/problems", s.handleListProblems)
	mux.HandleFunc("GET /api/problems/{id}", s.handleGetProblem)
	mux.HandleFunc("POST /api/rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /api/rooms/{id}", s.handleGetRoom)
	mux.HandleFunc("GET /ws/rooms/{id}", s.handleRoomSocket)

	s.handler = s.logging(s.cors(mux))
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
// Problems
// ---------------------------------------------------------------------------

func (s *Server) handleListProblems(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"problems": problems.Summaries()})
}

func (s *Server) handleGetProblem(w http.ResponseWriter, r *http.Request) {
	p, ok := problems.Get(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

type createRoomRequest struct {
	Mode      string `json:"mode"`
	ProblemID string `json:"problemId"`
}

// RoomResponse is the payload returned for room creation and lookup.
type RoomResponse struct {
	Room    store.Room        `json:"room"`
	Problem *problems.Problem `json:"problem,omitempty"`
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	var (
		mode      store.Mode
		problemID *string
		problem   *problems.Problem
		seed      []byte
	)
	switch store.Mode(req.Mode) {
	case store.ModePractice:
		p, ok := problems.Get(req.ProblemID)
		if !ok {
			writeError(w, http.StatusBadRequest, "unknown problemId")
			return
		}
		mode = store.ModePractice
		problem = &p
		problemID = &p.ID
		seed = yproto.SeedTextUpdate(SeedClientID, "content", p.StarterCode)
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

	room, err := s.store.CreateRoom(r.Context(), mode, problemID, problems.Language, seed)
	if err != nil {
		s.log.Error("create room", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create room")
		return
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
	resp := RoomResponse{Room: room}
	if room.ProblemID != nil {
		if p, ok := problems.Get(*room.ProblemID); ok {
			resp.Problem = &p
		}
	}
	writeJSON(w, http.StatusOK, resp)
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
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type")
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
