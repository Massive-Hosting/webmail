/** AI assistant API client — SSE streaming for compose, reply, and rewrite */

export type AITone = "professional" | "friendly" | "concise";

export interface AIStatus {
  enabled: boolean;
}

/** Check if AI features are available on this server */
export async function getAIStatus(): Promise<AIStatus> {
  try {
    const response = await fetch("/api/ai/status", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { enabled: false };
    }
    return await response.json();
  } catch {
    return { enabled: false };
  }
}

/** Read SSE stream from an AI endpoint, yielding text chunks */
async function* streamAI(
  endpoint: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);
          if (data.done) return;
          if (data.error) throw new Error(data.error);
          if (data.text) yield data.text;
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Generate an email body from a prompt */
export function composeWithAI(
  prompt: string,
  context: string,
  tone: AITone,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  return streamAI("/api/ai/compose", { prompt, context, tone }, signal);
}

/** Generate a reply to an email */
export function replyWithAI(
  originalEmail: string,
  tone: AITone,
  instruction?: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  return streamAI("/api/ai/reply", { originalEmail, tone, instruction }, signal);
}

/** Rewrite selected text */
export function rewriteWithAI(
  text: string,
  instruction: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  return streamAI("/api/ai/rewrite", { text, instruction }, signal);
}
