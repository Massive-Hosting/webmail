package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"
)

// RateLimiter implements a simple token bucket rate limiter.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    int           // tokens per interval
	interval time.Duration
}

type bucket struct {
	tokens    int
	lastReset time.Time
}

// NewRateLimiter creates a rate limiter with the given rate per minute.
func NewRateLimiter(ratePerMinute int) *RateLimiter {
	return &RateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     ratePerMinute,
		interval: time.Minute,
	}
}

// Allow checks if the given key is within rate limits.
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok || now.Sub(b.lastReset) >= rl.interval {
		rl.buckets[key] = &bucket{tokens: rl.rate - 1, lastReset: now}
		return true
	}

	if b.tokens <= 0 {
		return false
	}
	b.tokens--
	return true
}

// RetryAfter returns the seconds until the next token is available.
func (rl *RateLimiter) RetryAfter(key string) int {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		return 0
	}
	remaining := rl.interval - time.Since(b.lastReset)
	if remaining <= 0 {
		return 0
	}
	return int(remaining.Seconds()) + 1
}

// Middleware returns an HTTP middleware that rate limits by user email from session.
func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess := SessionFromContext(r.Context())
			key := r.RemoteAddr
			if sess != nil {
				key = sess.Email
			}

			if !rl.Allow(key) {
				w.Header().Set("Retry-After", strconv.Itoa(rl.RetryAfter(key)))
				http.Error(w, `{"error":"rate_limit_exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// LoginRateLimiter has stricter limits for login attempts.
type LoginRateLimiter struct {
	byEmail *RateLimiter
	byIP    *RateLimiter
}

// NewLoginRateLimiter creates a login-specific rate limiter.
func NewLoginRateLimiter() *LoginRateLimiter {
	return &LoginRateLimiter{
		byEmail: NewRateLimiter(10), // 10 per email per minute
		byIP:    NewRateLimiter(30), // 30 per IP per minute
	}
}

// Middleware returns an HTTP middleware for login rate limiting.
func (lrl *LoginRateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr

			if !lrl.byIP.Allow(ip) {
				w.Header().Set("Retry-After", strconv.Itoa(lrl.byIP.RetryAfter(ip)))
				http.Error(w, `{"error":"rate_limit_exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CheckEmail checks the per-email rate limit (called after parsing the login body).
func (lrl *LoginRateLimiter) CheckEmail(email string) (bool, int) {
	if !lrl.byEmail.Allow(email) {
		return false, lrl.byEmail.RetryAfter(email)
	}
	return true, 0
}
