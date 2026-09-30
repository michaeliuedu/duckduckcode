package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// List is a collection of problems owned by one person.
type List struct {
	ID          string           `json:"id"`
	Slug        string           `json:"slug"`
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Visibility  Visibility       `json:"visibility"`
	Owner       Author           `json:"owner"`
	ItemCount   int              `json:"itemCount"`
	Items       []ProblemSummary `json:"items,omitempty"`
	UpdatedAt   time.Time        `json:"updatedAt"`
}

const listColumns = `
	l.id, l.slug, l.title, l.description, l.visibility, l.updated_at,
	u.handle, u.display_name,
	(SELECT count(*) FROM list_items i WHERE i.list_id = l.id)`

func scanList(row pgx.Row) (List, error) {
	var l List
	err := row.Scan(&l.ID, &l.Slug, &l.Title, &l.Description, &l.Visibility, &l.UpdatedAt,
		&l.Owner.Handle, &l.Owner.DisplayName, &l.ItemCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return List{}, ErrNotFound
	}
	return l, err
}

// CreateList makes an empty list.
func (s *Store) CreateList(ctx context.Context, ownerID, slug, title, description string, visibility Visibility) (List, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO lists (owner_id, slug, title, description, visibility)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		ownerID, slug, title, description, string(visibility)).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			return List{}, ErrSlugTaken
		}
		return List{}, fmt.Errorf("insert list: %w", err)
	}
	return s.ListByID(ctx, id)
}

// UpdateList changes a list the caller owns.
func (s *Store) UpdateList(ctx context.Context, id, ownerID, title, description string, visibility Visibility) (List, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE lists SET title = $3, description = $4, visibility = $5, updated_at = now()
		WHERE id = $1 AND owner_id = $2`, id, ownerID, title, description, string(visibility))
	if err != nil {
		return List{}, fmt.Errorf("update list: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return List{}, ErrNotFound
	}
	return s.ListByID(ctx, id)
}

// DeleteList removes a list the caller owns.
func (s *Store) DeleteList(ctx context.Context, id, ownerID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM lists WHERE id = $1 AND owner_id = $2`, id, ownerID)
	if err != nil {
		return fmt.Errorf("delete list: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListByID loads a list without its items.
func (s *Store) ListByID(ctx context.Context, id string) (List, error) {
	return scanList(s.pool.QueryRow(ctx, `
		SELECT `+listColumns+` FROM lists l JOIN users u ON u.id = l.owner_id
		WHERE l.id = $1`, id))
}

// ListWithItems loads a list and the problems in it, in order.
//
// viewerID decides which problems are visible: a list may contain someone's
// draft, and being in a list does not make a draft public.
func (s *Store) ListWithItems(ctx context.Context, id, viewerID string) (List, error) {
	list, err := s.ListByID(ctx, id)
	if err != nil {
		return List{}, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT p.slug, p.title, p.summary, p.difficulty, p.language, p.visibility,
		       p.official, p.room_count, p.updated_at, u.handle, u.display_name,
		       (SELECT count(*) FROM problem_tests t WHERE t.problem_id = p.id)
		FROM list_items i
		JOIN problems p ON p.id = i.problem_id
		JOIN users u ON u.id = p.author_id
		WHERE i.list_id = $1 AND (p.visibility <> 'draft' OR p.author_id = $2)
		ORDER BY i.position`, id, nullableText(viewerID))
	if err != nil {
		return List{}, fmt.Errorf("load list items: %w", err)
	}
	defer rows.Close()
	list.Items = []ProblemSummary{}
	for rows.Next() {
		var p ProblemSummary
		var tests int
		if err := rows.Scan(&p.ID, &p.Title, &p.Summary, &p.Difficulty, &p.Language, &p.Visibility,
			&p.Official, &p.RoomCount, &p.UpdatedAt, &p.Author.Handle, &p.Author.DisplayName, &tests); err != nil {
			return List{}, err
		}
		p.TestCount = tests
		list.Items = append(list.Items, p)
	}
	return list, rows.Err()
}

// nullableText turns "" into NULL so a comparison against it is never true.
func nullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// ListsOfUser returns a person's lists. Only the owner sees their private ones.
func (s *Store) ListsOfUser(ctx context.Context, handle, viewerID string) ([]List, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+listColumns+`
		FROM lists l JOIN users u ON u.id = l.owner_id
		WHERE u.handle = $1 AND (l.visibility = 'public' OR l.owner_id = $2)
		ORDER BY l.updated_at DESC`, handle, nullableText(viewerID))
	if err != nil {
		return nil, fmt.Errorf("load lists: %w", err)
	}
	defer rows.Close()
	out := []List{}
	for rows.Next() {
		l, err := scanListRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func scanListRow(rows pgx.Rows) (List, error) {
	var l List
	err := rows.Scan(&l.ID, &l.Slug, &l.Title, &l.Description, &l.Visibility, &l.UpdatedAt,
		&l.Owner.Handle, &l.Owner.DisplayName, &l.ItemCount)
	return l, err
}

// AddToList appends a problem, or does nothing if it is already there.
func (s *Store) AddToList(ctx context.Context, listID, ownerID, problemSlug string) error {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO list_items (list_id, problem_id, position)
		SELECT l.id, p.id, coalesce((SELECT max(position) + 1 FROM list_items WHERE list_id = l.id), 0)
		FROM lists l, problems p
		WHERE l.id = $1 AND l.owner_id = $2 AND p.slug = $3
		ON CONFLICT (list_id, problem_id) DO NOTHING`, listID, ownerID, problemSlug)
	if err != nil {
		return fmt.Errorf("add to list: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Either the list is not theirs, the problem does not exist, or it was
		// already in the list. The last is not an error worth reporting.
		var present bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM list_items i JOIN lists l ON l.id = i.list_id
				JOIN problems p ON p.id = i.problem_id
				WHERE l.id = $1 AND l.owner_id = $2 AND p.slug = $3)`,
			listID, ownerID, problemSlug).Scan(&present); err != nil {
			return err
		}
		if !present {
			return ErrNotFound
		}
	}
	return nil
}

// RemoveFromList drops a problem from a list the caller owns.
func (s *Store) RemoveFromList(ctx context.Context, listID, ownerID, problemSlug string) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM list_items
		WHERE list_id = (SELECT id FROM lists WHERE id = $1 AND owner_id = $2)
		  AND problem_id = (SELECT id FROM problems WHERE slug = $3)`, listID, ownerID, problemSlug)
	return err
}

// ListIDsContaining reports which of the caller's lists hold a problem, so the
// "Add to list" control can show what is already ticked.
func (s *Store) ListIDsContaining(ctx context.Context, ownerID, problemSlug string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT l.id FROM list_items i
		JOIN lists l ON l.id = i.list_id
		JOIN problems p ON p.id = i.problem_id
		WHERE l.owner_id = $1 AND p.slug = $2`, ownerID, problemSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
