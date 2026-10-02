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
	// SessionTTL is how long a login lasts without being used.
	SessionTTL time.Duration
	// CrossSiteCookie relaxes the session cookie to SameSite=None so it
	// survives a deployment where the frontend and the API are on different
	// sites (a Vercel frontend calling an API elsewhere, say). It forces the
	// Secure attribute with it, because browsers reject SameSite=None without
	// it, so this only works over HTTPS.
	//
	// Off by default: the same-origin deployment keeps SameSite=Lax, which is
	// the stronger setting. With it on, CSRF protection rests entirely on the
	// Origin check in requireSameOrigin.
	CrossSiteCookie bool
	// Rate limits on the account endpoints. See server.Options.
	LoginAttemptsPerIP    int
	LoginAttemptsPerEmail int
	SignupsPerIP          int
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
		SessionTTL:      getenvDuration("SESSION_TTL", 30*24*time.Hour),
		CrossSiteCookie: getenvBool("SESSION_COOKIE_CROSS_SITE", false),

		LoginAttemptsPerIP:    getenvInt("LOGIN_ATTEMPTS_PER_IP", 30),
		LoginAttemptsPerEmail: getenvInt("LOGIN_ATTEMPTS_PER_EMAIL", 5),
		SignupsPerIP:          getenvInt("SIGNUPS_PER_IP", 30),
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

func getenvDuration(key string, def time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return def
	}
	return d
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
