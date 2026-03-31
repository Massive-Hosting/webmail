/** PGP key management state */

import { create } from "zustand";
import {
  generateKey,
  generateRSAKey,
  derivePassphrase,
  type KeyInfo,
  getKeyInfo,
} from "@/lib/pgp.ts";
import {
  storePrivateKey,
  getPrivateKey,
  deletePrivateKey,
  hasPrivateKey,
} from "@/lib/pgp-storage.ts";
import { apiPut, apiGet, apiDelete } from "@/api/client.ts";
import { readKey, readPrivateKey, decryptKey } from "openpgp";

export type SignDefault = "always" | "ask" | "never";
export type EncryptDefault = "always" | "ask" | "never";

export type TrustLevel = "unknown" | "verified";

interface TrustedKey {
  publicKeyArmored: string;
  trustLevel: TrustLevel;
  fingerprint: string;
}

interface PGPState {
  /** Whether PGP has been set up for the current user */
  isSetUp: boolean;
  /** Whether the private key is currently decrypted in memory */
  isUnlocked: boolean;
  /** The armored private key (decrypted in memory for the session) */
  privateKeyArmored: string | null;
  /** The armored public key */
  publicKeyArmored: string | null;
  /** Passphrase cached in memory (derived from email password) */
  passphrase: string | null;
  /** Info about the user's key */
  keyInfo: KeyInfo | null;
  /** Current user email */
  email: string | null;
  /** Revocation certificate (stored in memory only) */
  revocationCertificate: string | null;

  /** Signing/encryption preferences */
  signDefault: SignDefault;
  encryptDefault: EncryptDefault;
  autoLookupKeys: boolean;

  /** Trusted public keys for contacts */
  trustedKeys: Map<string, TrustedKey>;

  /** Whether a setup/unlock operation is in progress */
  loading: boolean;
  error: string | null;

  // Actions
  setup: (
    name: string,
    email: string,
    password: string,
    algorithm?: "ecc" | "rsa",
    customPassphrase?: string,
    expiryYears?: number,
  ) => Promise<void>;
  unlock: (email: string, password: string) => Promise<void>;
  lock: () => void;
  importPrivateKey: (
    armoredKey: string,
    email: string,
    passphrase: string,
  ) => Promise<void>;
  clearOnLogout: () => void;
  checkSetup: (email: string) => Promise<void>;
  deleteKey: (email: string) => Promise<void>;
  setSignDefault: (value: SignDefault) => void;
  setEncryptDefault: (value: EncryptDefault) => void;
  setAutoLookupKeys: (value: boolean) => void;
  addTrustedKey: (
    email: string,
    publicKeyArmored: string,
    trustLevel: TrustLevel,
  ) => Promise<void>;
  removeTrustedKey: (email: string) => void;
  setTrustLevel: (email: string, level: TrustLevel) => void;
}

export const usePGPStore = create<PGPState>((set) => ({
  isSetUp: false,
  isUnlocked: false,
  privateKeyArmored: null,
  publicKeyArmored: null,
  passphrase: null,
  keyInfo: null,
  email: null,
  revocationCertificate: null,
  signDefault: "always",
  encryptDefault: "ask",
  autoLookupKeys: true,
  trustedKeys: new Map(),
  loading: false,
  error: null,

  setup: async (name, email, password, algorithm = "ecc", customPassphrase, expiryYears = 2) => {
    set({ loading: true, error: null });
    try {
      // Derive passphrase from email password (or use custom)
      const salt = `webmail-pgp-${email}`;
      const passphrase = customPassphrase || (await derivePassphrase(password, salt));

      // Generate key pair
      const result =
        algorithm === "rsa"
          ? await generateRSAKey(name, email, passphrase, expiryYears)
          : await generateKey(name, email, passphrase);

      // Store encrypted private key in IndexedDB
      await storePrivateKey(email, result.privateKeyArmored, passphrase);

      // Upload public key to server
      await apiPut("/api/pgp/key", { publicKey: result.publicKeyArmored });

      // Get key info
      const publicKey = await readKey({ armoredKey: result.publicKeyArmored });
      const keyInfo = await getKeyInfo(publicKey);

      set({
        isSetUp: true,
        isUnlocked: true,
        privateKeyArmored: result.privateKeyArmored,
        publicKeyArmored: result.publicKeyArmored,
        passphrase,
        keyInfo,
        email,
        revocationCertificate: result.revocationCertificate,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to set up PGP",
      });
      throw err;
    }
  },

  unlock: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const salt = `webmail-pgp-${email}`;
      const passphrase = await derivePassphrase(password, salt);

      // Try to get private key from IndexedDB
      const privateKeyArmored = await getPrivateKey(email, passphrase);
      if (!privateKeyArmored) {
        set({ loading: false, isSetUp: false, email });
        return;
      }

      // Try to fetch public key from server
      let publicKeyArmored: string | null = null;
      let keyInfo: KeyInfo | null = null;
      try {
        const resp = await apiGet<{ publicKey: string }>("/api/pgp/key");
        publicKeyArmored = resp.publicKey;
        const publicKey = await readKey({ armoredKey: publicKeyArmored });
        keyInfo = await getKeyInfo(publicKey);
      } catch {
        // Public key might not be on server, derive from private
        try {
          const pk = await readPrivateKey({ armoredKey: privateKeyArmored });
          publicKeyArmored = pk.toPublic().armor();
          keyInfo = await getKeyInfo(pk.toPublic());
        } catch {
          // ignore
        }
      }

      set({
        isSetUp: true,
        isUnlocked: true,
        privateKeyArmored,
        publicKeyArmored,
        passphrase,
        keyInfo,
        email,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error ? err.message : "Failed to unlock PGP key",
      });
    }
  },

  lock: () => {
    set({
      isUnlocked: false,
      privateKeyArmored: null,
      passphrase: null,
    });
  },

  importPrivateKey: async (armoredKey, email, passphrase) => {
    set({ loading: true, error: null });
    try {
      // Validate the key can be read and decrypted
      const privateKey = await readPrivateKey({ armoredKey });
      await decryptKey({ privateKey, passphrase });

      const publicKeyArmored = privateKey.toPublic().armor();
      const keyInfo = await getKeyInfo(privateKey.toPublic());

      // Store in IndexedDB
      await storePrivateKey(email, armoredKey, passphrase);

      // Upload public key to server
      await apiPut("/api/pgp/key", { publicKey: publicKeyArmored });

      set({
        isSetUp: true,
        isUnlocked: true,
        privateKeyArmored: armoredKey,
        publicKeyArmored,
        passphrase,
        keyInfo,
        email,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error ? err.message : "Failed to import private key",
      });
      throw err;
    }
  },

  clearOnLogout: () => {
    set({
      isSetUp: false,
      isUnlocked: false,
      privateKeyArmored: null,
      publicKeyArmored: null,
      passphrase: null,
      keyInfo: null,
      email: null,
      revocationCertificate: null,
      loading: false,
      error: null,
      trustedKeys: new Map(),
    });
  },

  checkSetup: async (email) => {
    try {
      const exists = await hasPrivateKey(email);
      set({ isSetUp: exists, email });
    } catch {
      set({ isSetUp: false, email });
    }
  },

  deleteKey: async (email) => {
    set({ loading: true, error: null });
    try {
      await deletePrivateKey(email);
      try {
        await apiDelete("/api/pgp/key");
      } catch {
        // Server-side delete may fail, that is acceptable
      }
      set({
        isSetUp: false,
        isUnlocked: false,
        privateKeyArmored: null,
        publicKeyArmored: null,
        passphrase: null,
        keyInfo: null,
        revocationCertificate: null,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to delete key",
      });
    }
  },

  setSignDefault: (value) => set({ signDefault: value }),
  setEncryptDefault: (value) => set({ encryptDefault: value }),
  setAutoLookupKeys: (value) => set({ autoLookupKeys: value }),

  addTrustedKey: async (email, publicKeyArmored, trustLevel) => {
    const publicKey = await readKey({ armoredKey: publicKeyArmored });
    const fingerprint = publicKey.getFingerprint();

    set((state) => {
      const trustedKeys = new Map(state.trustedKeys);
      trustedKeys.set(email.toLowerCase(), {
        publicKeyArmored,
        trustLevel,
        fingerprint,
      });
      return { trustedKeys };
    });
  },

  removeTrustedKey: (email) => {
    set((state) => {
      const trustedKeys = new Map(state.trustedKeys);
      trustedKeys.delete(email.toLowerCase());
      return { trustedKeys };
    });
  },

  setTrustLevel: (email, level) => {
    set((state) => {
      const trustedKeys = new Map(state.trustedKeys);
      const existing = trustedKeys.get(email.toLowerCase());
      if (existing) {
        trustedKeys.set(email.toLowerCase(), { ...existing, trustLevel: level });
      }
      return { trustedKeys };
    });
  },
}));
