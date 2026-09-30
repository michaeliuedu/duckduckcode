package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/duckduckcode/backend/internal/auth"
	"github.com/duckduckcode/backend/internal/seed"
	"github.com/duckduckcode/backend/internal/slug"
	"github.com/duckduckcode/backend/internal/store"
)

// Limits on what an author may submit. The database enforces these too; here
// they exist to produce a message pointing at the field rather than a 500.
const (
	maxTitleLength     = 120
	maxSummaryLength   = 300
	maxStatementLength = 20000
	maxStarterLength   = 20000
	maxExamples        = 12
	maxTests           = 40
	maxTestJSONLength  = 4000
)

var difficulties = map[string]bool{"easy": true, "medium": true, "hard": true}

// ---------------------------------------------------------------------------
// Browsing
// ---------------------------------------------------------------------------

// handleHomeFeed is what the front page asks for: the problems that ship with
// the app, then what people actually use, then what is new.
//
// One request rather than three, because the page is useless until all of them
// have arrived and three round trips would only make it slower.
func (s *Server) handleHomeFeed(w http.ResponseWriter, r *http.Request) {
	viewer := s.viewerID(r)
	official := true
	community := false

	// Curated rather than popular: these are a sequence that builds on itself,
	// and the first one should be the first one.
	officialProblems, err := s.store.ListProblems(r.Context(), store.ProblemQuery{
		Official: &official, Sort: store.SortCurated, Limit: 20, ViewerID: viewer,
	})
	if err != nil {
		s.log.Error("home: official", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load problems")
		return
	}
	officialProblems = inSeedOrder(officialProblems)
	popular, err := s.store.ListProblems(r.Context(), store.ProblemQuery{
		Official: &community, Sort: store.SortPopular, Limit: 12, ViewerID: viewer,
	})
	if err != nil {
		s.log.Error("home: popular", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load problems")
		return
	}
	recent, err := s.store.ListProblems(r.Context(), store.ProblemQuery{
		Official: &community, Sort: store.SortRecent, Limit: 12, ViewerID: viewer,
	})
	if err != nil {
		s.log.Error("home: recent", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load problems")
		return
	}

	// A problem nobody has opened yet has no popularity to speak of, and
	// showing the same rows twice makes the page look emptier than it is.
	popular = withRooms(popular)
	recent = excluding(recent, popular)

	payload := map[string]any{
		"official": officialProblems,
		"popular":  popular,
		"recent":   recent,
	}
	if viewer != "" {
		progress, err := s.store.ProgressOf(r.Context(), viewer, 365)
		if err != nil {
			// The feed is still useful without it; a broken grid is not worth
			// a blank page.
			s.log.Error("home: progress", "err", err)
		} else {
			payload["progress"] = progress
		}
		payload["solved"] = s.solvedAmong(r, viewer, officialProblems, popular, recent)
	}
	writeJSON(w, http.StatusOK, payload)
}

// solvedAmong returns the slugs in these listings that the viewer has solved,
// so every row can show a tick from one query.
func (s *Server) solvedAmong(r *http.Request, viewer string, groups ...[]store.ProblemSummary) []string {
	var slugs []string
	for _, group := range groups {
		for _, item := range group {
			slugs = append(slugs, item.ID)
		}
	}
	solved, err := s.store.SolvedSlugs(r.Context(), viewer, slugs)
	if err != nil {
		s.log.Error("load solved", "err", err)
		return []string{}
	}
	out := []string{}
	for slug := range solved {
		out = append(out, slug)
	}
	return out
}

func withRooms(items []store.ProblemSummary) []store.ProblemSummary {
	out := []store.ProblemSummary{}
	for _, item := range items {
		if item.RoomCount > 0 {
			out = append(out, item)
		}
	}
	return out
}

func excluding(items, exclude []store.ProblemSummary) []store.ProblemSummary {
	seen := make(map[string]bool, len(exclude))
	for _, item := range exclude {
		seen[item.ID] = true
	}
	out := []store.ProblemSummary{}
	for _, item := range items {
		if !seen[item.ID] {
			out = append(out, item)
		}
	}
	return out
}

func (s *Server) handleListProblems(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	q := store.ProblemQuery{
		Text:         strings.TrimSpace(query.Get("q")),
		Difficulty:   query.Get("difficulty"),
		AuthorHandle: auth.NormalizeHandle(query.Get("author")),
		Sort:         store.ProblemSort(query.Get("sort")),
		Limit:        intParam(query.Get("limit"), 50),
		Offset:       intParam(query.Get("offset"), 0),
		ViewerID:     s.viewerID(r),
	}
	if q.Difficulty != "" && !difficulties[q.Difficulty] {
		writeError(w, http.StatusBadRequest, "difficulty must be easy, medium or hard")
		return
	}
	if official := query.Get("official"); official != "" {
		value := official == "true"
		q.Official = &value
	}
	if q.Sort == "" {
		// A search wants the best match first; a browse wants the most used;
		// the shipped problems want the order they were curated in.
		q.Sort = store.SortPopular
		switch {
		case q.Text != "":
			q.Sort = store.SortRelevance
		case q.Official != nil && *q.Official:
			q.Sort = store.SortCurated
		}
	}

	problems, err := s.store.ListProblems(r.Context(), q)
	if err != nil {
		s.log.Error("list problems", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load problems")
		return
	}
	if q.Sort == store.SortCurated {
		problems = inSeedOrder(problems)
	}
	writeJSON(w, http.StatusOK, map[string]any{"problems": problems})
}

// inSeedOrder puts the shipped problems back into catalog order.
//
// The catalog is an ordered list in Go and the database has no column for
// "position in a curated sequence" — for ten rows it does not need one. The
// query orders by publication date, which is the right shape and is usually
// also the right answer; this makes it exact, including after a single problem
// has been re-seeded and carries a newer timestamp than the rest.
//
// Anything not in the catalog keeps its existing position at the end, so this
// cannot drop a row it does not recognise.
func inSeedOrder(problems []store.ProblemSummary) []store.ProblemSummary {
	catalog := seed.Problems()
	rank := make(map[string]int, len(catalog))
	for i, p := range catalog {
		rank[p.Slug] = i
	}
	sort.SliceStable(problems, func(i, j int) bool {
		a, aok := rank[problems[i].ID]
		b, bok := rank[problems[j].ID]
		if aok != bok {
			return aok
		}
		return aok && a < b
	})
	return problems
}

func intParam(raw string, fallback int) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

// viewerID is the signed-in user's id, or "" — used to decide whether drafts
// are visible in a listing.
func (s *Server) viewerID(r *http.Request) string {
	if user, ok := UserFrom(r.Context()); ok {
		return user.ID
	}
	return ""
}

func (s *Server) handleGetProblem(w http.ResponseWriter, r *http.Request) {
	problem, err := s.store.ProblemBySlug(r.Context(), r.PathValue("slug"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	if err != nil {
		s.log.Error("get problem", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the problem")
		return
	}
	// A draft belongs to its author alone. 404 rather than 403, so the URL
	// does not confirm that a draft with that name exists.
	if problem.Visibility == store.VisibilityDraft && !s.isAuthor(r, problem) {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	writeJSON(w, http.StatusOK, problemResponse(problem, s.isAuthor(r, problem)))
}

func (s *Server) isAuthor(r *http.Request, problem store.Problem) bool {
	user, ok := UserFrom(r.Context())
	return ok && user.Handle == problem.Author.Handle
}

// problemResponse adds whether the caller may edit, so the client does not
// have to compare handles itself.
func problemResponse(problem store.Problem, canEdit bool) map[string]any {
	return map[string]any{"problem": problem, "canEdit": canEdit}
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

type problemRequest struct {
	Title       string           `json:"title"`
	Summary     string           `json:"summary"`
	Statement   string           `json:"statement"`
	Difficulty  string           `json:"difficulty"`
	StarterCode string           `json:"starterCode"`
	EntryPoint  string           `json:"entryPoint"`
	Examples    []store.Example  `json:"examples"`
	Tests       []store.TestCase `json:"tests"`
}

// validate normalises the request and reports per-field problems.
func (req problemRequest) validate() (store.ProblemDraft, auth.FieldErrors) {
	errs := auth.FieldErrors{}
	draft := store.ProblemDraft{
		Title:       strings.Join(strings.Fields(req.Title), " "),
		Summary:     strings.TrimSpace(req.Summary),
		Statement:   strings.TrimSpace(req.Statement),
		Difficulty:  req.Difficulty,
		StarterCode: req.StarterCode,
		EntryPoint:  strings.TrimSpace(req.EntryPoint),
		Examples:    []store.Example{},
		Tests:       []store.TestCase{},
	}

	switch {
	case draft.Title == "":
		errs["title"] = "Give the problem a title."
	case utf8.RuneCountInString(draft.Title) > maxTitleLength:
		errs["title"] = "Titles are at most 120 characters."
	}
	if utf8.RuneCountInString(draft.Summary) > maxSummaryLength {
		errs["summary"] = "Summaries are at most 300 characters."
	}
	if utf8.RuneCountInString(draft.Statement) > maxStatementLength {
		errs["statement"] = "That statement is too long."
	}
	if utf8.RuneCountInString(draft.StarterCode) > maxStarterLength {
		errs["starterCode"] = "That starter code is too long."
	}
	if draft.Difficulty == "" {
		draft.Difficulty = "easy"
	} else if !difficulties[draft.Difficulty] {
		errs["difficulty"] = "Pick easy, medium or hard."
	}
	if draft.EntryPoint != "" && !isPythonIdentifier(draft.EntryPoint) {
		errs["entryPoint"] = "That is not a Python function name."
	}

	if len(req.Examples) > maxExamples {
		errs["examples"] = "That is more examples than anyone will read."
	}
	for _, example := range req.Examples {
		if strings.TrimSpace(example.Input) == "" && strings.TrimSpace(example.Output) == "" {
			continue // a blank row the author left behind
		}
		draft.Examples = append(draft.Examples, store.Example{
			Input:       example.Input,
			Output:      example.Output,
			Explanation: strings.TrimSpace(example.Explanation),
		})
	}

	if len(req.Tests) > maxTests {
		errs["tests"] = "At most 40 test cases."
	}
	for i, test := range req.Tests {
		args := test.Args
		if len(args) == 0 {
			args = json.RawMessage("[]")
		}
		// Arguments have to be a JSON array: they are spread into the call.
		var decoded []any
		if err := json.Unmarshal(args, &decoded); err != nil {
			errs["tests"] = "Test " + strconv.Itoa(i+1) + ": arguments must be a JSON array, like [1, [2, 3]]."
			continue
		}
		if len(args) > maxTestJSONLength || len(test.Expected) > maxTestJSONLength {
			errs["tests"] = "Test " + strconv.Itoa(i+1) + ": that case is too large."
			continue
		}
		if len(test.Expected) > 0 && !json.Valid(test.Expected) {
			errs["tests"] = "Test " + strconv.Itoa(i+1) + ": the expected value is not valid JSON."
			continue
		}
		draft.Tests = append(draft.Tests, store.TestCase{
			Name:     strings.TrimSpace(test.Name),
			Args:     args,
			Expected: test.Expected,
			Hidden:   test.Hidden,
		})
	}
	if len(draft.Tests) > 0 && draft.EntryPoint == "" {
		errs["entryPoint"] = "Test cases call a function, so name the one they should call."
	}

	return draft, errs
}

func isPythonIdentifier(name string) bool {
	if name == "" || len(name) > 80 {
		return false
	}
	for i, r := range name {
		isLetter := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '_'
		isDigit := r >= '0' && r <= '9'
		if !isLetter && !(i > 0 && isDigit) {
			return false
		}
	}
	return true
}

func (s *Server) handleCreateProblem(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req problemRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	draft, errs := req.validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}

	name, err := slug.Unique(slug.Make(draft.Title), func(candidate string) (bool, error) {
		return s.store.SlugExists(r.Context(), candidate)
	})
	if err != nil {
		s.log.Error("pick slug", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the problem")
		return
	}

	problem, err := s.store.CreateProblem(r.Context(), user.ID, name, draft)
	if errors.Is(err, store.ErrSlugTaken) {
		// Lost the race against a concurrent create. Rare enough to ask them
		// to try again rather than loop.
		writeError(w, http.StatusConflict, "that name was just taken. Try again.")
		return
	}
	if err != nil {
		s.log.Error("create problem", "err", err)
		writeError(w, http.StatusInternalServerError, "could not create the problem")
		return
	}
	s.log.Info("problem created", "slug", problem.ID, "author", user.Handle)
	writeJSON(w, http.StatusCreated, problemResponse(problem, true))
}

func (s *Server) handleUpdateProblem(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req problemRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	draft, errs := req.validate()
	if errs.Any() {
		writeFields(w, http.StatusBadRequest, "Check the highlighted fields.", errs)
		return
	}

	problem, err := s.store.UpdateProblem(r.Context(), r.PathValue("slug"), user.ID, draft)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	if err != nil {
		s.log.Error("update problem", "err", err)
		writeError(w, http.StatusInternalServerError, "could not save the problem")
		return
	}
	writeJSON(w, http.StatusOK, problemResponse(problem, true))
}

type visibilityRequest struct {
	Visibility string `json:"visibility"`
}

func (s *Server) handleSetProblemVisibility(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	var req visibilityRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	visibility := store.Visibility(req.Visibility)
	switch visibility {
	case store.VisibilityDraft, store.VisibilityUnlisted, store.VisibilityPublic:
	default:
		writeError(w, http.StatusBadRequest, "visibility must be draft, unlisted or public")
		return
	}

	name := r.PathValue("slug")
	// Check ownership before writing: SetProblemVisibility filters by author,
	// but a silent no-op would look like success.
	existing, err := s.store.ProblemBySlug(r.Context(), name)
	if errors.Is(err, store.ErrNotFound) || (err == nil && existing.Author.Handle != user.Handle) {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	if err != nil {
		s.log.Error("load problem", "err", err)
		writeError(w, http.StatusInternalServerError, "could not publish the problem")
		return
	}
	if visibility != store.VisibilityDraft && len(existing.Tests) == 0 && existing.EntryPoint == "" {
		// Not fatal, but worth saying: a problem with no tests cannot be
		// checked, and that is most of the value of publishing one.
		s.log.Info("publishing a problem with no tests", "slug", name)
	}

	problem, err := s.store.SetProblemVisibility(r.Context(), name, user.ID, visibility)
	if err != nil {
		s.log.Error("set visibility", "err", err)
		writeError(w, http.StatusInternalServerError, "could not publish the problem")
		return
	}
	s.log.Info("problem visibility changed", "slug", problem.ID, "visibility", visibility)
	writeJSON(w, http.StatusOK, problemResponse(problem, true))
}

func (s *Server) handleDeleteProblem(w http.ResponseWriter, r *http.Request) {
	user, _ := UserFrom(r.Context())
	err := s.store.DeleteProblem(r.Context(), r.PathValue("slug"), user.ID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "problem not found")
		return
	}
	if err != nil {
		s.log.Error("delete problem", "err", err)
		writeError(w, http.StatusInternalServerError, "could not delete the problem")
		return
	}
	// Rooms started from it keep working: they hold their own copy.
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	handle := auth.NormalizeHandle(r.PathValue("handle"))
	user, err := s.store.UserByHandle(r.Context(), handle)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no such person")
		return
	}
	if err != nil {
		s.log.Error("load profile", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the profile")
		return
	}

	viewer := s.viewerID(r)
	problems, err := s.store.ListProblems(r.Context(), store.ProblemQuery{
		AuthorHandle: handle, Sort: store.SortRecent, Limit: 100, ViewerID: viewer,
	})
	if err != nil {
		s.log.Error("load profile problems", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the profile")
		return
	}
	lists, err := s.store.ListsOfUser(r.Context(), handle, viewer)
	if err != nil {
		s.log.Error("load profile lists", "err", err)
		writeError(w, http.StatusInternalServerError, "could not load the profile")
		return
	}

	// A profile is public, so the grid on it is too. It shows activity, not
	// what anyone got wrong.
	progress, err := s.store.ProgressOf(r.Context(), user.ID, 365)
	if err != nil {
		s.log.Error("load profile progress", "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"profile": map[string]any{
			"handle":      user.Handle,
			"displayName": user.DisplayName,
			"createdAt":   user.CreatedAt,
			"official":    user.Handle == seed.SystemHandle,
		},
		"problems": problems,
		"lists":    lists,
		"progress": progress,
		"solved":   s.solvedAmong(r, viewer, problems),
	})
}
