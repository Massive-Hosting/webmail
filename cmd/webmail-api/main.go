package main

import (
	"context"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	webmail "webmail"
	"webmail/internal/config"
	"webmail/internal/db"
	"webmail/internal/handler"
	"webmail/internal/hosting"
	"webmail/internal/middleware"
	"webmail/internal/session"
	"webmail/internal/ws"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

func main() {
	log := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}).
		With().Timestamp().Caller().Logger()

	// Load configuration.
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}
	log.Info().Str("listen", cfg.ListenAddr).Msg("configuration loaded")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Connect to database.
	var pool *pgxpool.Pool
	var queries *db.Queries
	if cfg.DatabaseURL != "" {
		pool, err = db.Connect(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to connect to database")
		}
		defer pool.Close()
		queries = db.NewQueries(pool)
		log.Info().Msg("database connected")

		// Run migrations.
		if err := db.RunMigrations(cfg.DatabaseURL, "migrations"); err != nil {
			log.Fatal().Err(err).Msg("failed to run migrations")
		}
		log.Info().Msg("migrations complete")
	} else {
		log.Warn().Msg("no DATABASE_URL configured, running without database")
	}

	// Connect to Valkey/Redis.
	redisOpts, err := redis.ParseURL(cfg.ValkeyURL)
	if err != nil {
		log.Fatal().Err(err).Str("url", cfg.ValkeyURL).Msg("failed to parse VALKEY_URL")
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to valkey")
	}
	log.Info().Str("url", cfg.ValkeyURL).Msg("valkey connected")

	// Initialize session store backed by Valkey.
	sessStore := session.NewStore(rdb, cfg.SessionMaxAge)

	// Core API client.
	coreClient := hosting.NewCoreAPIClient(cfg.CoreAPIURL, cfg.CoreAPIKey)

	// WebSocket hub.
	hub := ws.NewHub(log)
	defer hub.Shutdown()

	// Rate limiters.
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitPerMinute)
	loginLimiter := middleware.NewLoginRateLimiter()

	// Handlers.
	authHandler := handler.NewAuthHandler(sessStore, queries, coreClient, loginLimiter, log)
	proxyHandler := handler.NewProxyHandler(log)
	blobHandler := handler.NewBlobHandler(cfg.MaxUploadSize, log)
	settingsHandler := handler.NewSettingsHandler(queries, log)
	pgpHandler := handler.NewPGPHandler(queries, log)
	partnerHandler := handler.NewPartnerHandler()
	// Progress relay (Valkey subscriber is nil until Phase 3 Valkey integration).
	progressRelay := ws.NewProgressRelay(hub, nil, log)
	wsHandler := handler.NewWebSocketHandler(hub, progressRelay, log)
	healthHandler := handler.NewHealthHandler(pool)

	// Build router.
	r := chi.NewRouter()

	// Global middleware.
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.SecurityHeaders)

	if queries != nil {
		r.Use(middleware.Partner(queries))
	}

	// Health and metrics (no auth required).
	r.Get("/healthz", healthHandler.Liveness)
	r.Get("/readyz", healthHandler.Readiness)
	r.Handle("/metrics", promhttp.Handler())

	// API routes.
	r.Route("/api", func(r chi.Router) {
		// Public endpoints.
		r.Get("/partner", partnerHandler.Get)

		// Auth endpoints (login has its own rate limiter).
		r.Group(func(r chi.Router) {
			r.Use(loginLimiter.Middleware())
			r.Post("/auth/login", authHandler.Login)
		})

		// Authenticated endpoints.
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(sessStore))
			r.Use(rateLimiter.Middleware())

			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/session", authHandler.Session)

			// JMAP proxy.
			r.Post("/jmap", proxyHandler.JMAP)
			r.Get("/jmap/blob/{blobId}", proxyHandler.BlobDownload)
			r.Post("/jmap/upload", proxyHandler.BlobUpload)

			// Blob/attachment proxy.
			r.Post("/blob/upload", blobHandler.Upload)
			r.Get("/blob/{blobId}", blobHandler.Download)
			r.Get("/blob/{blobId}/inline", blobHandler.Inline)

			// Settings.
			r.Get("/settings", settingsHandler.Get)
			r.Put("/settings", settingsHandler.Put)

			// PGP.
			r.Get("/pgp/key", pgpHandler.GetKey)
			r.Put("/pgp/key", pgpHandler.PutKey)
			r.Delete("/pgp/key", pgpHandler.DeleteKey)
			r.Get("/pgp/lookup", pgpHandler.Lookup)

			// WebSocket.
			r.Get("/ws", wsHandler.Upgrade)
		})
	})

	// Serve embedded frontend static files (production builds).
	if webmail.HasStaticFiles {
		log.Info().Msg("serving embedded frontend static files")

		// Strip the "web/dist" prefix so files are served at /.
		distFS, err := fs.Sub(webmail.StaticFiles, "web/dist")
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create sub filesystem for static files")
		}

		// Read index.html once for SPA fallback.
		indexHTML, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			log.Fatal().Err(err).Msg("failed to read index.html from embedded files")
		}

		fileServer := http.FileServer(http.FS(distFS))

		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")

			// Try to serve the file directly.
			f, err := distFS.(fs.ReadFileFS).ReadFile(path)
			if err == nil && path != "" {
				// Set cache headers based on path.
				if strings.HasPrefix(path, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				// Serve via the file server for correct content-type detection.
				_ = f
				fileServer.ServeHTTP(w, r)
				return
			}

			// SPA fallback: serve index.html with no-cache.
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(indexHTML)
		})
	}

	// HTTP server.
	srv := &http.Server{
		Addr:           cfg.ListenAddr,
		Handler:        r,
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   60 * time.Second,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	// Start server.
	go func() {
		log.Info().Str("addr", cfg.ListenAddr).Msg("starting webmail API server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	// Wait for shutdown signal.
	<-ctx.Done()
	log.Info().Msg("shutting down server")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown failed")
	}

	log.Info().Msg("server stopped")
}
