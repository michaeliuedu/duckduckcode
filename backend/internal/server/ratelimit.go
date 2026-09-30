package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// limiter is a token bucket per key, used to slow down password guessing and
// signup floods.
//
// In memory on purpose: the backend runs as a single task by design (see
// "Scaling the backend" in the README), so there is nothing to share state
// with. If that ever changes, this needs to move to PostgreSQL or Redis along
// with the rest of the per-room coordination.
type limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	// refill is tokens added per second.
	refill float64
	burst  float64
}

type bucket struct {
	tokens   float64
	lastFill time.Time
}

// newLimiter allows burst attempts, refilling to full over the given window.
func newLimiter(burst int, window time.Duration) *limiter {
	return &limiter{
		buckets: make(map[string]*bucket),
		refill:  float64(burst) / window.Seconds(),
		burst:   float64(burst),
	}
}

// allow takes a token for key, reporting whether one was available.
func (l *limiter) allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, lastFill: now}
		l.buckets[key] = b
	}
	b.tokens += now.Sub(b.lastFill).Seconds() * l.refill
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.lastFill = now

	// Evict opportunistically: any bucket that has refilled completely carries
	// no information, so it can go.
	if len(l.buckets) > 1024 {
		for k, other := range l.buckets {
			if k != key && other.tokens+now.Sub(other.lastFill).Seconds()*l.refill >= l.burst {
				delete(l.buckets, k)
			}
		}
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// reset drops a key's bucket, called after a success so that one fat-fingered
// password does not count against someone for the next quarter of an hour.
func (l *limiter) reset(key string) {
	l.mu.Lock()
	delete(l.buckets, key)
	l.mu.Unlock()
}

// clientIP is the best guess at who is calling.
//
// X-Forwarded-For is only trustworthy because the only route to this container
// is through the ALB, which appends the real client address. Reading the last
// entry rather than the first means a client-supplied header cannot spoof it:
// the ALB's own append is always last.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if last := strings.TrimSpace(parts[len(parts)-1]); last != "" {
			return last
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
