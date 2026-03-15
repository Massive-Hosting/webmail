/** PGP cryptographic operations wrapper around OpenPGP.js */

import * as openpgp from "openpgp";

// Re-export types for convenience
export type { Key, PrivateKey, PublicKey } from "openpgp";

export interface KeyInfo {
  fingerprint: string;
  algorithm: string;
  created: Date;
  expires: Date | null;
  userIDs: Array<{ name?: string; email?: string }>;
  isRevoked: boolean;
  isExpired: boolean;
  armoredPublicKey: string;
}

export interface GenerateKeyResult {
  privateKeyArmored: string;
  publicKeyArmored: string;
  revocationCertificate: string;
  fingerprint: string;
}

export interface DecryptResult {
  plaintext: string;
  signatures: SignatureStatus[];
}

export interface SignatureStatus {
  valid: boolean;
  signerKeyID: string;
  signerEmail?: string;
}

export interface VerifyResult {
  valid: boolean;
  signerEmail?: string;
  signerKeyID: string;
}

/**
 * Format fingerprint as hex with spaces (e.g., "6F2C 8B1D A4E3 7890 ...")
 */
export function formatFingerprint(fingerprint: string): string {
  const upper = fingerprint.toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < upper.length; i += 4) {
    groups.push(upper.slice(i, i + 4));
  }
  return groups.join(" ");
}

/**
 * Generate an ECC Curve25519 key pair with 2-year expiry.
 */
export async function generateKey(
  name: string,
  email: string,
  passphrase: string,
): Promise<GenerateKeyResult> {
  const twoYearsInSeconds = 2 * 365 * 24 * 60 * 60;
  const result = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name, email }],
    passphrase,
    keyExpirationTime: twoYearsInSeconds,
    format: "armored",
  });

  const publicKey = await openpgp.readKey({ armoredKey: result.publicKey });

  return {
    privateKeyArmored: result.privateKey,
    publicKeyArmored: result.publicKey,
    revocationCertificate: result.revocationCertificate,
    fingerprint: publicKey.getFingerprint(),
  };
}

/**
 * Generate an RSA 4096 key pair (advanced option).
 */
export async function generateRSAKey(
  name: string,
  email: string,
  passphrase: string,
  expiryYears: number = 2,
): Promise<GenerateKeyResult> {
  const expirySeconds = expiryYears * 365 * 24 * 60 * 60;
  const result = await openpgp.generateKey({
    type: "rsa",
    rsaBits: 4096,
    userIDs: [{ name, email }],
    passphrase,
    keyExpirationTime: expirySeconds,
    format: "armored",
  });

  const publicKey = await openpgp.readKey({ armoredKey: result.publicKey });

  return {
    privateKeyArmored: result.privateKey,
    publicKeyArmored: result.publicKey,
    revocationCertificate: result.revocationCertificate,
    fingerprint: publicKey.getFingerprint(),
  };
}

/**
 * Encrypt a message for one or more recipients.
 * Optionally sign with the sender's private key.
 */
export async function encryptMessage(
  text: string,
  recipientPublicKeys: string[],
  signingPrivateKeyArmored?: string,
  passphrase?: string,
): Promise<string> {
  const encryptionKeys = await Promise.all(
    recipientPublicKeys.map((k) => openpgp.readKey({ armoredKey: k })),
  );

  const message = await openpgp.createMessage({ text });

  let signingKeys: openpgp.PrivateKey | undefined;

  if (signingPrivateKeyArmored && passphrase) {
    const privateKey = await openpgp.readPrivateKey({
      armoredKey: signingPrivateKeyArmored,
    });
    signingKeys = await openpgp.decryptKey({
      privateKey,
      passphrase,
    });
  }

  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys,
    ...(signingKeys ? { signingKeys } : {}),
  });
  return encrypted as string;
}

/**
 * Decrypt a PGP message with the user's private key.
 */
export async function decryptMessage(
  armoredMessage: string,
  privateKeyArmored: string,
  passphrase: string,
  senderPublicKeyArmored?: string,
): Promise<DecryptResult> {
  const message = await openpgp.readMessage({ armoredMessage });
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: privateKeyArmored,
  });
  const decryptedKey = await openpgp.decryptKey({ privateKey, passphrase });

  const options: Parameters<typeof openpgp.decrypt>[0] = {
    message,
    decryptionKeys: decryptedKey,
  };

  if (senderPublicKeyArmored) {
    const senderKey = await openpgp.readKey({
      armoredKey: senderPublicKeyArmored,
    });
    options.verificationKeys = senderKey;
  }

  const result = await openpgp.decrypt(options);

  const signatures: SignatureStatus[] = [];
  for (const sig of result.signatures) {
    let valid = false;
    try {
      await sig.verified;
      valid = true;
    } catch {
      valid = false;
    }
    signatures.push({
      valid,
      signerKeyID: sig.keyID.toHex(),
    });
  }

  return {
    plaintext: result.data as string,
    signatures,
  };
}

/**
 * Sign a message (cleartext signature).
 */
export async function signMessage(
  text: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({
    armoredKey: privateKeyArmored,
  });
  const decryptedKey = await openpgp.decryptKey({ privateKey, passphrase });
  const message = await openpgp.createCleartextMessage({ text });

  const signed = await openpgp.sign({
    message,
    signingKeys: decryptedKey,
    format: "armored",
  });

  return signed as string;
}

/**
 * Verify a cleartext signed message.
 */
export async function verifySignature(
  signedMessageArmored: string,
  senderPublicKeyArmored: string,
): Promise<VerifyResult> {
  const message = await openpgp.readCleartextMessage({
    cleartextMessage: signedMessageArmored,
  });
  const senderKey = await openpgp.readKey({
    armoredKey: senderPublicKeyArmored,
  });

  const result = await openpgp.verify({
    message,
    verificationKeys: senderKey,
  });

  const sig = result.signatures[0];
  if (!sig) {
    return { valid: false, signerKeyID: "" };
  }

  let valid = false;
  try {
    await sig.verified;
    valid = true;
  } catch {
    valid = false;
  }

  // Extract email from sender key
  const userIDs = senderKey.getUserIDs();
  const emailMatch = userIDs[0]?.match(/<(.+?)>/);
  const signerEmail = emailMatch ? emailMatch[1] : userIDs[0];

  return {
    valid,
    signerEmail,
    signerKeyID: sig.keyID.toHex(),
  };
}

/**
 * Import and parse an armored key (public or private).
 */
export async function importKey(
  armoredKey: string,
): Promise<{ isPrivate: boolean; keyInfo: KeyInfo }> {
  // Try reading as private key first
  let key: openpgp.Key;
  let isPrivate = false;

  try {
    key = await openpgp.readPrivateKey({ armoredKey });
    isPrivate = true;
  } catch {
    key = await openpgp.readKey({ armoredKey });
    isPrivate = false;
  }

  const keyInfo = await getKeyInfo(key);
  return { isPrivate, keyInfo };
}

/**
 * Export a key as armored ASCII.
 */
export function exportKey(key: openpgp.Key): string {
  return key.armor();
}

/**
 * Get detailed info about a key.
 */
export async function getKeyInfo(key: openpgp.Key): Promise<KeyInfo> {
  const fingerprint = key.getFingerprint();
  const created = key.getCreationTime();
  const algorithmInfo = key.getAlgorithmInfo();

  let expires: Date | null = null;
  try {
    const expirationTime = await key.getExpirationTime();
    if (expirationTime && expirationTime !== Infinity) {
      expires = expirationTime as Date;
    }
  } catch {
    // Key may not have expiration
  }

  let isRevoked = false;
  try {
    isRevoked = await key.isRevoked();
  } catch {
    // ignore
  }

  const isExpired = expires !== null && expires < new Date();

  const userIDs = key.getUserIDs().map((uid) => {
    const match = uid.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
      return { name: match[1].trim(), email: match[2] };
    }
    if (uid.includes("@")) {
      return { email: uid };
    }
    return { name: uid };
  });

  let algorithm = "Unknown";
  const algo = algorithmInfo.algorithm;
  if (algo === "eddsaLegacy" || algo === "ed25519" || algo === "x25519") {
    algorithm = "ECC Curve25519";
  } else if (algo === "ed448" || algo === "x448") {
    algorithm = "ECC Curve448";
  } else if (algo === "rsaEncryptSign" || algo === "rsaSign" || algo === "rsaEncrypt") {
    algorithm = `RSA ${algorithmInfo.bits ?? ""}`.trim();
  } else if (algo === "ecdsa" || algo === "ecdh") {
    algorithm = `ECC ${algorithmInfo.curve ?? ""}`.trim();
  } else {
    algorithm = String(algo);
  }

  return {
    fingerprint,
    algorithm,
    created,
    expires,
    userIDs,
    isRevoked,
    isExpired,
    armoredPublicKey: key.toPublic().armor(),
  };
}

/**
 * Derive a PGP passphrase from the email password using PBKDF2.
 * This allows the user to never manage a separate PGP passphrase.
 */
export async function derivePassphrase(
  password: string,
  salt: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  // Convert to base64 for use as passphrase
  const bytes = new Uint8Array(bits);
  return btoa(String.fromCharCode(...bytes));
}

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

/**
 * Extract PGP message block from email body text.
 */
export function extractPGPBlock(
  text: string,
): { type: "encrypted" | "signed" | "cleartext-signed"; block: string } | null {
  // Encrypted message
  const encMatch = text.match(
    /-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/,
  );
  if (encMatch) {
    return { type: "encrypted", block: encMatch[0] };
  }

  // Cleartext signed
  const csMatch = text.match(
    /-----BEGIN PGP SIGNED MESSAGE-----[\s\S]*?-----END PGP SIGNATURE-----/,
  );
  if (csMatch) {
    return { type: "cleartext-signed", block: csMatch[0] };
  }

  return null;
}

/**
 * Read a public key from armored text.
 */
export async function readPublicKey(
  armoredKey: string,
): Promise<openpgp.Key> {
  return openpgp.readKey({ armoredKey });
}

/**
 * Decrypt a private key with passphrase (for unlocking).
 */
export async function unlockPrivateKey(
  armoredKey: string,
  passphrase: string,
): Promise<openpgp.PrivateKey> {
  const privateKey = await openpgp.readPrivateKey({ armoredKey });
  return openpgp.decryptKey({ privateKey, passphrase });
}
