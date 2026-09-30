// Package auth holds password hashing, session tokens and the validation rules
// for account fields. It has no knowledge of HTTP or of the database, so all of
// it is testable on its own.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argon2id parameters.
//
// These are the OWASP minimum recommendation (19 MiB, one iteration pass over
// two, one lane). The memory cost is deliberately not higher: the backend runs
// in a 512 MB Fargate task, and a handful of concurrent logins at 64 MiB each
// would turn the login form into a way to exhaust the container.
const (
	argonMemoryKiB uint32 = 19 * 1024
	argonTime      uint32 = 2
	argonThreads   uint8  = 1
	argonKeyLen    uint32 = 32
	argonSaltLen          = 16
)

// ErrInvalidHash is returned when a stored hash cannot be parsed. It means the
// column holds something that is not an argon2id PHC string.
var ErrInvalidHash = errors.New("auth: malformed password hash")

// HashPassword returns an argon2id hash in PHC string format:
//
//	$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
//
// The parameters travel with the hash, so they can be raised later without
// invalidating existing passwords.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// VerifyPassword reports whether password matches encoded.
//
// A false result with a nil error means "wrong password"; a non-nil error means
// the stored hash is unusable, which is a data problem rather than a failed
// login and should be logged.
func VerifyPassword(encoded, password string) (bool, error) {
	params, salt, want, err := parseHash(encoded)
	if err != nil {
		return false, err
	}
	got := argon2.IDKey([]byte(password), salt, params.time, params.memory, params.threads, uint32(len(want)))
	// Constant time: the comparison must not leak how much of the hash matched.
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

type argonParams struct {
	memory  uint32
	time    uint32
	threads uint8
}

func parseHash(encoded string) (argonParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	// ["", "argon2id", "v=19", "m=...,t=...,p=...", salt, hash]
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return argonParams{}, nil, nil, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return argonParams{}, nil, nil, ErrInvalidHash
	}
	var p argonParams
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.time, &p.threads); err != nil {
		return argonParams{}, nil, nil, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return argonParams{}, nil, nil, ErrInvalidHash
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) == 0 {
		return argonParams{}, nil, nil, ErrInvalidHash
	}
	return p, salt, key, nil
}

// dummyHash is verified against when no account matches the submitted email.
//
// Without it, "no such user" would return in microseconds while a real account
// takes the full argon2 cost, and anyone could enumerate registered emails with
// a stopwatch.
var dummyHash = mustHash("password-that-matches-nothing")

// WasteTimeLikeAVerify performs one password verification against a throwaway
// hash. Call it on the no-such-user path so that path costs what a real login
// costs.
func WasteTimeLikeAVerify(password string) {
	_, _ = VerifyPassword(dummyHash, password)
}

func mustHash(password string) string {
	h, err := HashPassword(password)
	if err != nil {
		panic("auth: cannot hash at init: " + err.Error())
	}
	return h
}
