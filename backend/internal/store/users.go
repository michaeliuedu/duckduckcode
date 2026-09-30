package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Errors returned when an account cannot be created because something is
// already using the identifier. Distinguishing the two lets the form point at
// the right field.
var (
	ErrEmailTaken  = errors.New("email already registered")
	ErrHandleTaken = errors.New("handle already taken")
)

// User is an account, in the shape the API returns it.
//
// The password hash is deliberately not a field here: the only code that needs
// it is the login path, which asks for it explicitly through Credentials. That
// makes it impossible to leak a hash by serialising a User.
type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Handle      string    `json:"handle"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Credentials is a user together with the stored password hash.
type Credentials struct {
	User         User
	PasswordHash string
}

// Session is a stored login.
type Session struct {
	UserID     string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
}

const userColumns = `id, email, handle, display_name, created_at`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Handle, &u.DisplayName, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

// isUniqueViolation reports whether err is a PostgreSQL unique-constraint
// failure. Letting the database decide avoids the check-then-insert race where
// two concurrent requests for the same name both pass the check.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// uniqueViolation maps a unique-constraint error to the field that caused it.
func uniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return nil
	}
	switch pgErr.ConstraintName {
	case "users_email_key":
		return ErrEmailTaken
	case "users_handle_key":
		return ErrHandleTaken
	default:
		return nil
	}
}

// CreateUser inserts an account. email, handle and displayName must already be
// normalised (see auth.Signup.Validate); the database rejects them otherwise.
func (s *Store) CreateUser(ctx context.Context, email, handle, displayName, passwordHash string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		INSERT INTO users (email, handle, display_name, password_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING `+userColumns, email, handle, displayName, passwordHash))
	if err != nil {
		if taken := uniqueViolation(err); taken != nil {
			return User{}, taken
		}
		return User{}, fmt.Errorf("insert user: %w", err)
	}
	return u, nil
}

// UserByID loads an account.
func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

// UserByHandle loads an account by its public handle.
func (s *Store) UserByHandle(ctx context.Context, handle string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE handle = $1`, handle))
}

// CredentialsByEmail loads an account and its password hash for the login path.
func (s *Store) CredentialsByEmail(ctx context.Context, email string) (Credentials, error) {
	var c Credentials
	err := s.pool.QueryRow(ctx, `
		SELECT `+userColumns+`, password_hash FROM users WHERE email = $1`, email,
	).Scan(&c.User.ID, &c.User.Email, &c.User.Handle, &c.User.DisplayName, &c.User.CreatedAt, &c.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Credentials{}, ErrNotFound
	}
	return c, err
}

// UpdateProfile changes the parts of an account a person can edit.
func (s *Store) UpdateProfile(ctx context.Context, id, handle, displayName string) (User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `
		UPDATE users SET handle = $2, display_name = $3, updated_at = now()
		WHERE id = $1
		RETURNING `+userColumns, id, handle, displayName))
	if err != nil {
		if taken := uniqueViolation(err); taken != nil {
			return User{}, taken
		}
		return User{}, err
	}
	return u, nil
}

// UpdatePassword replaces the stored hash.
func (s *Store) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// CreateSession stores a login. tokenHash is the SHA-256 of the cookie value;
// the token itself never reaches the database.
func (s *Store) CreateSession(ctx context.Context, tokenHash []byte, userID string, expiresAt time.Time, userAgent string) error {
	if len(userAgent) > 400 {
		userAgent = userAgent[:400]
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
		VALUES ($1, $2, $3, $4)`, tokenHash, userID, expiresAt, userAgent)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// UserBySessionToken resolves a session cookie to its account.
//
// Expired rows are treated as absent rather than deleted here: a read path
// should not write, and the sweep in DeleteExpiredSessions cleans up.
func (s *Store) UserBySessionToken(ctx context.Context, tokenHash []byte) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, `
		SELECT `+"u.id, u.email, u.handle, u.display_name, u.created_at"+`
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`, tokenHash))
}

// TouchSession extends a session and records that it was used. Called at most
// once an hour per session (see auth.RefreshAfter), so it is not a write on
// every request.
func (s *Store) TouchSession(ctx context.Context, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE sessions SET last_seen_at = now(), expires_at = $2
		WHERE token_hash = $1 AND expires_at > now()`, tokenHash, expiresAt)
	return err
}

// SessionNeedsTouch reports whether a session's last_seen_at is older than the
// given age, so the caller can skip the write on most requests.
func (s *Store) SessionNeedsTouch(ctx context.Context, tokenHash []byte, olderThan time.Duration) (bool, error) {
	var stale bool
	err := s.pool.QueryRow(ctx, `
		SELECT last_seen_at < now() - $2::interval FROM sessions WHERE token_hash = $1`,
		tokenHash, olderThan.String(),
	).Scan(&stale)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrNotFound
	}
	return stale, err
}

// DeleteSession revokes one login immediately.
func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

// DeleteUserSessions revokes every login for an account, which is what a
// password change should do.
func (s *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

// DeleteExpiredSessions removes rows that can no longer authenticate anyone.
func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
