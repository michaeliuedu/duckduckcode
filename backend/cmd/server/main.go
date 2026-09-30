// Command server runs the duckduckcode collaboration backend.
//
// Usage:
//
//	server                 run migrations (if MIGRATE_ON_START) and serve
//	server migrate         apply pending migrations and exit
//	server migrate-down    roll back all migrations and exit
//	server migrate-version print the schema version and exit
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/duckduckcode/backend/internal/config"
	"github.com/duckduckcode/backend/internal/db"
	"github.com/duckduckcode/backend/internal/seed"
	"github.com/duckduckcode/backend/internal/server"
	"github.com/duckduckcode/backend/internal/store"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	log := newLogger(cfg)

	if len(os.Args) > 1 {
		if err := runCommand(os.Args[1], cfg, log); err != nil {
			log.Error("command failed", "command", os.Args[1], "err", err)
			os.Exit(1)
		}
		return
	}

	if err := run(cfg, log); err != nil {
		log.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func runCommand(cmd string, cfg config.Config, log *slog.Logger) error {
	switch cmd {
	case "migrate":
		applied, err := db.Migrate(cfg.DatabaseURL)
		if err != nil {
			return err
		}
		log.Info("migrations complete", "applied", applied)
		return nil
	case "migrate-down":
		if err := db.MigrateDown(cfg.DatabaseURL); err != nil {
			return err
		}
		log.Info("all migrations rolled back")
		return nil
	case "migrate-version":
		v, dirty, err := db.Version(cfg.DatabaseURL)
		if err != nil {
			return err
		}
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
		return nil
	default:
		return fmt.Errorf("unknown command %q", cmd)
	}
}

func run(cfg config.Config, log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.MigrateOnStart {
		applied, err := db.Migrate(cfg.DatabaseURL)
		if err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
		log.Info("database schema up to date", "appliedNew", applied)
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	st := store.New(pool)

	// The problems that ship with the app are ordinary rows owned by a system
	// account. Inserting them here rather than in a migration keeps their text
	// in Go, where it is already written and correctly escaped, and makes the
	// step idempotent: an operator who edits a seeded problem keeps their edit.
	if err := seed.Apply(ctx, st, log); err != nil {
		return fmt.Errorf("seed problems: %w", err)
	}

	srv := server.New(st, log, server.Options{
		AllowedOrigins: cfg.CORSAllowedOrigins,
		SnapshotEvery:  cfg.SnapshotEvery,
		SessionTTL:     cfg.SessionTTL,
		Version:        version,

		LoginAttemptsPerIP:    cfg.LoginAttemptsPerIP,
		LoginAttemptsPerEmail: cfg.LoginAttemptsPerEmail,
		SignupsPerIP:          cfg.SignupsPerIP,
	})

	go sweepExpiredSessions(ctx, st, log)

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout/IdleTimeout: long-lived WebSockets share this server.
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "version", version, "corsOrigins", strings.Join(cfg.CORSAllowedOrigins, ","), "snapshotEvery", cfg.SnapshotEvery)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	srv.Hub().Shutdown(shutdownCtx)
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Info("stopped")
	return nil
}

func newLogger(cfg config.Config) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(cfg.LogLevel) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: lvl}
	var h slog.Handler
	if strings.ToLower(cfg.LogFormat) == "json" {
		h = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	return slog.New(h)
}

// sweepExpiredSessions deletes sessions that can no longer authenticate
// anyone. Expiry is enforced on every lookup, so this is housekeeping rather
// than a security control: without it the table only ever grows.
func sweepExpiredSessions(ctx context.Context, st *store.Store, log *slog.Logger) {
	const every = time.Hour
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			deleted, err := st.DeleteExpiredSessions(ctx)
			if err != nil {
				log.Error("sweep expired sessions", "err", err)
				continue
			}
			if deleted > 0 {
				log.Info("expired sessions removed", "count", deleted)
			}
		}
	}
}
