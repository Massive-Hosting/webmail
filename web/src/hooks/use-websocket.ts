/**
 * React hook for WebSocket connection management.
 *
 * Initializes the WebSocket on mount, provides connection status,
 * and cleans up on unmount / logout.
 */

import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  WebSocketClient,
  type ConnectionStatus,
  type TaskProgressHandler,
} from "@/lib/websocket.ts";

/** Singleton WebSocket client instance */
let wsClient: WebSocketClient | null = null;

/** Get or create the WebSocket client singleton */
function getWSClient(queryClient: ReturnType<typeof useQueryClient>): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient(queryClient);
  }
  return wsClient;
}

/** Destroy the WebSocket client singleton */
export function destroyWSClient() {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}

/**
 * Hook to manage WebSocket connection lifecycle.
 *
 * Call this once at the top-level of your authenticated app shell.
 * Returns the current connection status.
 */
export function useWebSocket(): {
  status: ConnectionStatus;
  isConnected: boolean;
} {
  const queryClient = useQueryClient();
  const clientRef = useRef<WebSocketClient | null>(null);

  // Create or reuse the client.
  if (!clientRef.current) {
    clientRef.current = getWSClient(queryClient);
  }

  const client = clientRef.current;

  // Connect on mount.
  useEffect(() => {
    client.connect();

    return () => {
      // Don't disconnect on unmount — the singleton persists across re-renders.
      // Disconnect is handled by destroyWSClient() on logout.
    };
  }, [client]);

  // Subscribe to status changes via useSyncExternalStore.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return client.onStatusChange(onStoreChange);
    },
    [client],
  );

  const getSnapshot = useCallback(() => {
    return client.status;
  }, [client]);

  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    status,
    isConnected: status === "connected",
  };
}

/**
 * Hook to subscribe to task progress events from the WebSocket.
 */
export function useTaskProgress(handler: TaskProgressHandler) {
  const queryClient = useQueryClient();
  const clientRef = useRef<WebSocketClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = getWSClient(queryClient);
  }

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    return client.onTaskProgress(handler);
  }, [handler]);
}
