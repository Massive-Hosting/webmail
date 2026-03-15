/** Thread fetching hook */

import { useQuery } from "@tanstack/react-query";
import { fetchThread } from "@/api/mail.ts";

export function useThread(threadId: string | null) {
  const query = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => {
      if (!threadId) throw new Error("No thread ID");
      return fetchThread(threadId);
    },
    enabled: !!threadId,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    thread: query.data?.thread ?? null,
    emails: query.data?.emails ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
