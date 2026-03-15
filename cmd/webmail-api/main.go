package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	// Initialize session encryption.
	sessMgr, err := session.NewManager(cfg.SecretEncryptionKey, cfg.SessionMaxAge)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize session manager")
	}

	// Core API client.
	coreClient := hosting.NewCoreAPIClient(cfg.CoreAPIURL, cfg.CoreAPIKey)

	// WebSocket hub.
	hub := ws.NewHub(log)
	defer hub.Shutdown()

	// Rate limiters.
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitPerMinute)
	loginLimiter := middleware.NewLoginRateLimiter()

	// Handlers.
	authHandler := handler.NewAuthHandler(sessMgr, queries, coreClient, loginLimiter, log, cfg.SessionMaxAge)
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
			r.Use(middleware.Auth(sessMgr))
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
