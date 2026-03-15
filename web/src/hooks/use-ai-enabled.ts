/** Hook to check if AI features are available on this server */

import { useQuery } from "@tanstack/react-query";
import { getAIStatus } from "@/api/ai.ts";

export function useAIEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAIStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  return data?.enabled ?? false;
}
