// Package store persists rooms, Yjs update logs and snapshots in PostgreSQL.
package store

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a room does not exist.
var ErrNotFound = errors.New("room not found")

// Mode is the kind of workspace a room hosts.
type Mode string

const (
	ModePractice Mode = "practice"
	ModeBlank    Mode = "blank"
)

// Room is a persisted room record.
type Room struct {
	ID        string    `json:"id"`
	Mode      Mode      `json:"mode"`
	ProblemID *string   `json:"problemId"`
	Language  string    `json:"language"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Update is one persisted Yjs update.
type Update struct {
	Seq  int64
	Data []byte
}

// Snapshot is the compacted state of a room covering all updates with
// seq <= Seq.
type Snapshot struct {
	Seq   int64
	State []byte
}

// DocState is everything needed to replay a room's document.
type DocState struct {
	Snapshot *Snapshot
	Updates  []Update
}

// Store wraps a pgx pool.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a store on top of an existing pool.
func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// NewRoomID returns a 128-bit random, URL-safe identifier (22 characters).
func NewRoomID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

// CreateRoom inserts a room. If seed is non-empty it is stored as the initial
// snapshot (seq 0) so every client receives it on first sync, which avoids
// the "two clients both insert the starter code" race that client-side
// seeding would create.
func (s *Store) CreateRoom(ctx context.Context, mode Mode, problemID *string, language string, seed []byte) (Room, error) {
	id, err := NewRoomID()
	if err != nil {
		return Room{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Room{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var r Room
	err = tx.QueryRow(ctx, `
		INSERT INTO rooms (id, mode, problem_id, language)
		VALUES ($1, $2, $3, $4)
		RETURNING id, mode, problem_id, language, created_at, updated_at`,
		id, string(mode), problemID, language,
	).Scan(&r.ID, &r.Mode, &r.ProblemID, &r.Language, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return Room{}, fmt.Errorf("insert room: %w", err)
	}
	if len(seed) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO room_snapshots (room_id, seq, state) VALUES ($1, 0, $2)`, id, seed); err != nil {
			return Room{}, fmt.Errorf("insert seed snapshot: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Room{}, err
	}
	return r, nil
}

// GetRoom loads a room by id.
func (s *Store) GetRoom(ctx context.Context, id string) (Room, error) {
	var r Room
	err := s.pool.QueryRow(ctx, `
		SELECT id, mode, problem_id, language, created_at, updated_at
		FROM rooms WHERE id = $1`, id,
	).Scan(&r.ID, &r.Mode, &r.ProblemID, &r.Language, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Room{}, ErrNotFound
	}
	return r, err
}

// AppendUpdate persists one Yjs update and returns its sequence number.
func (s *Store) AppendUpdate(ctx context.Context, roomID string, data []byte) (int64, error) {
	var seq int64
	err := s.pool.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO room_updates (room_id, data) VALUES ($1, $2) RETURNING seq
		), touch AS (
			UPDATE rooms SET updated_at = now() WHERE id = $1
		)
		SELECT seq FROM ins`, roomID, data).Scan(&seq)
	if err != nil {
		return 0, fmt.Errorf("append update: %w", err)
	}
	return seq, nil
}

// LoadDocState returns the snapshot (if any) and all updates after it.
func (s *Store) LoadDocState(ctx context.Context, roomID string) (DocState, error) {
	var st DocState
	var snap Snapshot
	err := s.pool.QueryRow(ctx, `
		SELECT seq, state FROM room_snapshots WHERE room_id = $1`, roomID,
	).Scan(&snap.Seq, &snap.State)
	switch {
	case err == nil:
		st.Snapshot = &snap
	case errors.Is(err, pgx.ErrNoRows):
		// no snapshot yet
	default:
		return st, fmt.Errorf("load snapshot: %w", err)
	}
	var after int64
	if st.Snapshot != nil {
		after = st.Snapshot.Seq
	}
	rows, err := s.pool.Query(ctx, `
		SELECT seq, data FROM room_updates
		WHERE room_id = $1 AND seq > $2 ORDER BY seq`, roomID, after)
	if err != nil {
		return st, fmt.Errorf("load updates: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var u Update
		if err := rows.Scan(&u.Seq, &u.Data); err != nil {
			return st, err
		}
		st.Updates = append(st.Updates, u)
	}
	return st, rows.Err()
}

// SaveSnapshot atomically replaces the room snapshot with state (covering
// updates with seq <= seq) and deletes the now-redundant update rows. It is a
// no-op if an existing snapshot already covers a later sequence number.
func (s *Store) SaveSnapshot(ctx context.Context, roomID string, seq int64, state []byte) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx, `
		INSERT INTO room_snapshots (room_id, seq, state, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (room_id) DO UPDATE
		SET seq = EXCLUDED.seq, state = EXCLUDED.state, updated_at = now()
		WHERE room_snapshots.seq < EXCLUDED.seq`, roomID, seq, state)
	if err != nil {
		return 0, fmt.Errorf("upsert snapshot: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return 0, nil
	}
	del, err := tx.Exec(ctx, `
		DELETE FROM room_updates WHERE room_id = $1 AND seq <= $2`, roomID, seq)
	if err != nil {
		return 0, fmt.Errorf("delete compacted updates: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return del.RowsAffected(), nil
}

// CountUpdates returns the number of un-compacted updates for a room.
func (s *Store) CountUpdates(ctx context.Context, roomID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM room_updates WHERE room_id = $1`, roomID).Scan(&n)
	return n, err
}

// Ping checks database connectivity (used by the readiness probe).
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }
