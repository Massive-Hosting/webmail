/** Message list hook with pagination and infinite scroll */

import { useInfiniteQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchEmails, updateEmails, destroyEmails } from "@/api/mail.ts";
import type { EmailListItem } from "@/types/mail.ts";
import type { JMAPFilter } from "@/types/jmap.ts";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/use-websocket.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import { useSettingsStore } from "@/stores/settings-store.ts";

const PAGE_SIZE = 50;

export function useMessages(mailboxId: string | null, filter?: JMAPFilter) {
  const queryClient = useQueryClient();
  const { isConnected } = useWebSocket();
  const sortNewestFirst = useUIStore((s) => s.sortNewestFirst);
  const conversationView = useSettingsStore((s) => s.conversationView);

  const queryKey = ["emails", mailboxId, filter, sortNewestFirst, conversationView] as const;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      if (!mailboxId && !filter) {
        return { emails: [] as EmailListItem[], total: 0, position: 0, threadCounts: {} as Record<string, number> };
      }
      return fetchEmails({
        mailboxId: mailboxId ?? undefined,
        position: pageParam as number,
        limit: PAGE_SIZE,
        filter,
        sort: [{ property: "receivedAt", isAscending: !sortNewestFirst }],
        collapseThreads: conversationView,
      });
    },
    getNextPageParam: (lastPage) => {
      // Stop if this page returned no emails (end of results)
      if (lastPage.emails.length === 0) return undefined;
      const nextPosition = lastPage.position + lastPage.emails.length;
      // Also stop if total is known and we've reached it
      if (lastPage.total > 0 && nextPosition >= lastPage.total) return undefined;
      return nextPosition;
    },
    initialPageParam: 0,
    enabled: !!mailboxId || (filter != null && Object.keys(filter).length > 0),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // When WebSocket is connected, disable polling — we get push updates.
    // When disconnected, fall back to 60s polling.
    refetchInterval: isConnected ? false : 60000,
    refetchIntervalInBackground: false,
  });

  /** Flattened list of all loaded emails */
  const emails = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.emails);
  }, [query.data]);

  /** Merged thread counts from all pages */
  const threadCounts = useMemo(() => {
    if (!query.data?.pages) return {} as Record<string, number>;
    const merged: Record<string, number> = {};
    for (const page of query.data.pages) {
      if (page.threadCounts) {
        Object.assign(merged, page.threadCounts);
      }
    }
    return merged;
  }, [query.data]);

  const total = query.data?.pages[0]?.total ?? 0;

  /** Star/unstar email (optimistic) */
  const starMutation = useMutation({
    mutationFn: async (params: { emailId: string; flagged: boolean }) => {
      await updateEmails({
        [params.emailId]: {
          [`keywords/$flagged`]: params.flagged ? true : null,
        },
      });
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as ReturnType<typeof useInfiniteQueryData>;
      queryClient.setQueryData(
        queryKey,
        optimisticUpdateEmail(prev, params.emailId, (email) => {
          const keywords = { ...email.keywords };
          if (params.flagged) {
            keywords["$flagged"] = true;
          } else {
            delete keywords["$flagged"];
          }
          return { ...email, keywords };
        }),
      );
      // Also optimistically update thread-list caches (for expanded thread children)
      queryClient.setQueriesData<{ thread: unknown; emails: EmailListItem[] }>(
        { queryKey: ["thread-list"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            emails: old.emails.map((e) =>
              e.id === params.emailId
                ? (() => {
                    const keywords = { ...e.keywords };
                    if (params.flagged) {
                      keywords["$flagged"] = true;
                    } else {
                      delete keywords["$flagged"];
                    }
                    return { ...e, keywords };
                  })()
                : e,
            ),
          };
        },
      );
      return { prev };
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKey, context.prev);
      }
      toast.error("Failed to update message");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["thread-list"] });
    },
  });

  /** Mark read/unread (optimistic) */
  const markReadMutation = useMutation({
    mutationFn: async (params: { emailIds: string[]; seen: boolean }) => {
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of params.emailIds) {
        updates[id] = {
          [`keywords/$seen`]: params.seen ? true : null,
        };
      }
      await updateEmails(updates);
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as ReturnType<typeof useInfiniteQueryData>;
      let data = prev;
      for (const emailId of params.emailIds) {
        data = optimisticUpdateEmail(data, emailId, (email) => {
          const keywords = { ...email.keywords };
          if (params.seen) {
            keywords["$seen"] = true;
          } else {
            delete keywords["$seen"];
          }
          return { ...email, keywords };
        });
      }
      queryClient.setQueryData(queryKey, data);
      return { prev };
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKey, context.prev);
      }
      toast.error("Failed to update message");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  /** Move emails to a different mailbox (optimistic) */
  const moveMutation = useMutation({
    mutationFn: async (params: {
      emailIds: string[];
      fromMailboxId: string;
      toMailboxId: string;
    }) => {
      const updates: Record<string, Record<string, unknown>> = {};
      for (const id of params.emailIds) {
        updates[id] = {
          [`mailboxIds/${params.fromMailboxId}`]: null,
          [`mailboxIds/${params.toMailboxId}`]: true,
        };
      }
      await updateEmails(updates);
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as ReturnType<typeof useInfiniteQueryData>;
      // Flatten original emails before removal for index lookup
      const originalEmails = prev?.pages?.flatMap((p) => p.emails) ?? [];
      // Remove from current list optimistically (read fresh from cache)
      let data = prev;
      for (const emailId of params.emailIds) {
        data = optimisticRemoveEmail(data, emailId);
      }
      queryClient.setQueryData(queryKey, data);
      // Navigate based on autoAdvance setting
      const uiStore = useUIStore.getState();
      if (params.emailIds.includes(uiStore.selectedEmailId ?? "")) {
        const autoAdvance = useSettingsStore.getState().autoAdvance;
        const remainingEmails = data?.pages?.flatMap((p) => p.emails) ?? [];
        const deletedIndex = originalEmails.findIndex((e) => e.id === uiStore.selectedEmailId);
        if (autoAdvance === "next" && remainingEmails.length > 0) {
          const nextIndex = Math.min(deletedIndex, remainingEmails.length - 1);
          const next = remainingEmails[nextIndex];
          uiStore.setSelectedEmail(next.id, next.threadId);
        } else if (autoAdvance === "previous" && remainingEmails.length > 0) {
          const prevIndex = Math.max(0, deletedIndex - 1);
          const prev = remainingEmails[prevIndex];
          uiStore.setSelectedEmail(prev.id, prev.threadId);
        } else {
          uiStore.setSelectedEmail(null, null);
        }
      }
      for (const id of params.emailIds) {
        if (uiStore.selectedEmailIds.has(id)) {
          uiStore.toggleEmailSelection(id);
        }
      }
      return { prev, params };
    },
    onSuccess: (_data, params) => {
      toast("Messages moved", {
        action: {
          label: "Undo",
          onClick: () => {
            moveMutation.mutate({
              emailIds: params.emailIds,
              fromMailboxId: params.toMailboxId,
              toMailboxId: params.fromMailboxId,
            });
          },
        },
        duration: 5000,
      });
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKey, context.prev);
      }
      toast.error("Failed to move messages");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  /** Permanently delete emails */
  const destroyMutation = useMutation({
    mutationFn: async (emailIds: string[]) => {
      await destroyEmails(emailIds);
    },
    onMutate: async (emailIds) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as ReturnType<typeof useInfiniteQueryData>;
      // Flatten original emails before removal for index lookup
      const originalEmails = prev?.pages?.flatMap((p) => p.emails) ?? [];
      let data = prev;
      for (const emailId of emailIds) {
        data = optimisticRemoveEmail(data, emailId);
      }
      queryClient.setQueryData(queryKey, data);
      // Navigate based on autoAdvance setting
      const uiStore = useUIStore.getState();
      if (emailIds.includes(uiStore.selectedEmailId ?? "")) {
        const autoAdvance = useSettingsStore.getState().autoAdvance;
        const remainingEmails = data?.pages?.flatMap((p) => p.emails) ?? [];
        const deletedIndex = originalEmails.findIndex((e) => e.id === uiStore.selectedEmailId);
        if (autoAdvance === "next" && remainingEmails.length > 0) {
          const nextIndex = Math.min(deletedIndex, remainingEmails.length - 1);
          const next = remainingEmails[nextIndex];
          uiStore.setSelectedEmail(next.id, next.threadId);
        } else if (autoAdvance === "previous" && remainingEmails.length > 0) {
          const prevIndex = Math.max(0, deletedIndex - 1);
          const prevEmail = remainingEmails[prevIndex];
          uiStore.setSelectedEmail(prevEmail.id, prevEmail.threadId);
        } else {
          uiStore.setSelectedEmail(null, null);
        }
      }
      return { prev };
    },
    onSuccess: (_data, emailIds) => {
      toast("Deleted", {
        description: `${emailIds.length} message${emailIds.length !== 1 ? "s" : ""} permanently deleted`,
        duration: 3000,
      });
    },
    onError: (_err, _params, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKey, context.prev);
      }
      toast.error("Failed to delete messages");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  return {
    emails,
    total,
    threadCounts,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    starEmail: useCallback(
      (emailId: string, flagged: boolean) => starMutation.mutate({ emailId, flagged }),
      [starMutation],
    ),
    markRead: useCallback(
      (emailIds: string[], seen: boolean) => markReadMutation.mutate({ emailIds, seen }),
      [markReadMutation],
    ),
    moveEmails: useCallback(
      (emailIds: string[], fromMailboxId: string, toMailboxId: string) =>
        moveMutation.mutate({ emailIds, fromMailboxId, toMailboxId }),
      [moveMutation],
    ),
    destroyEmails: useCallback(
      (emailIds: string[]) => destroyMutation.mutate(emailIds),
      [destroyMutation],
    ),
  };
}

/** Optimistic update helper: update a single email in the paginated query data */
function optimisticUpdateEmail(
  data: ReturnType<typeof useInfiniteQueryData>,
  emailId: string,
  updater: (email: EmailListItem) => EmailListItem,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      emails: page.emails.map((e) => (e.id === emailId ? updater(e) : e)),
    })),
  };
}

/** Optimistic remove helper */
function optimisticRemoveEmail(
  data: ReturnType<typeof useInfiniteQueryData>,
  emailId: string,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      emails: page.emails.filter((e) => e.id !== emailId),
      total: Math.max(0, page.total - 1),
    })),
  };
}

/** Type helper for the paginated query data structure */
function useInfiniteQueryData(): {
  pages: { emails: EmailListItem[]; total: number; position: number; threadCounts: Record<string, number> }[];
  pageParams: unknown[];
} | undefined {
  return undefined;
}
