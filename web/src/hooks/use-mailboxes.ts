/** Mailbox list hook with unread counts and auto-refresh */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMailboxes, createMailbox, updateMailbox, deleteMailbox } from "@/api/mail.ts";
import type { Mailbox, MailboxRole } from "@/types/mail.ts";
import { useCallback, useMemo } from "react";
import { useWebSocket } from "@/hooks/use-websocket.ts";

/** Standard folder sort order by role */
const ROLE_ORDER: Record<string, number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5,
};

export function useMailboxes() {
  const queryClient = useQueryClient();
  const { isConnected } = useWebSocket();

  const query = useQuery({
    queryKey: ["mailboxes"],
    queryFn: fetchMailboxes,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // When WebSocket is connected, disable polling — we get push updates.
    // When disconnected, fall back to 60s polling.
    refetchInterval: isConnected ? false : 60000,
    refetchIntervalInBackground: false,
  });

  /** Sorted mailboxes: standard folders first (by role), then custom by sortOrder. Deduplicated by id. */
  const sortedMailboxes = useMemo(() => {
    if (!query.data) return [];
    // Deduplicate by id (can happen when WebSocket sync + mutation invalidation both add the same mailbox)
    const seen = new Set<string>();
    const mailboxes = query.data.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return mailboxes.sort((a, b) => {
      const aOrder = a.role ? (ROLE_ORDER[a.role] ?? 100) : 1000 + a.sortOrder;
      const bOrder = b.role ? (ROLE_ORDER[b.role] ?? 100) : 1000 + b.sortOrder;
      return aOrder - bOrder;
    });
  }, [query.data]);

  /** Standard folders only */
  const standardFolders = useMemo(
    () => sortedMailboxes.filter((m) => m.role !== null),
    [sortedMailboxes],
  );

  /** Custom folders only */
  const customFolders = useMemo(
    () => sortedMailboxes.filter((m) => m.role === null),
    [sortedMailboxes],
  );

  /** Find a mailbox by role */
  const findByRole = useCallback(
    (role: MailboxRole): Mailbox | undefined => {
      return query.data?.find((m) => m.role === role);
    },
    [query.data],
  );

  /** Total unread across all inboxes */
  const totalUnread = useMemo(() => {
    const inbox = query.data?.find((m) => m.role === "inbox");
    return inbox?.unreadEmails ?? 0;
  }, [query.data]);

  /** Create mailbox mutation with optimistic update */
  const createMutation = useMutation({
    mutationFn: createMailbox,
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["mailboxes"] });
      const prev = queryClient.getQueryData<Mailbox[]>(["mailboxes"]);
      // Optimistically add the new folder
      if (prev) {
        const optimistic: Mailbox = {
          id: `temp-${Date.now()}`,
          name: params.name,
          parentId: params.parentId ?? null,
          role: null,
          sortOrder: 999,
          totalEmails: 0,
          unreadEmails: 0,
        };
        queryClient.setQueryData<Mailbox[]>(["mailboxes"], [...prev, optimistic]);
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["mailboxes"], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  /** Update mailbox mutation */
  const updateMutation = useMutation({
    mutationFn: (params: { id: string; updates: Record<string, unknown> }) =>
      updateMailbox(params.id, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  /** Delete mailbox mutation */
  const deleteMutation = useMutation({
    mutationFn: deleteMailbox,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });

  return {
    mailboxes: query.data ?? [],
    sortedMailboxes,
    standardFolders,
    customFolders,
    findByRole,
    totalUnread,
    isLoading: query.isLoading,
    error: query.error,
    createMailbox: createMutation.mutate,
    updateMailbox: updateMutation.mutate,
    deleteMailbox: deleteMutation.mutate,
  };
}
