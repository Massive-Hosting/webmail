/** PGP message indicators: decrypt/verify UI for message view */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Shield,
  Loader2,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { usePGPStore } from "@/stores/pgp-store.ts";
import {
  decryptMessage,
  verifySignature,
  extractPGPBlock,
} from "@/lib/pgp.ts";
import { detectPGPContent } from "@/lib/pgp-detect.ts";
import { lookupPublicKey } from "@/lib/pgp-lookup.ts";
import * as Tooltip from "@radix-ui/react-tooltip";

export type PGPVerificationStatus =
  | "valid-trusted"
  | "valid-unknown"
  | "invalid"
  | "no-key"
  | "none";

interface PGPMessageStatusProps {
  bodyText: string | null;
  senderEmail: string;
}

interface PGPStatus {
  isEncrypted: boolean;
  isDecrypted: boolean;
  decryptedText: string | null;
  decryptError: string | null;
  isSigned: boolean;
  verification: PGPVerificationStatus;
  signerEmail: string | null;
}

/**
 * Hook that handles PGP detection, decryption, and verification for a message.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePGPMessage(bodyText: string | null, senderEmail: string): PGPStatus & {
  decrypting: boolean;
  handleDecrypt: () => Promise<void>;
} {
  const isUnlocked = usePGPStore((s) => s.isUnlocked);
  const privateKeyArmored = usePGPStore((s) => s.privateKeyArmored);
  const passphrase = usePGPStore((s) => s.passphrase);
  const trustedKeys = usePGPStore((s) => s.trustedKeys);

  const [decrypting, setDecrypting] = useState(false);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [verification, setVerification] = useState<PGPVerificationStatus>("none");
  const [signerEmail, setSignerEmail] = useState<string | null>(null);

  // Detect PGP content
  const pgpContent = useMemo(() => {
    if (!bodyText) return null;
    const detected = detectPGPContent(bodyText);
    if (!detected.hasEncrypted && !detected.hasSigned && !detected.hasCleartextSigned) {
      return null;
    }
    return detected;
  }, [bodyText]);

  const isEncrypted = pgpContent?.hasEncrypted ?? false;
  const isSigned = pgpContent?.hasSigned ?? pgpContent?.hasCleartextSigned ?? false;

  // Auto-verify cleartext signatures
  useEffect(() => {
    if (!bodyText || !pgpContent?.hasCleartextSigned) return;

    const block = extractPGPBlock(bodyText);
    if (!block || block.type !== "cleartext-signed") return;

    // Look up sender's public key
    (async () => {
      try {
        // Check trusted keys first
        const trusted = trustedKeys.get(senderEmail.toLowerCase());
        let publicKeyArmored: string | null = trusted?.publicKeyArmored ?? null;

        if (!publicKeyArmored) {
          const lookup = await lookupPublicKey(senderEmail);
          publicKeyArmored = lookup?.publicKeyArmored ?? null;
        }

        if (!publicKeyArmored) {
          setVerification("no-key");
          setSignerEmail(senderEmail);
          return;
        }

        const result = await verifySignature(block.block, publicKeyArmored);
        if (result.valid) {
          const isTrusted = !!trusted && trusted.trustLevel === "verified";
          setVerification(isTrusted ? "valid-trusted" : "valid-unknown");
        } else {
          setVerification("invalid");
        }
        setSignerEmail(result.signerEmail ?? senderEmail);
      } catch {
        setVerification("no-key");
        setSignerEmail(senderEmail);
      }
    })();
  }, [bodyText, pgpContent, senderEmail, trustedKeys]);

  const handleDecrypt = useCallback(async () => {
    if (!bodyText || !privateKeyArmored || !passphrase) return;

    const block = extractPGPBlock(bodyText);
    if (!block || block.type !== "encrypted") return;

    setDecrypting(true);
    setDecryptError(null);

    try {
      // Try to find sender's public key for signature verification
      let senderPublicKey: string | undefined;
      const trusted = trustedKeys.get(senderEmail.toLowerCase());
      if (trusted) {
        senderPublicKey = trusted.publicKeyArmored;
      } else {
        const lookup = await lookupPublicKey(senderEmail);
        senderPublicKey = lookup?.publicKeyArmored;
      }

      const result = await decryptMessage(
        block.block,
        privateKeyArmored,
        passphrase,
        senderPublicKey,
      );

      setDecryptedText(result.plaintext);

      // Check signatures from decryption
      if (result.signatures.length > 0) {
        const sig = result.signatures[0];
        if (sig.valid) {
          const isTrusted = !!trusted && trusted.trustLevel === "verified";
          setVerification(isTrusted ? "valid-trusted" : "valid-unknown");
        } else {
          setVerification("invalid");
        }
        setSignerEmail(sig.signerEmail ?? senderEmail);
      }
    } catch (err) {
      setDecryptError(
        err instanceof Error ? err.message : "Failed to decrypt message",
      );
    } finally {
      setDecrypting(false);
    }
  }, [bodyText, privateKeyArmored, passphrase, senderEmail, trustedKeys]);

  // Auto-decrypt if we have the key
  useEffect(() => {
    if (isEncrypted && isUnlocked && privateKeyArmored && passphrase && !decryptedText && !decryptError) {
      handleDecrypt();
    }
  }, [isEncrypted, isUnlocked, privateKeyArmored, passphrase, decryptedText, decryptError, handleDecrypt]);

  return {
    isEncrypted,
    isDecrypted: !!decryptedText,
    decryptedText,
    decryptError,
    isSigned,
    verification,
    signerEmail,
    decrypting,
    handleDecrypt,
  };
}

/**
 * PGP status bar displayed in message header area.
 */
export const PGPStatusBar = React.memo(function PGPStatusBar({
  bodyText,
  senderEmail,
}: PGPMessageStatusProps) {
  const pgpStatus = usePGPMessage(bodyText, senderEmail);
  const [showDetails, setShowDetails] = useState(false);

  if (!pgpStatus.isEncrypted && pgpStatus.verification === "none") {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 px-6 py-2 text-sm"
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        borderBottom: "1px solid var(--color-border-secondary)",
      }}
    >
      {/* Encryption indicator */}
      {pgpStatus.isEncrypted && (
        <EncryptionBadge
          isDecrypted={pgpStatus.isDecrypted}
          decrypting={pgpStatus.decrypting}
          error={pgpStatus.decryptError}
          onDecrypt={pgpStatus.handleDecrypt}
        />
      )}

      {/* Signature indicator */}
      {pgpStatus.verification !== "none" && (
        <SignatureBadge
          status={pgpStatus.verification}
          signerEmail={pgpStatus.signerEmail}
        />
      )}

      {/* Details toggle */}
      {(pgpStatus.isEncrypted || pgpStatus.verification !== "none") && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="ml-auto text-xs flex items-center gap-0.5"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Details
          <ChevronDown
            size={10}
            style={{
              transform: showDetails ? "rotate(180deg)" : undefined,
              transition: "transform 150ms",
            }}
          />
        </button>
      )}
    </div>
  );
});

/**
 * Encrypted message placeholder (when key not available).
 */
export const EncryptedPlaceholder = React.memo(function EncryptedPlaceholder() {
  const isSetUp = usePGPStore((s) => s.isSetUp);
  const isUnlocked = usePGPStore((s) => s.isUnlocked);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <Lock size={32} style={{ color: "var(--color-text-tertiary)" }} />
      <h3
        className="text-base font-medium mt-3"
        style={{ color: "var(--color-text-primary)" }}
      >
        This message is encrypted
      </h3>
      <p
        className="text-sm mt-1 max-w-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {!isSetUp
          ? "You need to set up email signing in Settings to decrypt this message."
          : !isUnlocked
            ? "Your PGP key is locked. Enter your password to unlock it."
            : "You don't have the private key needed to decrypt this message."}
      </p>
    </div>
  );
});

/** Encryption status badge */
function EncryptionBadge({
  isDecrypted,
  decrypting,
  error,
  onDecrypt,
}: {
  isDecrypted: boolean;
  decrypting: boolean;
  error: string | null;
  onDecrypt: () => void;
}) {
  if (decrypting) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <Loader2 size={14} className="animate-spin" />
        Decrypting...
      </span>
    );
  }

  if (error) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="flex items-center gap-1.5 text-xs cursor-help"
            style={{ color: "var(--color-text-danger, #dc2626)" }}
          >
            <AlertTriangle size={14} />
            Decryption failed
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          className="text-xs px-2 py-1 rounded max-w-xs"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            boxShadow: "var(--shadow-md)",
            border: "1px solid var(--color-border-primary)",
          }}
          sideOffset={5}
        >
          {error}
        </Tooltip.Content>
      </Tooltip.Root>
    );
  }

  if (isDecrypted) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs"
        style={{ color: "#22c55e" }}
      >
        <Unlock size={14} />
        Decrypted
      </span>
    );
  }

  return (
    <button
      onClick={onDecrypt}
      className="flex items-center gap-1.5 text-xs"
      style={{ color: "var(--color-text-accent)" }}
    >
      <Lock size={14} />
      Encrypted — click to decrypt
    </button>
  );
}

/** Signature verification badge */
function SignatureBadge({
  status,
  signerEmail,
}: {
  status: PGPVerificationStatus;
  signerEmail: string | null;
}) {
  const config: Record<
    PGPVerificationStatus,
    { icon: React.ReactNode; color: string; label: string }
  > = {
    "valid-trusted": {
      icon: <ShieldCheck size={14} />,
      color: "#22c55e",
      label: `Signed by ${signerEmail ?? "sender"} (verified)`,
    },
    "valid-unknown": {
      icon: <ShieldQuestion size={14} />,
      color: "#eab308",
      label: `Signed by ${signerEmail ?? "sender"} (key not verified)`,
    },
    invalid: {
      icon: <ShieldAlert size={14} />,
      color: "#ef4444",
      label: "Signature verification failed",
    },
    "no-key": {
      icon: <Shield size={14} />,
      color: "var(--color-text-tertiary)",
      label: "Signed, but signer's key not found",
    },
    none: {
      icon: null,
      color: "",
      label: "",
    },
  };

  const c = config[status];
  if (!c.icon) return null;

  return (
    <span
      className="flex items-center gap-1.5 text-xs"
      style={{ color: c.color }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}
