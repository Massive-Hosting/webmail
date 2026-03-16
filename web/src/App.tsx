/** Main application component with routing and auth */

import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getSession } from "@/api/client.ts";
import { AppShell } from "@/components/layout/app-shell.tsx";
import { ConfirmProvider } from "@/contexts/confirm-context.tsx";
import { LoginPage } from "@/components/login-page.tsx";
import { useSettingsStore } from "@/stores/settings-store.ts";
import { useAuthStore } from "@/stores/auth-store.ts";
import { prefetchInitialMailData } from "@/api/batch.ts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  },
});

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const loadSettings = useSettingsStore((s) => s.loadFromServer);
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    getSession()
      .then((session) => {
        setSession(session.email, session.accountId);
        setAuthState("authenticated");
        // Load settings from server after authentication
        loadSettings();
        // Batch-prefetch mailboxes + identities in a single JMAP request
        // and populate the TanStack Query cache before hooks mount.
        void prefetchInitialMailData(queryClient);
      })
      .catch(() => setAuthState("unauthenticated"));
  }, [loadSettings, setSession]);

  const handleLoginSuccess = useCallback(() => {
    getSession()
      .then((session) => {
        setSession(session.email, session.accountId);
      })
      .catch(() => {});
    setAuthState("authenticated");
    loadSettings();
    void prefetchInitialMailData(queryClient);
  }, [loadSettings, setSession]);

  if (authState === "loading") {
    return <LoadingScreen />;
  }

  if (authState === "unauthenticated") {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

function LoadingScreen() {
  return (
    <div
      className="flex items-center justify-center min-h-dvh"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--color-bg-accent)", borderTopColor: "transparent" }}
      />
    </div>
  );
}
