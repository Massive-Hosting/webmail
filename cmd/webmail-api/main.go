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
	"webmail/internal/worker"
	"webmail/internal/ws"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// version is set via ldflags at build time: -ldflags "-X main.version=v1.0.0"
var version = "dev"

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
	sessStore := session.NewStore(rdb, cfg.SessionMaxAge, cfg.SecretEncryptionKey)

	// WebSocket hub.
	hub := ws.NewHub(log)
	defer hub.Shutdown()

	// Rate limiters.
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitPerMinute)
	loginLimiter := middleware.NewLoginRateLimiter()

	// Auth handler: standalone or hosted mode.
	var authHandler *handler.AuthHandler
	if cfg.IsStandalone() {
		log.Info().Str("stalwart", cfg.StalwartURL).Msg("standalone mode: direct Stalwart connection")
		authHandler = handler.NewStandaloneAuthHandler(sessStore, queries, cfg.StalwartURL, cfg.StalwartAdminToken, loginLimiter, log)
	} else {
		coreClient := hosting.NewCoreAPIClient(cfg.CoreAPIURL, cfg.CoreAPIKey)
		authHandler = handler.NewAuthHandler(sessStore, queries, coreClient, loginLimiter, log)
	}
	proxyHandler := handler.NewProxyHandler(log)
	blobHandler := handler.NewBlobHandler(cfg.MaxUploadSize, log)
	settingsHandler := handler.NewSettingsHandler(queries, log)
	pgpHandler := handler.NewPGPHandler(queries, log)
	partnerHandler := handler.NewPartnerHandler()
	// Progress relay with real Valkey subscriber.
	valkeySubscriber := ws.NewValkeySubscriber(rdb)
	progressRelay := ws.NewProgressRelay(hub, valkeySubscriber, log)
	wsHandler := handler.NewWebSocketHandler(hub, progressRelay, log)
	spamHandler := handler.NewSpamHandler(log)
	securityHandler := handler.NewSecurityHandler(rdb, queries, log)
	participantsHandler := handler.NewParticipantsHandler(queries, log)
	availabilityHandler := handler.NewAvailabilityHandler(queries, log)
	healthHandler := handler.NewHealthHandler(pool)

	// Start Temporal worker (in-process).
	temporalClient, temporalCleanup, err := worker.Start(ctx, cfg, pool, rdb, log)
	if err != nil {
		log.Warn().Err(err).Msg("failed to start temporal worker, task endpoints will be unavailable")
	} else {
		defer temporalCleanup()
	}

	// Task handler (only if Temporal connected).
	var taskHandler *handler.TaskHandler
	if temporalClient != nil {
		taskHandler = handler.NewTaskHandler(temporalClient, cfg.SecretEncryptionKey, log)
	}

	// AI handler (only if enabled).
	var aiHandler *handler.AIHandler
	if cfg.AIEnabled && cfg.AIAPIKey != "" {
		aiHandler = handler.NewAIHandler(cfg, log)
		log.Info().Str("model", cfg.AIModel).Msg("AI assistant enabled")
	}

	// TURN handler (only if configured).
	var turnHandler *handler.TURNHandler
	if cfg.TURNSecret != "" && cfg.TURNServers != "" {
		turnHandler = handler.NewTURNHandler(cfg.TURNSecret, cfg.TURNServers)
		log.Info().Str("servers", cfg.TURNServers).Msg("TURN relay configured")
	}

	// Call room handler for guest Wave calls.
	callRoomHandler := handler.NewCallRoomHandler()

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

		// Guest Wave call endpoints (public — validated by room ID).
		r.Get("/call-rooms/{id}", callRoomHandler.Get)
		if turnHandler != nil {
			r.Get("/call-rooms/{id}/turn", turnHandler.GuestCredentials(callRoomHandler))
		}
		r.Get("/call-rooms/{id}/ws", func(w http.ResponseWriter, r *http.Request) {
			roomID := r.PathValue("id")
			room := callRoomHandler.GetRoom(roomID)
			if room == nil {
				http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
				return
			}
			if err := hub.HandleGuestConnection(w, r, roomID); err != nil {
				log.Error().Err(err).Msg("guest websocket upgrade failed")
			}
		})

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

			// Spam training.
			r.Post("/spam/train", spamHandler.Train)

			// Security: TOTP 2FA and app passwords.
			r.Get("/security/totp/status", securityHandler.TOTPStatus)
			r.Post("/security/totp/setup", securityHandler.TOTPSetup)
			r.Post("/security/totp/confirm", securityHandler.TOTPConfirm)
			r.Delete("/security/totp", securityHandler.TOTPDisable)
			r.Get("/security/app-passwords", securityHandler.AppPasswordList)
			r.Post("/security/app-passwords", securityHandler.AppPasswordCreate)
			r.Delete("/security/app-passwords/{id}", securityHandler.AppPasswordDelete)

			// Event participants (stored in webmail DB since Stalwart doesn't return them).
			r.Get("/events/{eventId}/participants", participantsHandler.Get)
			r.Put("/events/{eventId}/participants", participantsHandler.Put)
			r.Delete("/events/{eventId}/participants", participantsHandler.Delete)
			r.Post("/events/participants/batch", participantsHandler.BatchGet)

			// Free/busy availability and tenant directory.
			r.Post("/availability", availabilityHandler.FreeBusy)
			r.Post("/availability/team", availabilityHandler.TeamAvailability)
			r.Post("/absence-check", availabilityHandler.AbsenceCheck)
			r.Post("/directory/search", availabilityHandler.Directory)
			r.Get("/domain-settings", availabilityHandler.GetDomainSettings)
			r.Get("/resources", availabilityHandler.ListResources)

			// WebSocket.
			r.Get("/ws", wsHandler.Upgrade)

			// Task endpoints (Temporal workflows).
			if taskHandler != nil {
				r.Post("/tasks/bulk-move", taskHandler.BulkMove)
				r.Post("/tasks/bulk-delete", taskHandler.BulkDelete)
				r.Post("/tasks/bulk-mark-read", taskHandler.BulkMarkRead)
				r.Post("/tasks/export-mailbox", taskHandler.ExportMailbox)
				r.Post("/tasks/import-mailbox", taskHandler.ImportMailbox)
				r.Post("/tasks/schedule-send", taskHandler.ScheduleSend)
				r.Post("/tasks/snooze", taskHandler.Snooze)
				r.Get("/tasks/{taskId}", taskHandler.GetTaskStatus)
			}

			// AI assistant — status endpoint always registered so frontend
			// gets a clean response instead of 404.
			if aiHandler != nil {
				r.Get("/ai/status", aiHandler.Status)
				r.Post("/ai/compose", aiHandler.Compose)
				r.Post("/ai/reply", aiHandler.Reply)
				r.Post("/ai/rewrite", aiHandler.Rewrite)
			} else {
				r.Get("/ai/status", func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusOK)
					w.Write([]byte(`{"enabled":false}`)) //nolint:errcheck
				})
			}

			// TURN credentials for Wave calls.
			if turnHandler != nil {
				r.Get("/turn/credentials", turnHandler.Credentials)
			}

			// Call room creation (authenticated).
			r.Post("/call-rooms", callRoomHandler.Create)
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
