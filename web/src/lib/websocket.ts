/**
 * WebSocket client for real-time updates.
 *
 * Connects to /api/ws, receives state change events from the server,
 * and uses JMAP delta sync to surgically update the cache when possible,
 * falling back to full invalidation when delta sync is unavailable.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useJMAPStateStore } from "@/stores/jmap-state-store.ts";
import { fetchEmailChanges, fetchMailboxChanges } from "@/api/mail.ts";
import type { EmailListItem } from "@/types/mail.ts";
import type { Mailbox } from "@/types/mail.ts";

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
          void this.handleEmailDeltaSync(changed[typeName]);
          break;
        case "Mailbox":
          void this.handleMailboxDeltaSync(changed[typeName]);
          break;
        case "Thread":
          void this.queryClient.invalidateQueries({ queryKey: ["thread"] });
          break;
      }
    }
  }

  /** Attempt delta sync for Email changes; fall back to full invalidation */
  private async handleEmailDeltaSync(_newState: string) {
    const store = useJMAPStateStore.getState();
    const sinceState = store.emailState;

    // No stored state — we haven't fetched yet, just invalidate
    if (!sinceState) {
      void this.queryClient.invalidateQueries({ queryKey: ["emails"] });
      void this.queryClient.invalidateQueries({ queryKey: ["email"] });
      return;
    }

    try {
      const changes = await fetchEmailChanges(sinceState);

      // Update stored state
      store.setEmailState(changes.newState);

      // Surgically update cached email lists
      this.queryClient.setQueriesData<{
        pages: { emails: EmailListItem[]; total: number; position: number }[];
        pageParams: unknown[];
      }>(
        { queryKey: ["emails"] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              let emails = page.emails;

              // Remove destroyed emails
              if (changes.destroyed.length > 0) {
                const destroyedSet = new Set(changes.destroyed);
                emails = emails.filter((e) => !destroyedSet.has(e.id));
              }

              // Update changed emails
              if (changes.updated.length > 0) {
                const updatedMap = new Map(changes.updated.map((e) => [e.id, e]));
                emails = emails.map((e) => updatedMap.get(e.id) ?? e);
              }

              // Prepend created emails to first page
              // (they'll be re-sorted on next full fetch, but this gives instant visibility)
              return { ...page, emails };
            }),
          };
        },
      );

      // Add created emails to the first page of each matching query
      if (changes.created.length > 0) {
        this.queryClient.setQueriesData<{
          pages: { emails: EmailListItem[]; total: number; position: number }[];
          pageParams: unknown[];
        }>(
          { queryKey: ["emails"] },
          (oldData) => {
            if (!oldData || oldData.pages.length === 0) return oldData;
            const firstPage = oldData.pages[0];
            return {
              ...oldData,
              pages: [
                {
                  ...firstPage,
                  emails: [...changes.created, ...firstPage.emails],
                  total: firstPage.total + changes.created.length,
                },
                ...oldData.pages.slice(1),
              ],
            };
          },
        );
      }

      // Invalidate single-email caches for changed/destroyed emails
      const affectedIds = [
        ...changes.updated.map((e) => e.id),
        ...changes.destroyed,
      ];
      for (const id of affectedIds) {
        void this.queryClient.invalidateQueries({ queryKey: ["email", id] });
      }

      // If there are more changes, fall back to full invalidation
      if (changes.hasMoreChanges) {
        void this.queryClient.invalidateQueries({ queryKey: ["emails"] });
        void this.queryClient.invalidateQueries({ queryKey: ["email"] });
      }
    } catch (err: unknown) {
      // cannotCalculateChanges or any other error: fall back to full invalidation
      store.setEmailState(null as unknown as string);
      void this.queryClient.invalidateQueries({ queryKey: ["emails"] });
      void this.queryClient.invalidateQueries({ queryKey: ["email"] });
    }
  }

  /** Attempt delta sync for Mailbox changes; fall back to full invalidation */
  private async handleMailboxDeltaSync(_newState: string) {
    const store = useJMAPStateStore.getState();
    const sinceState = store.mailboxState;

    // No stored state — just invalidate
    if (!sinceState) {
      void this.queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      return;
    }

    try {
      const changes = await fetchMailboxChanges(sinceState);

      // Update stored state
      store.setMailboxState(changes.newState);

      // Surgically update cached mailbox list
      this.queryClient.setQueriesData<Mailbox[]>(
        { queryKey: ["mailboxes"] },
        (oldData) => {
          if (!oldData) return oldData;

          let mailboxes = [...oldData];

          // Remove destroyed
          if (changes.destroyed.length > 0) {
            const destroyedSet = new Set(changes.destroyed);
            mailboxes = mailboxes.filter((m) => !destroyedSet.has(m.id));
          }

          // Update changed
          if (changes.updated.length > 0) {
            const updatedMap = new Map(changes.updated.map((m) => [m.id, m]));
            mailboxes = mailboxes.map((m) => updatedMap.get(m.id) ?? m);
          }

          // Add created
          if (changes.created.length > 0) {
            mailboxes = [...mailboxes, ...changes.created];
          }

          return mailboxes;
        },
      );

      // If there are more changes, fall back to full invalidation
      if (changes.hasMoreChanges) {
        void this.queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
      }
    } catch {
      // cannotCalculateChanges or any other error: fall back
      store.setMailboxState(null as unknown as string);
      void this.queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    }
  }
}
