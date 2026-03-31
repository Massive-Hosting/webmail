package worker

import (
	"context"
	"fmt"

	"webmail/internal/activity"
	"webmail/internal/config"
	"webmail/internal/workflow"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

const TaskQueue = "webmail"

// Start creates a Temporal client, registers workflows and activities,
// and starts the worker in a goroutine. Returns the Temporal client
// (for use by task handlers) and a cleanup function.
func Start(ctx context.Context, cfg *config.Config, pool *pgxpool.Pool, rdb *redis.Client, log zerolog.Logger) (client.Client, func(), error) {
	log = log.With().Str("component", "temporal-worker").Logger()

	c, err := client.Dial(client.Options{
		HostPort:  cfg.TemporalAddress,
		Namespace: "default",
		Logger:    &zerologAdapter{log: log},
	})
	if err != nil {
		return nil, nil, fmt.Errorf("dialing temporal: %w", err)
	}

	w := worker.New(c, TaskQueue, worker.Options{})

	// Register activities.
	acts := activity.NewActivities(pool, rdb, log, cfg.SecretEncryptionKey)
	w.RegisterActivity(acts)

	// Register workflows.
	w.RegisterWorkflow(workflow.BulkMoveEmailsWorkflow)
	w.RegisterWorkflow(workflow.BulkDeleteEmailsWorkflow)
	w.RegisterWorkflow(workflow.BulkMarkReadWorkflow)
	w.RegisterWorkflow(workflow.ExportMailboxWorkflow)
	w.RegisterWorkflow(workflow.ImportMailboxWorkflow)
	w.RegisterWorkflow(workflow.ScheduledSendWorkflow)
	w.RegisterWorkflow(workflow.SnoozeEmailWorkflow)
	w.RegisterWorkflow(workflow.IMAPImportWorkflow)

	// Start worker in background.
	if err := w.Start(); err != nil {
		c.Close()
		return nil, nil, fmt.Errorf("starting worker: %w", err)
	}

	log.Info().Str("queue", TaskQueue).Str("address", cfg.TemporalAddress).Msg("temporal worker started")

	cleanup := func() {
		log.Info().Msg("stopping temporal worker")
		w.Stop()
		c.Close()
	}

	return c, cleanup, nil
}

// zerologAdapter adapts zerolog to Temporal's log interface.
type zerologAdapter struct {
	log zerolog.Logger
}

func (z *zerologAdapter) Debug(msg string, keyvals ...interface{}) {
	z.log.Debug().Fields(keyvals).Msg(msg)
}

func (z *zerologAdapter) Info(msg string, keyvals ...interface{}) {
	z.log.Info().Fields(keyvals).Msg(msg)
}

func (z *zerologAdapter) Warn(msg string, keyvals ...interface{}) {
	z.log.Warn().Fields(keyvals).Msg(msg)
}

func (z *zerologAdapter) Error(msg string, keyvals ...interface{}) {
	z.log.Error().Fields(keyvals).Msg(msg)
}
