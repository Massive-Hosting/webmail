/** IndexedDB storage for encrypted PGP private keys */

const DB_NAME = "webmail-pgp";
const DB_VERSION = 1;
const STORE_NAME = "keys";

interface StoredKey {
  email: string;
  encryptedPrivateKey: string;
  salt: string;
  createdAt: string;
}

/**
 * Open (or create) the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "email" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Derive an AES-256-GCM encryption key from the passphrase using PBKDF2.
 */
async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt the private key with AES-256-GCM.
 */
async function encryptData(
  data: string,
  passphrase: string,
  salt: Uint8Array,
): Promise<string> {
  const key = await deriveEncryptionKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(data),
  );

  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt the private key with AES-256-GCM.
 */
async function decryptData(
  encryptedBase64: string,
  passphrase: string,
  saltBase64: string,
): Promise<string> {
  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
  const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
    c.charCodeAt(0),
  );

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveEncryptionKey(passphrase, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Store an encrypted private key in IndexedDB.
 */
export async function storePrivateKey(
  email: string,
  armoredPrivateKey: string,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const encryptedPrivateKey = await encryptData(
    armoredPrivateKey,
    passphrase,
    salt,
  );

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record: StoredKey = {
      email,
      encryptedPrivateKey,
      salt: saltBase64,
      createdAt: new Date().toISOString(),
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieve and decrypt a private key from IndexedDB.
 */
export async function getPrivateKey(
  email: string,
  passphrase: string,
): Promise<string | null> {
  const db = await openDB();

  const record = await new Promise<StoredKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(email);
    request.onsuccess = () => resolve(request.result as StoredKey | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });

  if (!record) return null;

  try {
    return await decryptData(
      record.encryptedPrivateKey,
      passphrase,
      record.salt,
    );
  } catch {
    throw new Error("Invalid passphrase — could not decrypt private key");
  }
}

/**
 * Delete a private key from IndexedDB.
 */
export async function deletePrivateKey(email: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(email);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Check if a private key exists in IndexedDB for a given email.
 */
export async function hasPrivateKey(email: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(email);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
