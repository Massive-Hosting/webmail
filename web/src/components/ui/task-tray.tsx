/**
 * Task tray: fixed bar at bottom of screen showing active background tasks.
 *
 * Subscribes to taskProgress WebSocket messages.
 * Each task shows a progress bar + description + cancel button.
 * Completed tasks auto-dismiss after 5 seconds.
 * Failed tasks persist with a retry button.
 */

import React, { useCallback, useReducer, useEffect, useRef } from "react";
import { X, RotateCw, CheckCircle, AlertCircle, Loader2, Download } from "lucide-react";
import { useTaskProgress } from "@/hooks/use-websocket.ts";
import type { WSServerMessage } from "@/lib/websocket.ts";

type TaskProgressEvent = Extract<WSServerMessage, { type: "taskProgress" }>;

interface TaskEntry {
  taskId: string;
  taskType: string;
  progress: number;
  detail: string;
  status: "running" | "completed" | "failed";
  dismissAt?: number; // timestamp to auto-dismiss
}

type TaskAction =
  | { type: "update"; event: TaskProgressEvent }
  | { type: "dismiss"; taskId: string }
  | { type: "tick" };

function taskReducer(state: Map<string, TaskEntry>, action: TaskAction): Map<string, TaskEntry> {
  switch (action.type) {
    case "update": {
      const next = new Map(state);
      const { taskId, taskType, progress, detail, status } = action.event;
      const existing = next.get(taskId);
      const entry: TaskEntry = {
        taskId,
        taskType,
        progress,
        detail,
        status,
      };
      if (status === "completed" && !existing?.dismissAt) {
        entry.dismissAt = Date.now() + 5000;
      }
      next.set(taskId, entry);
      return next;
    }
    case "dismiss": {
      const next = new Map(state);
      next.delete(action.taskId);
      return next;
    }
    case "tick": {
      const now = Date.now();
      let changed = false;
      const next = new Map(state);
      for (const [id, entry] of next) {
        if (entry.dismissAt && entry.dismissAt <= now) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : state;
    }
    default:
      return state;
  }
}

// Filter out long-running timer tasks (snooze, scheduled-send) that aren't
// meaningful to show as progress bars — they sit at 50% until the timer fires.
const HIDDEN_TASK_TYPES = new Set(["snooze", "scheduled-send"]);

export const TaskTray = React.memo(function TaskTray() {
  const [tasks, dispatch] = useReducer(taskReducer, new Map<string, TaskEntry>());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleProgress = useCallback((event: TaskProgressEvent) => {
    if (HIDDEN_TASK_TYPES.has(event.taskType)) return;
    dispatch({ type: "update", event });
  }, []);

  useTaskProgress(handleProgress);

  // Auto-dismiss timer.
  useEffect(() => {
    const hasCompletedTasks = Array.from(tasks.values()).some((t) => t.dismissAt);
    if (hasCompletedTasks && !tickRef.current) {
      tickRef.current = setInterval(() => {
        dispatch({ type: "tick" });
      }, 1000);
    } else if (!hasCompletedTasks && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [tasks]);

  if (tasks.size === 0) return null;

  const taskList = Array.from(tasks.values());

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      role="status"
      aria-live="polite"
      aria-label="Background tasks"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        borderTop: "1px solid var(--color-border-primary)",
        boxShadow: "var(--shadow-lg, 0 -2px 10px rgba(0,0,0,0.1))",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 py-2 space-y-2">
        {taskList.map((task) => (
          <TaskRow
            key={task.taskId}
            task={task}
            onDismiss={() => dispatch({ type: "dismiss", taskId: task.taskId })}
          />
        ))}
      </div>
    </div>
  );
});

interface TaskRowProps {
  task: TaskEntry;
  onDismiss: () => void;
}

const TaskRow = React.memo(function TaskRow({ task, onDismiss }: TaskRowProps) {
  const StatusIcon =
    task.status === "completed"
      ? CheckCircle
      : task.status === "failed"
        ? AlertCircle
        : Loader2;

  const statusColor =
    task.status === "completed"
      ? "var(--color-text-success, #22c55e)"
      : task.status === "failed"
        ? "var(--color-text-error, #ef4444)"
        : "var(--color-text-accent)";

  // Extract blobId from completed export tasks (detail format: "Exported N emails\nblobId:xxx")
  const exportBlobId =
    task.taskType === "export-mailbox" && task.status === "completed"
      ? task.detail.match(/blobId:(\S+)/)?.[1]
      : undefined;

  // Display detail without the blobId suffix
  const displayDetail = task.detail
    ? task.detail.replace(/\nblobId:\S+/, "")
    : task.taskType;

  return (
    <div className="flex items-center gap-3 text-sm">
      <StatusIcon
        size={16}
        style={{ color: statusColor }}
        className={task.status === "running" ? "animate-spin" : ""}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-medium truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {displayDetail}
          </span>
          {task.status === "running" && (
            <span
              className="text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {Math.round(task.progress * 100)}%
            </span>
          )}
        </div>

        {task.status === "running" && (
          <div
            className="h-1.5 rounded-full mt-1 overflow-hidden"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
            role="progressbar"
            aria-valuenow={Math.round(task.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={displayDetail}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round(task.progress * 100)}%`,
                backgroundColor: "var(--color-bg-accent)",
              }}
            />
          </div>
        )}
      </div>

      {exportBlobId && (
        <button
          onClick={() => window.open(`/api/jmap/blob/${exportBlobId}`)}
          className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{ color: "var(--color-text-accent)" }}
          title="Download export"
          aria-label="Download export"
        >
          <Download size={14} />
        </button>
      )}

      {task.status === "failed" && (
        <button
          className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          title="Retry"
          aria-label="Retry task"
        >
          <RotateCw size={14} />
        </button>
      )}

      <button
        onClick={onDismiss}
        className="p-1 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
        style={{ color: "var(--color-text-secondary)" }}
        title="Dismiss"
        aria-label="Dismiss task"
      >
        <X size={14} />
      </button>
    </div>
  );
});
