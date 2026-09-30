// Package seed inserts the problems that ship with the app.
//
// These used to be a compiled-in catalog served straight from memory. They are
// now ordinary rows, authored by a system account and flagged `official` so the
// home page can lead with them. That means the code path that serves them is
// the same one that serves anything a person writes — there is no second,
// privileged kind of problem to keep working.
package seed

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/duckduckcode/backend/internal/auth"
	"github.com/duckduckcode/backend/internal/store"
)

// Language is the only language the runner supports.
const Language = "python"

// System account details. The handle is reserved in auth.reservedHandles, so
// nobody else can take it.
const (
	SystemHandle      = "duckduckcode"
	SystemDisplayName = "duckduckcode"
	SystemEmail       = "problems@duckduckcode.invalid"
)

// Problem is a seeded problem, in the shape the store wants.
type Problem struct {
	Slug       string
	Difficulty string
	Draft      store.ProblemDraft
}

// Apply makes sure the system account and every seeded problem exist.
//
// Idempotent: it is safe on every boot, and it never overwrites a problem that
// already exists, so an operator who edits a seeded problem in place does not
// have their change reverted by the next deploy.
func Apply(ctx context.Context, st *store.Store, log *slog.Logger) error {
	author, err := systemAccount(ctx, st)
	if err != nil {
		return fmt.Errorf("system account: %w", err)
	}
	for _, p := range Problems() {
		exists, err := st.SlugExists(ctx, p.Slug)
		if err != nil {
			return fmt.Errorf("check %s: %w", p.Slug, err)
		}
		if exists {
			continue
		}
		created, err := st.CreateProblem(ctx, author.ID, p.Slug, p.Draft)
		if err != nil {
			return fmt.Errorf("seed %s: %w", p.Slug, err)
		}
		if _, err := st.PublishSeeded(ctx, created.ID); err != nil {
			return fmt.Errorf("publish %s: %w", p.Slug, err)
		}
		log.Info("seeded problem", "slug", p.Slug)
	}
	return nil
}

func systemAccount(ctx context.Context, st *store.Store) (store.User, error) {
	user, err := st.UserByHandle(ctx, SystemHandle)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}

	// An unusable password: the account exists to own rows, and nobody should
	// ever be able to sign in as it. Hashing random bytes means there is no
	// password that matches, not even an empty one.
	filler := make([]byte, 32)
	if _, err := rand.Read(filler); err != nil {
		return store.User{}, err
	}
	hash, err := auth.HashPassword(base64.RawStdEncoding.EncodeToString(filler))
	if err != nil {
		return store.User{}, err
	}
	return st.CreateUser(ctx, SystemEmail, SystemHandle, SystemDisplayName, hash)
}

func args(values ...any) json.RawMessage {
	raw, err := json.Marshal(values)
	if err != nil {
		panic("seed: bad test arguments: " + err.Error())
	}
	return raw
}

func expect(value any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		panic("seed: bad expected value: " + err.Error())
	}
	return raw
}
