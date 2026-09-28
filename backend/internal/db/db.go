// Package db opens the PostgreSQL connection pool and runs schema migrations.
package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"time"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver used by the migrator
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Connect opens a pgx pool and verifies connectivity.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = 30 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

// Migrate applies all pending "up" migrations embedded in the binary.
// golang-migrate takes a PostgreSQL advisory lock while migrating, so
// concurrent starts are safe.
func Migrate(url string) (applied bool, err error) {
	m, err := newMigrator(url)
	if err != nil {
		return false, err
	}
	defer m.Close()
	err = m.Up()
	if errors.Is(err, migrate.ErrNoChange) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("migrate up: %w", err)
	}
	return true, nil
}

// MigrateDown rolls back every migration. Used by the `migrate-down` command
// and by tests to get a clean schema.
func MigrateDown(url string) error {
	m, err := newMigrator(url)
	if err != nil {
		return err
	}
	defer m.Close()
	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate down: %w", err)
	}
	return nil
}

// Version reports the current schema version.
func Version(url string) (version uint, dirty bool, err error) {
	m, err := newMigrator(url)
	if err != nil {
		return 0, false, err
	}
	defer m.Close()
	version, dirty, err = m.Version()
	if errors.Is(err, migrate.ErrNilVersion) {
		return 0, false, nil
	}
	return version, dirty, err
}

func newMigrator(url string) (*migrate.Migrate, error) {
	src, err := iofs.New(migrationFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("load migrations: %w", err)
	}
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return nil, fmt.Errorf("open database for migrations: %w", err)
	}
	driver, err := pgxmigrate.WithInstance(sqlDB, &pgxmigrate.Config{})
	if err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("migration driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "pgx", driver)
	if err != nil {
		sqlDB.Close()
		return nil, err
	}
	return m, nil
}
