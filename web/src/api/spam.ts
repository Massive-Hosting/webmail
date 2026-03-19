/** Spam training API */

import { apiPost } from "./client.ts";

export function trainSpam(
  emailIds: string[],
  type: "spam" | "ham",
): Promise<{ trained: number; total: number }> {
  return apiPost("/api/spam/train", { emailIds, type });
}
