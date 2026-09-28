// Package config loads server configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully resolved server configuration.
type Config struct {
	// Addr is the listen address, e.g. ":8080".
	Addr string
	// DatabaseURL is a PostgreSQL connection string.
	DatabaseURL string
	// MigrateOnStart applies pending migrations before serving.
	MigrateOnStart bool
	// CORSAllowedOrigins lists origins allowed to call the HTTP API and open
	// WebSockets. Empty means "same origin only" (no CORS headers emitted).
	CORSAllowedOrigins []string
	// SnapshotEvery is the number of persisted updates after which the server
	// asks a client for a compacted snapshot.
	SnapshotEvery int
	// ShutdownTimeout bounds graceful shutdown.
	ShutdownTimeout time.Duration
	// LogFormat is "json" or "text".
	LogFormat string
	// LogLevel is debug|info|warn|error.
	LogLevel string
}

// FromEnv reads configuration from the process environment.
func FromEnv() (Config, error) {
	c := Config{
		Addr:            getenv("ADDR", ":"+getenv("PORT", "8080")),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		MigrateOnStart:  getenvBool("MIGRATE_ON_START", true),
		SnapshotEvery:   getenvInt("SNAPSHOT_EVERY", 200),
		ShutdownTimeout: 15 * time.Second,
		LogFormat:       getenv("LOG_FORMAT", "text"),
		LogLevel:        getenv("LOG_LEVEL", "info"),
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	if raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			if o = strings.TrimSpace(o); o != "" {
				c.CORSAllowedOrigins = append(c.CORSAllowedOrigins, strings.TrimRight(o, "/"))
			}
		}
	}
	if c.SnapshotEvery < 10 {
		c.SnapshotEvery = 10
	}
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func getenvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
