package server

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/duckduckcode/backend/internal/auth"
	"github.com/duckduckcode/backend/internal/slug"
	"github.com/duckduckcode/backend/internal/store"
)

const (
	maxListTitleLength       = 120
	maxListDescriptionLength = 600
)

type listRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"`
}

func (req listRequest) validate() (title, description string, visibility store.Visibility, errs auth.FieldErrors) {
	errs = auth.FieldErrors{}
	title = strings.Join(strings.Fields(req.Title), " ")
	description = strings.TrimSpace(req.Description)

	switch {
	case title == "":
		errs["title"] = "Give the list a name."
	case utf8.RuneCountInString(title) > maxListTitleLength:
		errs["title"] = "List names are at most 120 characters."
	}
	if utf8.RuneCountInString(description) > maxListDescriptionLength {
		errs["description"] = "That description is too long."
	}

	visibility = store.Visibility(req.Visibility)
	switch visibility {
	case "":
		visibility = store.VisibilityPrivate
	case store.VisibilityPrivate, store.VisibilityUnlisted, store.VisibilityPublic:
	default:
		errs["visibility"] = "Pick private, unlisted or public."
	}
	return title, description, visibility, errs
}

func (s *Server) handleMyLists(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	lists, err := s.store.ListsOfUser(r.Context(), user.Handle, user.ID)
	if err != nil {
		s.log.Error("load lists", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load your lists")
		return
	}
	// When a problem slug is given, say which lists already hold it, so the
	// "Add to list" menu can render ticks without a second request.
	containing := []string{}
	if problem := r.URL.Query().Get("contains"); problem != "" {
		containing, err = s.store.ListIDsContaining(r.Context(), user.ID, problem)
		if err != nil {
			s.log.Error("load list membership", "err", err)
			writeError(w, http.StatusInternalServerError, "could not load your lists")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lists": lists, "containing": containing})
}

func (s *Server) handleCreateList(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req listRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	title, description, visibility, errs := req.validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}

	// Slugs are unique per owner, so only this person's lists are consulted.
	existing, err := s.store.ListsOfUser(r.Context(), user.Handle, user.ID)
	if err != nil {
		s.log.Error("load lists", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the list")
		return
	}
	taken := make(map[string]bool, len(existing))
	for _, list := range existing {
		taken[list.Slug] = true
	}
	name, err := slug.Unique(slug.Make(title), func(candidate string) (bool, error) {
		return taken[candidate], nil
	})
	if err != nil {
		s.log.Error("pick list slug", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the list")
		return
	}

	list, err := s.store.CreateList(r.Context(), user.ID, name, title, description, visibility)
	if errors.Is(err, store.ErrSlugTaken) {
		writeError(w, http.StatusConflict, "you already have a list with that name")
		return
	}
	if err != nil {
		s.log.Error("create list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the list")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"list": list})
}

func (s *Server) handleGetList(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListWithItems(r.Context(), r.PathValue("id"), s.viewerID(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "list not found")
		return
	}
	if err != nil {
		s.log.Error("load list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the list")
		return
	}
	user, signedIn := UserFrom(r.Context())
	owned := signedIn && user.Handle == list.Owner.Handle
	// A private list is the owner's alone; 404 rather than 403 so the id does
	// not confirm that a list exists.
	if list.Visibility == store.VisibilityPrivate && !owned {
		writeError(w, http.StatusNotFound, "list not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"list": list, "canEdit": owned})
}

func (s *Server) handleUpdateList(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req listRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	title, description, visibility, errs := req.validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}
	list, err := s.store.UpdateList(r.Context(), r.PathValue("id"), user.ID, title, description, visibility)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "list not found")
		return
	}
	if err != nil {
		s.log.Error("update list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not save the list")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"list": list, "canEdit": true})
}

func (s *Server) handleDeleteList(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	err := s.store.DeleteList(r.Context(), r.PathValue("id"), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "list not found")
		return
	}
	if err != nil {
		s.log.Error("delete list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not delete the list")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

type listItemRequest struct {
	ProblemID string `json:"problemId"`
}

func (s *Server) handleAddListItem(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req listItemRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	err := s.store.AddToList(r.Context(), r.PathValue("id"), user.ID, req.ProblemID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such list or problem")
		return
	}
	if err != nil {
		s.log.Error("add to list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not add to the list")
		return
	}
	s.respondWithList(w, r, r.PathValue("id"), user.ID)
}

func (s *Server) handleRemoveListItem(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	if err := s.store.RemoveFromList(r.Context(), r.PathValue("id"), user.ID, r.PathValue("problemId")); err != nil {
		s.log.Error("remove from list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not remove from the list")
		return
	}
	s.respondWithList(w, r, r.PathValue("id"), user.ID)
}

func (s *Server) respondWithList(w http.ResponseWriter, r *http.Request, id, viewerID string) {
	list, err := s.store.ListWithItems(r.Context(), id, viewerID)
	if err != nil {
		s.log.Error("reload list", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the list")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"list": list, "canEdit": true})
}
