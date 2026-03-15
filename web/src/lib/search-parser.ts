/** Parse structured search queries into JMAP filter objects */

import type { JMAPFilter } from "@/types/jmap.ts";
import type { Mailbox } from "@/types/mail.ts";

interface ParsedToken {
  type: "operator";
  key: string;
  value: string;
}

interface ParsedText {
  type: "text";
  value: string;
}

type ParsedPart = ParsedToken | ParsedText;

/** Parse a size string like "5mb", "100kb", "1024" into bytes */
function parseSize(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  switch (unit) {
    case "gb":
      return num * 1024 * 1024 * 1024;
    case "mb":
      return num * 1024 * 1024;
    case "kb":
      return num * 1024;
    default:
      return num;
  }
}

/** Parse a date string to ISO UTC datetime */
function parseDate(value: string): string {
  // Accept YYYY-MM-DD format
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${value}T00:00:00Z`;
  }
  // Try parsing as a date
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return `${value}T00:00:00Z`;
}

/** Tokenize a search query string into structured parts */
function tokenize(query: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  let remaining = query.trim();

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (remaining.length === 0) break;

    // Check for operator:value pattern
    const operatorMatch = remaining.match(
      /^(from|to|subject|has|is|in|before|after|larger|smaller):/i,
    );

    if (operatorMatch) {
      const key = operatorMatch[1].toLowerCase();
      remaining = remaining.slice(operatorMatch[0].length);

      // Extract the value (quoted or unquoted)
      let value: string;
      if (remaining.startsWith('"')) {
        // Quoted value
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote === -1) {
          value = remaining.slice(1);
          remaining = "";
        } else {
          value = remaining.slice(1, endQuote);
          remaining = remaining.slice(endQuote + 1);
        }
      } else {
        // Unquoted value: read until next space or next operator
        const spaceIdx = remaining.indexOf(" ");
        if (spaceIdx === -1) {
          value = remaining;
          remaining = "";
        } else {
          value = remaining.slice(0, spaceIdx);
          remaining = remaining.slice(spaceIdx);
        }
      }

      parts.push({ type: "operator", key, value });
    } else {
      // Plain text word (could be quoted)
      let value: string;
      if (remaining.startsWith('"')) {
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote === -1) {
          value = remaining.slice(1);
          remaining = "";
        } else {
          value = remaining.slice(1, endQuote);
          remaining = remaining.slice(endQuote + 1);
        }
      } else {
        const spaceIdx = remaining.indexOf(" ");
        if (spaceIdx === -1) {
          value = remaining;
          remaining = "";
        } else {
          value = remaining.slice(0, spaceIdx);
          remaining = remaining.slice(spaceIdx);
        }
      }

      if (value.length > 0) {
        parts.push({ type: "text", value });
      }
    }
  }

  return parts;
}

/**
 * Parse a search query string into a JMAP filter.
 * Supports structured syntax like `from:alice has:attachment before:2026-01-01 budget`.
 *
 * @param query - The raw search query string
 * @param mailboxes - Optional list of mailboxes for `in:` operator name resolution
 * @returns A JMAP filter object
 */
export function parseSearchQuery(
  query: string,
  mailboxes?: Mailbox[],
): JMAPFilter {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const parts = tokenize(trimmed);
  const conditions: JMAPFilter[] = [];

  // Collect all bare text words
  const textWords: string[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      textWords.push(part.value);
      continue;
    }

    const { key, value } = part;

    switch (key) {
      case "from":
        conditions.push({ from: value });
        break;
      case "to":
        conditions.push({ to: value });
        break;
      case "subject":
        conditions.push({ subject: value });
        break;
      case "has":
        if (value === "attachment") {
          conditions.push({ hasAttachment: true });
        } else if (value === "star") {
          conditions.push({ hasKeyword: "$flagged" });
        }
        break;
      case "is":
        if (value === "unread") {
          conditions.push({ notKeyword: "$seen" });
        } else if (value === "read") {
          conditions.push({ hasKeyword: "$seen" });
        }
        break;
      case "in": {
        if (mailboxes) {
          const mb = mailboxes.find(
            (m) =>
              m.name.toLowerCase() === value.toLowerCase() ||
              m.role === value.toLowerCase(),
          );
          if (mb) {
            conditions.push({ inMailbox: mb.id });
          }
        }
        break;
      }
      case "before":
        conditions.push({ before: parseDate(value) });
        break;
      case "after":
        conditions.push({ after: parseDate(value) });
        break;
      case "larger":
        conditions.push({ minSize: parseSize(value) });
        break;
      case "smaller":
        conditions.push({ maxSize: parseSize(value) });
        break;
      default:
        // Unknown operator — treat as text
        textWords.push(`${key}:${value}`);
        break;
    }
  }

  // Combine text words into a single text filter
  if (textWords.length > 0) {
    conditions.push({ text: textWords.join(" ") });
  }

  // Return the filter
  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return {
    operator: "AND",
    conditions,
  };
}

/** Search syntax hints for the suggestions dropdown */
export const SEARCH_SYNTAX_HINTS = [
  { prefix: "from:", description: "Search by sender", example: "from:alice@example.com" },
  { prefix: "to:", description: "Search by recipient", example: "to:bob@company.com" },
  { prefix: "subject:", description: "Search by subject", example: "subject:quarterly report" },
  { prefix: "has:attachment", description: "Has attachment", example: "has:attachment" },
  { prefix: "has:star", description: "Is starred", example: "has:star" },
  { prefix: "is:unread", description: "Is unread", example: "is:unread" },
  { prefix: "is:read", description: "Is read", example: "is:read" },
  { prefix: "in:", description: "In mailbox", example: "in:sent" },
  { prefix: "before:", description: "Before date", example: "before:2026-01-01" },
  { prefix: "after:", description: "After date", example: "after:2026-03-01" },
  { prefix: "larger:", description: "Larger than size", example: "larger:5mb" },
  { prefix: "smaller:", description: "Smaller than size", example: "smaller:100kb" },
] as const;
