/** Parsing utilities for email headers (Received, Authentication-Results, etc.) */

export interface ReceivedHop {
  from?: string;
  fromIp?: string;
  by: string;
  timestamp?: string;
  protocol?: string;
  tls: boolean;
}

export interface AuthStatus {
  result: "pass" | "fail" | "none" | "unknown";
  detail?: string;
}

export interface AuthResults {
  spf: AuthStatus;
  dkim: AuthStatus;
  dmarc: AuthStatus;
  arc: AuthStatus;
  tlsVersion?: string;
}

/**
 * Parse a single Received header value into a structured hop.
 *
 * Typical format:
 *   from mail.example.com (mail.example.com [203.0.113.50])
 *   by mx.destination.com with ESMTPS id abc123
 *   for <user@dest.com>; Sat, 15 Mar 2026 14:30:15 +0100
 */
function parseOneReceived(raw: string): ReceivedHop {
  const hop: ReceivedHop = { by: "", tls: false };

  // Extract "from <host>"
  const fromMatch = raw.match(/from\s+(\S+)/i);
  if (fromMatch) {
    hop.from = fromMatch[1];
  }

  // Extract IP from brackets like [203.0.113.50] or (203.0.113.50)
  const ipMatch = raw.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
  if (ipMatch) {
    hop.fromIp = ipMatch[1];
  } else {
    // IPv6 in brackets
    const ipv6Match = raw.match(/\[([a-fA-F0-9:]+)\]/);
    if (ipv6Match) {
      hop.fromIp = ipv6Match[1];
    }
  }

  // Extract "by <host>"
  const byMatch = raw.match(/by\s+(\S+)/i);
  if (byMatch) {
    hop.by = byMatch[1];
  }

  // Extract protocol (with ESMTPS, with SMTP, etc.)
  const withMatch = raw.match(/with\s+(E?SMTP\S*)/i);
  if (withMatch) {
    hop.protocol = withMatch[1].toUpperCase();
  }

  // TLS detection
  if (/ESMTPS|TLS|STARTTLS/i.test(raw)) {
    hop.tls = true;
  }

  // Extract timestamp after the semicolon
  const semiIdx = raw.lastIndexOf(";");
  if (semiIdx !== -1) {
    const dateStr = raw.substring(semiIdx + 1).trim();
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      hop.timestamp = parsed.toISOString();
    }
  }

  return hop;
}

/**
 * Parse Received headers into an ordered list of hops.
 * The input array should be in header order (top to bottom in raw headers).
 * Received headers are listed newest-first, so we reverse to get chronological order.
 */
export function parseReceivedHeaders(headers: string[]): ReceivedHop[] {
  const hops = headers
    .map((h) => parseOneReceived(h.replace(/\r?\n\s+/g, " ").trim()))
    .filter((h) => h.by); // must have at least a "by" field

  // Reverse so index 0 = origin, last = final destination
  return hops.reverse();
}

/**
 * Parse Authentication-Results header for SPF, DKIM, DMARC.
 *
 * Example:
 *   mx.google.com;
 *   spf=pass (google.com: domain of user@example.com designates 203.0.113.50 as permitted sender) smtp.mailfrom=user@example.com;
 *   dkim=pass header.i=@example.com header.s=selector;
 *   dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com
 */
export function parseAuthResults(header: string | undefined, receivedHeaders?: string[]): AuthResults {
  const results: AuthResults = {
    spf: { result: "unknown" },
    dkim: { result: "unknown" },
    dmarc: { result: "unknown" },
    arc: { result: "unknown" },
  };

  if (!header) return results;

  // SPF
  const spfMatch = header.match(/spf\s*=\s*(pass|fail|softfail|neutral|none|temperror|permerror)/i);
  if (spfMatch) {
    results.spf = {
      result: normalizeResult(spfMatch[1]),
      detail: extractDetail(header, "spf"),
    };
  }

  // DKIM
  const dkimMatch = header.match(/dkim\s*=\s*(pass|fail|none|neutral|temperror|permerror)/i);
  if (dkimMatch) {
    results.dkim = {
      result: normalizeResult(dkimMatch[1]),
      detail: extractDetail(header, "dkim"),
    };
  }

  // DMARC
  const dmarcMatch = header.match(/dmarc\s*=\s*(pass|fail|none|bestguesspass|temperror|permerror)/i);
  if (dmarcMatch) {
    results.dmarc = {
      result: normalizeResult(dmarcMatch[1]),
      detail: extractDetail(header, "dmarc"),
    };
  }

  // ARC
  const arcMatch = header.match(/arc\s*=\s*(pass|fail|none)/i);
  if (arcMatch) {
    results.arc = { result: normalizeResult(arcMatch[1]) };
  }

  // TLS version from Received headers
  if (receivedHeaders) {
    for (const rh of receivedHeaders) {
      const tlsMatch = rh.match(/TLS(v?\d+\.?\d*)/i);
      if (tlsMatch) {
        results.tlsVersion = tlsMatch[0];
        break;
      }
      // "version=TLSv1.3"
      const versionMatch = rh.match(/version=(TLS\S+)/i);
      if (versionMatch) {
        results.tlsVersion = versionMatch[1];
        break;
      }
    }
  }

  return results;
}

function normalizeResult(raw: string): "pass" | "fail" | "none" | "unknown" {
  const lower = raw.toLowerCase();
  if (lower === "pass" || lower === "bestguesspass") return "pass";
  if (lower === "fail" || lower === "softfail" || lower === "permerror") return "fail";
  if (lower === "none") return "none";
  return "unknown";
}

function extractDetail(header: string, mechanism: string): string | undefined {
  // Try to find parenthesized detail after the mechanism result
  const regex = new RegExp(`${mechanism}\\s*=\\s*\\w+\\s*\\(([^)]+)\\)`, "i");
  const match = header.match(regex);
  if (match) return match[1].trim();

  // Try to find key=value pairs after the mechanism
  const kvRegex = new RegExp(`${mechanism}\\s*=\\s*\\w+\\s+([^;]+)`, "i");
  const kvMatch = header.match(kvRegex);
  if (kvMatch) return kvMatch[1].trim();

  return undefined;
}
