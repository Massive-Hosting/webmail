/** PGP key lookup: local DB, WKD, keys.openpgp.org */

import { apiGet } from "@/api/client.ts";

interface LookupResult {
  publicKeyArmored: string;
  source: "local" | "wkd" | "keyserver";
}

interface CacheEntry {
  result: LookupResult | null;
  expiresAt: number;
}

/** In-memory cache for key lookups */
const lookupCache = new Map<string, CacheEntry>();

const FOUND_TTL = 60 * 60 * 1000; // 1 hour for found keys
const NOT_FOUND_TTL = 15 * 60 * 1000; // 15 minutes for not-found

/**
 * Look up a public key for the given email address.
 * Chain: webmail DB -> WKD -> keys.openpgp.org
 */
export async function lookupPublicKey(
  email: string,
): Promise<LookupResult | null> {
  const cacheKey = email.toLowerCase();

  // Check cache first
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // 1. Webmail DB (local platform)
  try {
    const resp = await apiGet<{ publicKey: string }>(
      `/api/pgp/lookup?email=${encodeURIComponent(email)}`,
    );
    if (resp.publicKey) {
      const result: LookupResult = {
        publicKeyArmored: resp.publicKey,
        source: "local",
      };
      lookupCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + FOUND_TTL,
      });
      return result;
    }
  } catch {
    // Not found locally, continue
  }

  // 2. WKD (Web Key Directory) via backend proxy
  try {
    const resp = await apiGet<{ publicKey: string }>(
      `/api/wkd/lookup?email=${encodeURIComponent(email)}`,
    );
    if (resp.publicKey) {
      const result: LookupResult = {
        publicKeyArmored: resp.publicKey,
        source: "wkd",
      };
      lookupCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + FOUND_TTL,
      });
      return result;
    }
  } catch {
    // WKD not available or not found, continue
  }

  // 3. keys.openpgp.org via backend proxy
  try {
    const resp = await apiGet<{ publicKey: string }>(
      `/api/pgp/keyserver-lookup?email=${encodeURIComponent(email)}`,
    );
    if (resp.publicKey) {
      const result: LookupResult = {
        publicKeyArmored: resp.publicKey,
        source: "keyserver",
      };
      lookupCache.set(cacheKey, {
        result,
        expiresAt: Date.now() + FOUND_TTL,
      });
      return result;
    }
  } catch {
    // Not found on keyserver
  }

  // Not found anywhere
  lookupCache.set(cacheKey, {
    result: null,
    expiresAt: Date.now() + NOT_FOUND_TTL,
  });
  return null;
}

/**
 * Look up public keys for multiple email addresses in parallel.
 * Returns a map of email -> armored public key (only found keys).
 */
export async function lookupPublicKeys(
  emails: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const lookups = emails.map(async (email) => {
    const result = await lookupPublicKey(email);
    if (result) {
      results.set(email.toLowerCase(), result.publicKeyArmored);
    }
  });

  await Promise.allSettled(lookups);
  return results;
}

/**
 * Invalidate lookup cache for a specific email.
 */
export function invalidateLookupCache(email: string): void {
  lookupCache.delete(email.toLowerCase());
}

/**
 * Clear entire lookup cache.
 */
export function clearLookupCache(): void {
  lookupCache.clear();
}
