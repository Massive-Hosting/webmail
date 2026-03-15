/** Hook for fetching thread messages in list format (for inline expansion) */

import { useQuery } from "@tanstack/react-query";
import { fetchThreadListEmails } from "@/api/mail.ts";
import type { EmailListItem } from "@/types/mail.ts";

export function useThreadMessages(threadId: string | null): {
  emails: EmailListItem[];
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["thread-list", threadId],
    queryFn: () => {
      if (!threadId) throw new Error("No thread ID");
      return fetchThreadListEmails(threadId);
    },
    enabled: !!threadId,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    emails: query.data?.emails ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
