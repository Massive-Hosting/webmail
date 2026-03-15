/**
 * WebSocket client for real-time updates.
 *
 * Connects to /api/ws, receives state change events from the server,
 * and invalidates TanStack Query cache keys accordingly.
 */

import type { QueryClient } from "@tanstack/react-query";

/** Server → Client message types */
export type WSServerMessage =
  | { type: "stateChange"; changed: Record<string, string> }
  | { type: "ping" }
  | { type: "error"; message: string }
  | {
      type: "taskProgress";
      taskId: string;
      taskType: string;
      progress: number;
      detail: string;
      status: "running" | "completed" | "failed";
    };

/** Client → Server message types */
export type WSClientMessage = { type: "pong" };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";

export type TaskProgressHandler = (event: Extract<WSServerMessage, { type: "taskProgress" }>) => void;

const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const BACKOFF_FACTOR = 2;
const MAX_RETRIES_BEFORE_FALLBACK = 3;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private queryClient: QueryClient;
  private backoff = INITIAL_BACKOFF;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private taskProgressListeners = new Set<TaskProgressHandler>();
  private _status: ConnectionStatus = "disconnected";
  private disposed = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  /** Subscribe to connection status changes */
  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Subscribe to task progress events */
  onTaskProgress(listener: TaskProgressHandler): () => void {
    this.taskProgressListeners.add(listener);
    return () => {
      this.taskProgressListeners.delete(listener);
    };
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  /** Connect to the WebSocket server */
  connect() {
    if (this.disposed) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.handleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setStatus("connected");
      this.backoff = INITIAL_BACKOFF;
      this.retryCount = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data as string);
    };

    this.ws.onclose = () => {
      this.setStatus("disconnected");
      if (!this.disposed) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };

    // Set up visibility API handling.
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          // Tab became visible — reconnect immediately if disconnected.
          if (this._status === "disconnected" || this._status === "failed") {
            this.clearReconnectTimer();
            this.backoff = INITIAL_BACKOFF;
            this.retryCount = 0;
            this.connect();
          }
        } else {
          // Tab hidden — close connection to save resources.
          this.closeQuietly();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  /** Disconnect and clean up */
  disconnect() {
    this.disposed = true;
    this.clearReconnectTimer();
    this.closeQuietly();
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.statusListeners.clear();
    this.taskProgressListeners.clear();
  }

  private closeQuietly() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "client disconnect");
      }
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  private handleReconnect() {
    if (this.disposed) return;

    this.retryCount++;
    if (this.retryCount > MAX_RETRIES_BEFORE_FALLBACK) {
      this.setStatus("failed");
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.backoff);

    this.backoff = Math.min(this.backoff * BACKOFF_FACTOR, MAX_BACKOFF);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(raw: string) {
    let msg: WSServerMessage;
    try {
      msg = JSON.parse(raw) as WSServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "ping":
        this.sendPong();
        break;

      case "stateChange":
        this.handleStateChange(msg.changed);
        break;

      case "taskProgress":
        for (const listener of this.taskProgressListeners) {
          listener(msg);
        }
        break;

      case "error":
        // Log but don't disconnect.
        console.warn("[ws] server error:", msg.message);
        break;
    }
  }

  private sendPong() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "pong" } satisfies WSClientMessage));
    }
  }

  private handleStateChange(changed: Record<string, string>) {
    for (const typeName of Object.keys(changed)) {
      switch (typeName) {
        case "Email":
          void this.queryClient.invalidateQueries({ queryKey: ["emails"] });
          void this.queryClient.invalidateQueries({ queryKey: ["email"] });
          break;
        case "Mailbox":
          void this.queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
          break;
        case "Thread":
          void this.queryClient.invalidateQueries({ queryKey: ["thread"] });
          break;
      }
    }
  }
}
