package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrSlugTaken is returned when a problem or list slug is already in use.
var ErrSlugTaken = errors.New("slug already taken")

// Visibility controls who can see a problem or a list.
type Visibility string

const (
	// VisibilityDraft is visible only to its author.
	VisibilityDraft Visibility = "draft"
	// VisibilityUnlisted is reachable by link but excluded from browse and search.
	VisibilityUnlisted Visibility = "unlisted"
	// VisibilityPublic is listed everywhere.
	VisibilityPublic Visibility = "public"
	// VisibilityPrivate is the draft equivalent for lists.
	VisibilityPrivate Visibility = "private"
)

// Author is the part of a user shown next to their content. Never the email:
// a problem page is public, and an address on it is an address harvested.
type Author struct {
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
}

// Example is a worked input/output pair shown beside the statement.
type Example struct {
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation,omitempty"`
}

// TestCase calls the problem's entry point with Args and compares the result
// to Expected. Both are arbitrary JSON.
type TestCase struct {
	Name     string          `json:"name"`
	Args     json.RawMessage `json:"args"`
	Expected json.RawMessage `json:"expected"`
	Hidden   bool            `json:"hidden"`
}

// Problem is a practice problem. ID is the slug: it is what appears in URLs
// and in rooms, and it never changes.
type Problem struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Summary     string     `json:"summary"`
	Statement   string     `json:"statement"`
	Difficulty  string     `json:"difficulty"`
	Language    string     `json:"language"`
	StarterCode string     `json:"starterCode"`
	EntryPoint  string     `json:"entryPoint"`
	Visibility  Visibility `json:"visibility"`
	Official    bool       `json:"official"`
	RoomCount   int64      `json:"roomCount"`
	Author      Author     `json:"author"`
	Examples    []Example  `json:"examples"`
	Tests       []TestCase `json:"tests"`
	PublishedAt *time.Time `json:"publishedAt,omitempty"`
	UpdatedAt   time.Time  `json:"updatedAt"`

	// uuid is the primary key. Unexported so it never reaches the API, where
	// the slug is the identifier.
	uuid string
}

// Summary is the lightweight view used by lists and search results.
type ProblemSummary struct {
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	Summary    string     `json:"summary"`
	Difficulty string     `json:"difficulty"`
	Language   string     `json:"language"`
	Visibility Visibility `json:"visibility"`
	Official   bool       `json:"official"`
	RoomCount  int64      `json:"roomCount"`
	TestCount  int        `json:"testCount"`
	Author     Author     `json:"author"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// ProblemDraft is the writable part of a problem.
type ProblemDraft struct {
	Title       string
	Summary     string
	Statement   string
	Difficulty  string
	StarterCode string
	EntryPoint  string
	Examples    []Example
	Tests       []TestCase
}

const problemColumns = `
	p.id, p.slug, p.title, p.summary, p.statement, p.difficulty, p.language,
	p.starter_code, p.entry_point, p.visibility, p.official, p.room_count,
	p.published_at, p.updated_at, u.handle, u.display_name`

func scanProblem(row pgx.Row) (Problem, error) {
	var p Problem
	err := row.Scan(
		&p.uuid, &p.ID, &p.Title, &p.Summary, &p.Statement, &p.Difficulty, &p.Language,
		&p.StarterCode, &p.EntryPoint, &p.Visibility, &p.Official, &p.RoomCount,
		&p.PublishedAt, &p.UpdatedAt, &p.Author.Handle, &p.Author.DisplayName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Problem{}, ErrNotFound
	}
	return p, err
}

// CreateProblem inserts a draft owned by authorID.
func (s *Store) CreateProblem(ctx context.Context, authorID, slug string, draft ProblemDraft) (Problem, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Problem{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var uuid string
	err = tx.QueryRow(ctx, `
		INSERT INTO problems (slug, author_id, title, summary, statement, difficulty, starter_code, entry_point)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		slug, authorID, draft.Title, draft.Summary, draft.Statement, draft.Difficulty,
		draft.StarterCode, draft.EntryPoint,
	).Scan(&uuid)
	if err != nil {
		if isUniqueViolation(err) {
			return Problem{}, ErrSlugTaken
		}
		return Problem{}, fmt.Errorf("insert problem: %w", err)
	}
	if err := replaceChildren(ctx, tx, uuid, draft); err != nil {
		return Problem{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Problem{}, err
	}
	return s.ProblemBySlug(ctx, slug)
}

// UpdateProblem replaces the editable fields of a problem the caller owns.
func (s *Store) UpdateProblem(ctx context.Context, slug, authorID string, draft ProblemDraft) (Problem, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Problem{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var uuid string
	err = tx.QueryRow(ctx, `
		UPDATE problems
		SET title = $3, summary = $4, statement = $5, difficulty = $6,
		    starter_code = $7, entry_point = $8, updated_at = now()
		WHERE slug = $1 AND author_id = $2
		RETURNING id`,
		slug, authorID, draft.Title, draft.Summary, draft.Statement, draft.Difficulty,
		draft.StarterCode, draft.EntryPoint,
	).Scan(&uuid)
	if errors.Is(err, pgx.ErrNoRows) {
		// Either it does not exist or it is not theirs. The handler turns this
		// into a 404 either way, so a probe cannot map out other people's drafts.
		return Problem{}, ErrNotFound
	}
	if err != nil {
		return Problem{}, fmt.Errorf("update problem: %w", err)
	}
	if err := replaceChildren(ctx, tx, uuid, draft); err != nil {
		return Problem{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Problem{}, err
	}
	return s.ProblemBySlug(ctx, slug)
}

// replaceChildren rewrites the examples and tests wholesale. They are small,
// ordered and always edited as a unit, so diffing them would be work with no
// payoff.
func replaceChildren(ctx context.Context, tx pgx.Tx, uuid string, draft ProblemDraft) error {
	if _, err := tx.Exec(ctx, `DELETE FROM problem_examples WHERE problem_id = $1`, uuid); err != nil {
		return fmt.Errorf("clear examples: %w", err)
	}
	for i, example := range draft.Examples {
		if _, err := tx.Exec(ctx, `
			INSERT INTO problem_examples (problem_id, position, input, output, explanation)
			VALUES ($1, $2, $3, $4, $5)`,
			uuid, i, example.Input, example.Output, example.Explanation); err != nil {
			return fmt.Errorf("insert example: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM problem_tests WHERE problem_id = $1`, uuid); err != nil {
		return fmt.Errorf("clear tests: %w", err)
	}
	for i, test := range draft.Tests {
		args := test.Args
		if len(args) == 0 {
			args = json.RawMessage("[]")
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO problem_tests (problem_id, position, name, args, expected, hidden)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			uuid, i, test.Name, args, nullableJSON(test.Expected), test.Hidden); err != nil {
			return fmt.Errorf("insert test: %w", err)
		}
	}
	return nil
}

func nullableJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

// SetProblemVisibility publishes or unpublishes a problem the caller owns.
func (s *Store) SetProblemVisibility(ctx context.Context, slug, authorID string, visibility Visibility) (Problem, error) {
	var published *time.Time
	if visibility != VisibilityDraft {
		now := time.Now()
		published = &now
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE problems
		SET visibility = $3,
		    -- Keep the original publication date if it had one.
		    published_at = CASE WHEN $3 = 'draft' THEN published_at ELSE coalesce(published_at, $4) END,
		    updated_at = now()
		WHERE slug = $1 AND author_id = $2`, slug, authorID, string(visibility), published)
	if err != nil {
		return Problem{}, fmt.Errorf("set visibility: %w", err)
	}
	return s.ProblemBySlug(ctx, slug)
}

// DeleteProblem removes a problem the caller owns. Rooms already started from
// it are unaffected: they carry their own snapshot.
func (s *Store) DeleteProblem(ctx context.Context, slug, authorID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM problems WHERE slug = $1 AND author_id = $2`, slug, authorID)
	if err != nil {
		return fmt.Errorf("delete problem: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ProblemBySlug loads a problem with its examples and tests.
func (s *Store) ProblemBySlug(ctx context.Context, slug string) (Problem, error) {
	p, err := scanProblem(s.pool.QueryRow(ctx, `
		SELECT `+problemColumns+`
		FROM problems p JOIN users u ON u.id = p.author_id
		WHERE p.slug = $1`, slug))
	if err != nil {
		return Problem{}, err
	}
	if p.Examples, err = s.examplesOf(ctx, p.uuid); err != nil {
		return Problem{}, err
	}
	if p.Tests, err = s.testsOf(ctx, p.uuid); err != nil {
		return Problem{}, err
	}
	return p, nil
}

// AuthorHandleOf reports who owns a problem, for authorization checks that do
// not need the whole record.
func (p Problem) AuthorHandle() string { return p.Author.Handle }

func (s *Store) examplesOf(ctx context.Context, uuid string) ([]Example, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT input, output, explanation FROM problem_examples
		WHERE problem_id = $1 ORDER BY position`, uuid)
	if err != nil {
		return nil, fmt.Errorf("load examples: %w", err)
	}
	defer rows.Close()
	examples := []Example{}
	for rows.Next() {
		var e Example
		if err := rows.Scan(&e.Input, &e.Output, &e.Explanation); err != nil {
			return nil, err
		}
		examples = append(examples, e)
	}
	return examples, rows.Err()
}

func (s *Store) testsOf(ctx context.Context, uuid string) ([]TestCase, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT name, args, expected, hidden FROM problem_tests
		WHERE problem_id = $1 ORDER BY position`, uuid)
	if err != nil {
		return nil, fmt.Errorf("load tests: %w", err)
	}
	defer rows.Close()
	tests := []TestCase{}
	for rows.Next() {
		var t TestCase
		if err := rows.Scan(&t.Name, &t.Args, &t.Expected, &t.Hidden); err != nil {
			return nil, err
		}
		tests = append(tests, t)
	}
	return tests, rows.Err()
}

// ---------------------------------------------------------------------------
// Browsing and search
// ---------------------------------------------------------------------------

// ProblemSort is the ordering of a problem listing.
type ProblemSort string

const (
	// SortPopular ranks by how many rooms have been started from a problem.
	SortPopular ProblemSort = "popular"
	// SortRecent ranks by publication date.
	SortRecent ProblemSort = "recent"
	// SortRelevance ranks by full-text match; only meaningful with a query.
	SortRelevance ProblemSort = "relevance"
	// SortCurated keeps a hand-picked list in the order it was put together,
	// oldest first. The seeded problems are a sequence that builds on itself,
	// and popularity would shuffle them into a meaningless order.
	SortCurated ProblemSort = "curated"
)

// ProblemQuery describes a listing.
type ProblemQuery struct {
	// Text is a websearch-style query. Empty lists everything.
	Text string
	// Difficulty filters when non-empty.
	Difficulty string
	// AuthorHandle filters to one person's problems.
	AuthorHandle string
	// Official filters to (or away from) the seeded problems when set.
	Official *bool
	Sort     ProblemSort
	Limit    int
	Offset   int
	// ViewerID includes that user's own drafts and unlisted problems. Empty
	// means show only what is public.
	ViewerID string
}

// ListProblems runs a browse or search query.
func (s *Store) ListProblems(ctx context.Context, q ProblemQuery) ([]ProblemSummary, error) {
	var (
		where []string
		args  []any
	)
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}

	// Visibility is the first filter and never optional: a draft belongs to its
	// author alone, and an unlisted problem is reachable by link but not listed.
	if q.ViewerID != "" {
		args = append(args, q.ViewerID)
		where = append(where, fmt.Sprintf("(p.visibility = 'public' OR p.author_id = $%d)", len(args)))
	} else {
		where = append(where, "p.visibility = 'public'")
	}

	if q.Text != "" {
		add("p.search @@ websearch_to_tsquery('english', $%d)", q.Text)
	}
	if q.Difficulty != "" {
		add("p.difficulty = $%d", q.Difficulty)
	}
	if q.AuthorHandle != "" {
		add("u.handle = $%d", q.AuthorHandle)
	}
	if q.Official != nil {
		add("p.official = $%d", *q.Official)
	}

	order := "p.room_count DESC, p.published_at DESC NULLS LAST"
	switch q.Sort {
	case SortRecent:
		order = "coalesce(p.published_at, p.created_at) DESC"
	case SortCurated:
		order = "coalesce(p.published_at, p.created_at) ASC"
	case SortRelevance:
		if q.Text != "" {
			args = append(args, q.Text)
			order = fmt.Sprintf("ts_rank(p.search, websearch_to_tsquery('english', $%d)) DESC, p.room_count DESC", len(args))
		}
	}

	limit := q.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	args = append(args, limit, q.Offset)

	sql := `
		SELECT p.slug, p.title, p.summary, p.difficulty, p.language, p.visibility,
		       p.official, p.room_count, p.updated_at, u.handle, u.display_name,
		       (SELECT count(*) FROM problem_tests t WHERE t.problem_id = p.id)
		FROM problems p JOIN users u ON u.id = p.author_id
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY ` + order + `
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("list problems: %w", err)
	}
	defer rows.Close()

	out := []ProblemSummary{}
	for rows.Next() {
		var p ProblemSummary
		var tests int
		if err := rows.Scan(&p.ID, &p.Title, &p.Summary, &p.Difficulty, &p.Language, &p.Visibility,
			&p.Official, &p.RoomCount, &p.UpdatedAt, &p.Author.Handle, &p.Author.DisplayName, &tests); err != nil {
			return nil, err
		}
		p.TestCount = tests
		out = append(out, p)
	}
	return out, rows.Err()
}

// CountProblems returns how many rows a query would match, for paging.
func (s *Store) CountProblems(ctx context.Context, q ProblemQuery) (int, error) {
	q.Limit, q.Offset, q.Sort = 1000, 0, SortRecent
	found, err := s.ListProblems(ctx, q)
	return len(found), err
}

// SlugExists reports whether a problem slug is taken, so the author form can
// suggest a free one before submitting.
func (s *Store) SlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM problems WHERE slug = $1)`, slug).Scan(&exists)
	return exists, err
}

// NoteProblemUsed increments the popularity counter. Best effort: failing to
// count a room is not a reason to fail creating one.
func (s *Store) NoteProblemUsed(ctx context.Context, slug string) error {
	_, err := s.pool.Exec(ctx, `UPDATE problems SET room_count = room_count + 1 WHERE slug = $1`, slug)
	return err
}

// PublishSeeded marks a seeded problem public and official. Separate from
// SetProblemVisibility because that one requires an owning user to be the
// caller; this runs at boot with no request behind it.
func (s *Store) PublishSeeded(ctx context.Context, slug string) (Problem, error) {
	_, err := s.pool.Exec(ctx, `
		UPDATE problems
		SET visibility = 'public', official = true, published_at = coalesce(published_at, now())
		WHERE slug = $1`, slug)
	if err != nil {
		return Problem{}, fmt.Errorf("publish seeded problem: %w", err)
	}
	return s.ProblemBySlug(ctx, slug)
}
