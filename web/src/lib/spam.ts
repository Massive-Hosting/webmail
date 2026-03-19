/** Parse X-Spam-Status header from Stalwart/SpamAssassin format */

export interface SpamStatus {
  isSpam: boolean;
  score: number;
  requiredScore: number;
}

/**
 * Parses X-Spam-Status header.
 * Formats:
 *   "Yes, score=8.5 required=5.0 tests=..."
 *   "No, score=1.2 required=5.0 tests=..."
 */
export function parseSpamStatus(header: string | null | undefined): SpamStatus | null {
  if (!header) return null;

  const trimmed = header.trim();
  const isSpam = /^yes\b/i.test(trimmed);

  const scoreMatch = trimmed.match(/score=(-?[\d.]+)/i);
  const requiredMatch = trimmed.match(/required=(-?[\d.]+)/i);

  if (!scoreMatch) return null;

  return {
    isSpam,
    score: parseFloat(scoreMatch[1]),
    requiredScore: requiredMatch ? parseFloat(requiredMatch[1]) : 5.0,
  };
}
