package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"
)

// SessionTokenBytes is the entropy in a session token. 256 bits is far beyond
// guessable and costs nothing to carry in a cookie.
const SessionTokenBytes = 32

// DefaultSessionTTL is how long a session lasts without being refreshed.
const DefaultSessionTTL = 30 * 24 * time.Hour

// RefreshAfter is how stale last_seen_at must be before a request bothers
// writing it again. Touching a row on every single request would turn every
// page load into a write.
const RefreshAfter = time.Hour

// NewSessionToken returns a URL-safe random token. This value goes in the
// cookie and is never stored; the database keeps only HashSessionToken of it.
func NewSessionToken() (string, error) {
	b := make([]byte, SessionTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: read session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashSessionToken returns the value stored in sessions.token_hash.
//
// A plain SHA-256 rather than a password hash is the right choice here: the
// input is 256 bits of uniform randomness, so there is no dictionary to attack
// and nothing for a slow hash to buy. The point is only that a leaked database
// contains no usable tokens.
func HashSessionToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
