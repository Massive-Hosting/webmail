/** Single message fetch hook */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEmail } from "@/api/mail.ts";

export function useMessage(emailId: string | null) {
  const query = useQuery({
    queryKey: ["email", emailId, "full"],
    queryFn: () => {
      if (!emailId) throw new Error("No email ID");
      return fetchEmail(emailId);
    },
    enabled: !!emailId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return {
    email: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Prefetch a message on hover */
export function usePrefetchMessage() {
  const queryClient = useQueryClient();

  return (emailId: string) => {
    queryClient.prefetchQuery({
      queryKey: ["email", emailId, "full"],
      queryFn: () => fetchEmail(emailId),
      staleTime: 5 * 60 * 1000,
    });
  };
}
