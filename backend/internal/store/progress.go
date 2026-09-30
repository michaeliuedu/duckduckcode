package store

import (
	"context"
	"fmt"
	"time"
)

// ActivityDay is one square in the contribution grid.
type ActivityDay struct {
	// Day is an ISO date, which is what the client keys squares by.
	Day    string `json:"day"`
	Runs   int    `json:"runs"`
	Solves int    `json:"solves"`
}

// Progress is what someone has done, in the shape the profile and home page
// both render.
type Progress struct {
	Solved     int           `json:"solved"`
	Attempted  int           `json:"attempted"`
	Runs       int           `json:"runs"`
	CurrentRun int           `json:"currentStreak"`
	LongestRun int           `json:"longestStreak"`
	Days       []ActivityDay `json:"days"`
}

// RecordAttempt notes that someone ran a problem's tests, and whether every
// case passed.
//
// Both tables are written in one statement each and both are upserts, so the
// same run recorded twice is not a problem: the client is not a trustworthy
// source of exactly-once delivery.
func (s *Store) RecordAttempt(ctx context.Context, userID, problemSlug string, solved bool) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var problemUUID string
	if err := tx.QueryRow(ctx, `SELECT id FROM problems WHERE slug = $1`, problemSlug).Scan(&problemUUID); err != nil {
		return ErrNotFound
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO attempts (user_id, problem_id, solved, runs, solved_at)
		VALUES ($1, $2, $3, 1, CASE WHEN $3 THEN now() END)
		ON CONFLICT (user_id, problem_id) DO UPDATE SET
			runs = attempts.runs + 1,
			last_attempt_at = now(),
			solved = attempts.solved OR EXCLUDED.solved,
			-- coalesce keeps the first solve: re-solving does not reset the date.
			solved_at = coalesce(attempts.solved_at, EXCLUDED.solved_at)`,
		userID, problemUUID, solved); err != nil {
		return fmt.Errorf("record attempt: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO activity (user_id, day, runs, solves)
		VALUES ($1, current_date, 1, CASE WHEN $2 THEN 1 ELSE 0 END)
		ON CONFLICT (user_id, day) DO UPDATE SET
			runs = activity.runs + 1,
			solves = activity.solves + CASE WHEN $2 THEN 1 ELSE 0 END`,
		userID, solved); err != nil {
		return fmt.Errorf("record activity: %w", err)
	}

	return tx.Commit(ctx)
}

// ProgressOf returns someone's totals and their last `days` days of activity.
func (s *Store) ProgressOf(ctx context.Context, userID string, days int) (Progress, error) {
	if days <= 0 || days > 400 {
		days = 365
	}
	var p Progress
	err := s.pool.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE solved),
			count(*),
			coalesce(sum(runs), 0)
		FROM attempts WHERE user_id = $1`, userID,
	).Scan(&p.Solved, &p.Attempted, &p.Runs)
	if err != nil {
		return Progress{}, fmt.Errorf("load progress totals: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), runs, solves
		FROM activity
		WHERE user_id = $1 AND day > current_date - $2::int
		ORDER BY day`, userID, days)
	if err != nil {
		return Progress{}, fmt.Errorf("load activity: %w", err)
	}
	defer rows.Close()

	p.Days = []ActivityDay{}
	for rows.Next() {
		var d ActivityDay
		if err := rows.Scan(&d.Day, &d.Runs, &d.Solves); err != nil {
			return Progress{}, err
		}
		p.Days = append(p.Days, d)
	}
	if err := rows.Err(); err != nil {
		return Progress{}, err
	}

	p.CurrentRun, p.LongestRun = streaks(p.Days)
	return p, nil
}

// streaks counts consecutive active days, ending today or yesterday for the
// current one. Yesterday still counts: a streak should not break at midnight
// while someone is still awake and working.
func streaks(days []ActivityDay) (current, longest int) {
	if len(days) == 0 {
		return 0, 0
	}
	const layout = "2006-01-02"
	var run int
	var previous time.Time

	for _, d := range days {
		day, err := time.Parse(layout, d.Day)
		if err != nil {
			continue
		}
		if !previous.IsZero() && day.Sub(previous) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
		previous = day
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	if gap := today.Sub(previous); gap <= 24*time.Hour {
		current = run
	}
	return current, longest
}

// SolvedSlugs returns which of the given problems a person has solved, so a
// listing can tick them without a query per row.
func (s *Store) SolvedSlugs(ctx context.Context, userID string, slugs []string) (map[string]bool, error) {
	solved := map[string]bool{}
	if userID == "" || len(slugs) == 0 {
		return solved, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT p.slug FROM attempts a JOIN problems p ON p.id = a.problem_id
		WHERE a.user_id = $1 AND a.solved AND p.slug = ANY($2)`, userID, slugs)
	if err != nil {
		return nil, fmt.Errorf("load solved: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return nil, err
		}
		solved[slug] = true
	}
	return solved, rows.Err()
}
