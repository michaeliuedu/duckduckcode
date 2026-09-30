package server

import (
	"errors"
	"net/http"

	"github.com/duckduckcode/backend/internal/store"
)

type attemptRequest struct {
	// ProblemID is a problem slug.
	ProblemID string `json:"problemId"`
	// Solved is true when every case passed.
	Solved bool `json:"solved"`
}

// handleRecordAttempt notes that the signed-in person ran a problem's tests.
//
// The client reports this, because the tests run in the client. That means the
// numbers are self-reported and someone determined could inflate their own
// grid — which is fine for a practice tracker and would not be for a grade.
// The endpoint is scoped to the caller's own account, so the worst case is
// lying to yourself.
func (s *Server) handleRecordAttempt(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req attemptRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ProblemID == "" {
		writeError(w, http.StatusBadRequest, "problemId is required")
		return
	}

	err := s.store.RecordAttempt(r.Context(), user.ID, req.ProblemID, req.Solved)
	if errors.Is(err, store.ErrNotFound) {
		// A room from a deleted problem still runs its snapshotted tests; there
		// is just nothing left to attach the attempt to.
		writeJSON(w, http.StatusOK, map[string]any{"recorded": false})
		return
	}
	if err != nil {
		s.log.Error("record attempt", "err", err)
		writeError(w, http.StatusInternalServerError, "could not record that")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recorded": true})
}

// handleMyProgress returns the signed-in person's totals and activity grid.
func (s *Server) handleMyProgress(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	progress, err := s.store.ProgressOf(r.Context(), user.ID, 365)
	if err != nil {
		s.log.Error("load progress", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load your progress")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"progress": progress})
}
