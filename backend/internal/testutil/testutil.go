// Package testutil provides helpers for integration tests that need a real
// PostgreSQL database. Tests are skipped unless TEST_DATABASE_URL is set.
package testutil

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/duckduckcode/backend/internal/db"
)

var (
	migrateOnce sync.Once
	migrateErr  error
)

// DatabaseURL returns TEST_DATABASE_URL or skips the test.
func DatabaseURL(t testing.TB) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping database integration test")
	}
	return url
}

// Pool returns a connected pool against a freshly migrated schema. The schema
// is reset (down + up) once per test binary; individual tests use random room
// ids so they do not interfere with each other.
func Pool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := DatabaseURL(t)
	migrateOnce.Do(func() {
		if err := db.MigrateDown(url); err != nil {
			migrateErr = err
			return
		}
		_, migrateErr = db.Migrate(url)
	})
	if migrateErr != nil {
		t.Fatalf("migrate test database: %v", migrateErr)
	}
	pool, err := db.Connect(context.Background(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}
