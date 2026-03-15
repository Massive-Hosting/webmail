/** Full message view in reading pane */

import React, { useMemo, useState, useRef, useCallback } from "react";
import { useMessage } from "@/hooks/use-message.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { fetchIdentities } from "@/api/mail.ts";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  formatAddress,
  formatAddressList,
  formatFullDate,
  formatRelativeDate,
  formatFileSize,
} from "@/lib/format.ts";
import {
  sanitizeEmailHtml,
  loadExternalImages,
  linkifyText,
  splitQuotedText,
} from "@/lib/sanitize.ts";
import type { Email, EmailBodyPart } from "@/types/mail.ts";
import {
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Paperclip,
  Download,
  ImageOff,
  ChevronDown,
  ChevronUp,
  FileText,
  File,
  FileImage,
  FileArchive,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PGPStatusBar, EncryptedPlaceholder, usePGPMessage } from "@/components/mail/pgp-message.tsx";
import { detectPGPContent } from "@/lib/pgp-detect.ts";
import { InvitationCard } from "@/components/calendar/invitation-card.tsx";

interface MessageViewProps {
  emailId: string;
  email?: Email | null;
}

export const MessageView = React.memo(function MessageView({
  emailId,
  email: providedEmail,
}: MessageViewProps) {
  const { email: fetchedEmail, isLoading } = useMessage(
    providedEmail ? null : emailId,
  );
  const email = providedEmail ?? fetchedEmail;

  if (isLoading) {
    return <MessageViewSkeleton />;
  }

  if (!email) {
    return null;
  }

  return <MessageContent email={email} />;
});

/** Inner message content component */
function MessageContent({ email }: { email: Email }) {
  const [showExternalImages, setShowExternalImages] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [showQuotedText, setShowQuotedText] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { open: openCompose } = useCompose();
  const { data: identities } = useQuery({
    queryKey: ["identities"],
    queryFn: fetchIdentities,
    staleTime: 5 * 60 * 1000,
  });
  const defaultIdentity = identities?.[0] ?? null;

  const sender = email.from?.[0] ?? { name: null, email: "unknown" };
  const senderEmailAddr = sender.email;

  // Get body content
  const bodyHtml = useMemo(() => {
    // Try HTML body first
    if (email.htmlBody && email.bodyValues) {
      for (const part of email.htmlBody) {
        if (part.partId && email.bodyValues[part.partId]) {
          return email.bodyValues[part.partId].value;
        }
      }
    }
    return null;
  }, [email.htmlBody, email.bodyValues]);

  const bodyText = useMemo(() => {
    if (email.textBody && email.bodyValues) {
      for (const part of email.textBody) {
        if (part.partId && email.bodyValues[part.partId]) {
          return email.bodyValues[part.partId].value;
        }
      }
    }
    return null;
  }, [email.textBody, email.bodyValues]);

  // Sanitize HTML
  const sanitized = useMemo(() => {
    if (bodyHtml) {
      return sanitizeEmailHtml(bodyHtml);
    }
    return null;
  }, [bodyHtml]);

  // Process text body
  const processedText = useMemo(() => {
    if (!bodyText) return null;
    return splitQuotedText(bodyText);
  }, [bodyText]);

  // Handle loading external images
  const handleLoadImages = useCallback(() => {
    setShowExternalImages(true);
    if (contentRef.current) {
      loadExternalImages(contentRef.current);
    }
  }, []);

  // Collect recipients
  const toAddresses = email.to ?? [];
  const ccAddresses = email.cc ?? [];
  const allRecipients = [...toAddresses, ...ccAddresses];
  const visibleRecipients = showAllRecipients ? allRecipients : allRecipients.slice(0, 2);
  const hiddenCount = allRecipients.length - 2;

  // Attachments
  const attachments = email.attachments?.filter(
    (a) => a.disposition !== "inline",
  ) ?? [];

  // Detect .ics / text/calendar attachments for invitation cards
  const icsAttachments = useMemo(() => {
    if (!email.attachments) return [];
    return email.attachments.filter(
      (a) =>
        a.blobId &&
        (a.type === "text/calendar" ||
          a.type === "application/ics" ||
          (a.name && a.name.toLowerCase().endsWith(".ics"))),
    );
  }, [email.attachments]);

  // PGP detection from body text
  const rawBodyText = bodyText ?? (bodyHtml ? "" : null);
  const pgpDetected = useMemo(() => {
    if (rawBodyText) return detectPGPContent(rawBodyText);
    if (bodyHtml) return detectPGPContent(bodyHtml);
    return null;
  }, [rawBodyText, bodyHtml]);

  const hasPGPContent = pgpDetected?.hasEncrypted || pgpDetected?.hasSigned || pgpDetected?.hasCleartextSigned;

  // PGP message hook for decryption/verification
  const pgpMessage = usePGPMessage(
    hasPGPContent ? (rawBodyText ?? bodyHtml ?? null) : null,
    senderEmailAddr,
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{ backgroundColor: "var(--color-bg-primary)" }}
      >
        {/* Header - sticky */}
        <div
          className="sticky top-0 z-10 px-6 pt-4 pb-3"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderBottom: "1px solid var(--color-border-secondary)",
          }}
        >
          {/* Subject */}
          <h2
            className="text-lg font-semibold mb-3"
            style={{ color: "var(--color-text-primary)" }}
          >
            {email.subject || "(no subject)"}
          </h2>

          {/* Sender row */}
          <div className="flex items-start gap-3">
            <Avatar address={sender} size={40} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="font-medium text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {formatAddress(sender)}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  &lt;{sender.email}&gt;
                </span>
              </div>

              {/* Recipients */}
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  to
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {visibleRecipients.map((a) => formatAddress(a)).join(", ")}
                </span>
                {hiddenCount > 0 && !showAllRecipients && (
                  <button
                    onClick={() => setShowAllRecipients(true)}
                    className="text-xs"
                    style={{ color: "var(--color-text-accent)" }}
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            </div>

            {/* Date + actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {formatRelativeDate(email.receivedAt)}
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    boxShadow: "var(--shadow-md)",
                    border: "1px solid var(--color-border-primary)",
                  }}
                  sideOffset={5}
                >
                  {formatFullDate(email.receivedAt)}
                </Tooltip.Content>
              </Tooltip.Root>

              <div className="flex items-center gap-0.5 ml-2">
                <ActionButton
                  icon={<Reply size={16} />}
                  label="Reply (R)"
                  onClick={() => openCompose({ mode: "reply", email, identity: defaultIdentity })}
                />
                <ActionButton
                  icon={<ReplyAll size={16} />}
                  label="Reply All (A)"
                  onClick={() => openCompose({ mode: "reply-all", email, identity: defaultIdentity })}
                />
                <ActionButton
                  icon={<Forward size={16} />}
                  label="Forward (F)"
                  onClick={() => openCompose({ mode: "forward", email, identity: defaultIdentity })}
                />
                <ActionButton icon={<MoreHorizontal size={16} />} label="More" />
              </div>
            </div>
          </div>
        </div>

        {/* External images bar */}
        {sanitized?.hasExternalImages && !showExternalImages && (
          <div
            className="flex items-center gap-2 px-6 py-2 text-sm"
            style={{
              backgroundColor: "var(--color-bg-tertiary)",
              color: "var(--color-text-secondary)",
              borderBottom: "1px solid var(--color-border-secondary)",
            }}
          >
            <ImageOff size={16} />
            <span>External images are hidden to protect your privacy.</span>
            <button
              onClick={handleLoadImages}
              className="font-medium ml-1"
              style={{ color: "var(--color-text-accent)" }}
            >
              Load external images
            </button>
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div
            className="flex items-center gap-2 px-6 py-2 overflow-x-auto"
            style={{
              backgroundColor: "var(--color-bg-secondary)",
              borderBottom: "1px solid var(--color-border-secondary)",
            }}
          >
            <Paperclip
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
              className="shrink-0"
            />
            {attachments.map((att, i) => (
              <AttachmentChip key={i} attachment={att} />
            ))}
          </div>
        )}

        {/* Calendar invitation cards */}
        {icsAttachments.map((att) => (
          <InvitationCard key={att.blobId} blobId={att.blobId!} />
        ))}

        {/* PGP status bar */}
        {hasPGPContent && (
          <PGPStatusBar
            bodyText={rawBodyText ?? bodyHtml ?? null}
            senderEmail={senderEmailAddr}
          />
        )}

        {/* Encrypted placeholder (when can't decrypt) */}
        {pgpMessage.isEncrypted && !pgpMessage.isDecrypted && !pgpMessage.decrypting && (
          <EncryptedPlaceholder />
        )}

        {/* Body */}
        <div ref={contentRef} className="flex-1 px-6 py-4">
          {/* Show decrypted content if available */}
          {pgpMessage.isDecrypted && pgpMessage.decryptedText ? (
            <pre
              className="whitespace-pre-wrap text-sm font-sans"
              style={{
                color: "var(--color-text-primary)",
                lineHeight: 1.6,
              }}
            >
              {pgpMessage.decryptedText}
            </pre>
          ) : sanitized ? (
            <div
              className="email-content"
              dangerouslySetInnerHTML={{ __html: sanitized.html }}
            />
          ) : processedText ? (
            <div>
              <pre
                className="whitespace-pre-wrap text-sm font-sans"
                style={{
                  color: "var(--color-text-primary)",
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{
                  __html: linkifyText(processedText.body),
                }}
              />
              {processedText.quoted && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowQuotedText(!showQuotedText)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                    style={{
                      color: "var(--color-text-tertiary)",
                      backgroundColor: "var(--color-bg-tertiary)",
                    }}
                  >
                    {showQuotedText ? (
                      <>
                        <ChevronUp size={12} /> Hide quoted text
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} /> Show quoted text
                      </>
                    )}
                  </button>
                  {showQuotedText && (
                    <pre
                      className="whitespace-pre-wrap text-sm font-sans mt-2"
                      style={{
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.6,
                        borderLeft: "3px solid var(--color-border-primary)",
                        paddingLeft: "1em",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: linkifyText(processedText.quoted),
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <p
              className="text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No content available.
            </p>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          onClick={onClick}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content
        className="text-xs px-2 py-1 rounded"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--color-border-primary)",
        }}
        sideOffset={5}
      >
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function AttachmentChip({ attachment }: { attachment: EmailBodyPart }) {
  const icon = getFileIcon(attachment.type);
  return (
    <a
      href={`/api/blob/${attachment.blobId}`}
      download={attachment.name ?? "attachment"}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs shrink-0 hover:opacity-80 transition-opacity"
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border-primary)",
      }}
    >
      {icon}
      <span className="max-w-[120px] truncate">{attachment.name ?? "attachment"}</span>
      <span style={{ color: "var(--color-text-tertiary)" }}>
        {formatFileSize(attachment.size)}
      </span>
      <Download size={12} style={{ color: "var(--color-text-tertiary)" }} />
    </a>
  );
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("image/")) return <FileImage size={14} />;
  if (mimeType.includes("pdf")) return <FileText size={14} />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <FileArchive size={14} />;
  return <File size={14} />;
}

function MessageViewSkeleton() {
  return (
    <div className="px-6 pt-4">
      <Skeleton width="70%" height={24} className="mb-4" />
      <div className="flex items-start gap-3">
        <Skeleton width={40} height={40} rounded />
        <div className="flex-1 flex flex-col gap-1.5">
          <Skeleton width={180} height={14} />
          <Skeleton width={120} height={12} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton width="100%" height={14} />
        <Skeleton width="95%" height={14} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={14} />
      </div>
    </div>
  );
}
