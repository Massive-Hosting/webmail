/** Search hook using TanStack Query with JMAP Email/query */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { jmapRequest } from "@/api/mail.ts";
import { parseSearchQuery } from "@/lib/search-parser.ts";
import { useSearchStore } from "@/stores/search-store.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useUIStore } from "@/stores/ui-store.ts";
import type { JMAPRequest } from "@/types/jmap.ts";
import type { EmailListItem } from "@/types/mail.ts";

const PAGE_SIZE = 50;

const JMAP_USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
];

const EMAIL_LIST_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "from",
  "to",
  "cc",
  "subject",
  "receivedAt",
  "size",
  "preview",
  "keywords",
  "hasAttachment",
];

export function useSearch() {
  const query = useSearchStore((s) => s.query);
  const isSearchActive = useSearchStore((s) => s.isSearchActive);
  const scopeToMailbox = useSearchStore((s) => s.scopeToMailbox);
  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const { mailboxes } = useMailboxes();

  const filter = useMemo(() => {
    if (!query.trim()) return null;
    const parsed = parseSearchQuery(query, mailboxes);
    // If scoped to mailbox, add inMailbox constraint
    if (scopeToMailbox && selectedMailboxId) {
      if (parsed.operator === "AND" && parsed.conditions) {
        return {
          ...parsed,
          conditions: [...parsed.conditions, { inMailbox: selectedMailboxId }],
        };
      }
      return {
        operator: "AND" as const,
        conditions: [parsed, { inMailbox: selectedMailboxId }],
      };
    }
    return parsed;
  }, [query, mailboxes, scopeToMailbox, selectedMailboxId]);

  const infiniteQuery = useInfiniteQuery({
    queryKey: ["search", query, scopeToMailbox, selectedMailboxId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!filter) {
        return { emails: [] as EmailListItem[], total: 0, position: 0 };
      }

      const request: JMAPRequest = {
        using: JMAP_USING,
        methodCalls: [
          [
            "Email/query",
            {
              filter,
              sort: [{ property: "receivedAt", isAscending: false }],
              position: pageParam as number,
              limit: PAGE_SIZE,
            },
            "q0",
          ],
          [
            "Email/get",
            {
              "#ids": {
                resultOf: "q0",
                name: "Email/query",
                path: "/ids",
              },
              properties: EMAIL_LIST_PROPERTIES,
            },
            "g0",
          ],
        ],
      };

      const response = await jmapRequest(request);
      const [, queryResult] = response.methodResponses[0];
      const [, getResult] = response.methodResponses[1];

      const qr = queryResult as { total: number; position: number; ids: string[] };
      const gr = getResult as { list: EmailListItem[] };

      return {
        emails: gr.list,
        total: qr.total,
        position: qr.position,
      };
    },
    getNextPageParam: (lastPage) => {
      // Stop if this page returned no results
      if (lastPage.emails.length === 0) return undefined;
      const nextPosition = lastPage.position + lastPage.emails.length;
      if (lastPage.total > 0 && nextPosition >= lastPage.total) return undefined;
      return nextPosition;
    },
    initialPageParam: 0,
    enabled: isSearchActive && !!query.trim(),
    staleTime: 30 * 1000,
  });

  const emails = useMemo(() => {
    if (!infiniteQuery.data?.pages) return [];
    return infiniteQuery.data.pages.flatMap((page) => page.emails);
  }, [infiniteQuery.data]);

  const total = infiniteQuery.data?.pages[0]?.total ?? 0;

  return {
    emails,
    total,
    isLoading: infiniteQuery.isLoading,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: !!infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isSearchActive,
    query,
  };
}
