/** Lightweight PGP content detection - no openpgp dependency */

/**
 * Detect PGP content in email body text.
 */
export function detectPGPContent(text: string): {
  hasEncrypted: boolean;
  hasSigned: boolean;
  hasCleartextSigned: boolean;
} {
  return {
    hasEncrypted: text.includes("-----BEGIN PGP MESSAGE-----"),
    hasSigned: text.includes("-----BEGIN PGP SIGNATURE-----"),
    hasCleartextSigned: text.includes("-----BEGIN PGP SIGNED MESSAGE-----"),
  };
}

/**
 * Detect PGP/MIME from Content-Type header.
 */
export function detectPGPMIME(contentType: string): {
  isEncrypted: boolean;
  isSigned: boolean;
} {
  const lower = contentType.toLowerCase();
  return {
    isEncrypted:
      lower.includes("multipart/encrypted") &&
      lower.includes("application/pgp-encrypted"),
    isSigned:
      lower.includes("multipart/signed") &&
      lower.includes("application/pgp-signature"),
  };
}
