/** Full message view in reading pane - premium design */

import React, { Suspense, useMemo, useState, useRef, useCallback } from "react";
import { useMessage } from "@/hooks/use-message.ts";
import { useCompose } from "@/components/mail/compose/use-compose.ts";
import { fetchIdentities, sendReadReceipt } from "@/api/mail.ts";
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
  Phone,
  Paperclip,
  Download,
  ImageOff,
  ChevronDown,
  ChevronUp,
  FileText,
  File,
  FileImage,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  FileVideo,
  FileAudio,
  Presentation,
  AlertTriangle,
  Info,
  Printer,
  UserPlus,
  Copy,
  Mail,
  X,
  MailCheck,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useUIStore } from "@/stores/ui-store.ts";
import { useAuthStore } from "@/stores/auth-store.ts";
import { useWaveStore } from "@/stores/wave-store.ts";
import { useWave } from "@/hooks/use-wave.ts";
import { WaveLobby } from "@/components/wave/wave-lobby.tsx";
import { PGPStatusBar, EncryptedPlaceholder, usePGPMessage } from "@/components/mail/pgp-message.tsx";
import { detectPGPContent } from "@/lib/pgp-detect.ts";
import { InvitationCard } from "@/components/calendar/invitation-card.tsx";
import { SmartReplyBar } from "@/components/mail/smart-reply-bar.tsx";
import { useAIEnabled } from "@/hooks/use-ai-enabled.ts";
import { useTranslation } from "react-i18next";
import { EmailPropertiesDialog } from "@/components/mail/email-properties-dialog.tsx";
import { printEmail } from "@/lib/print.ts";
import { parseSpamStatus } from "@/lib/spam.ts";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { trainSpam } from "@/api/spam.ts";
import { toast } from "sonner";

const DMARCReportCard = React.lazy(() =>
  import("@/components/mail/dmarc-report-card.tsx").then(m => ({ default: m.DMARCReportCard }))
);

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
  const { t } = useTranslation();
  const [showExternalImages, setShowExternalImages] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [showQuotedText, setShowQuotedText] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [readReceiptDismissed, setReadReceiptDismissed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { open: openCompose } = useCompose();
  const aiEnabled = useAIEnabled();
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

  // Build CID → blob URL map for resolving inline images
  const cidMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const att of email.attachments ?? []) {
      if (att.cid && att.blobId) {
        map.set(att.cid, `/api/blob/${att.blobId}/inline`);
      }
    }
    return map;
  }, [email.attachments]);

  // Sanitize HTML
  const sanitized = useMemo(() => {
    if (bodyHtml) {
      return sanitizeEmailHtml(bodyHtml, cidMap);
    }
    return null;
  }, [bodyHtml, cidMap]);

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

  // Spam status from X-Spam-Status header
  const spamStatus = useMemo(() => {
    const raw = (email as unknown as Record<string, unknown>)["header:X-Spam-Status:asRaw"];
    return parseSpamStatus(raw as string | null);
  }, [email]);

  const selectedMailboxId = useUIStore((s) => s.selectedMailboxId);
  const { findByRole } = useMailboxes();
  const isInJunk = useMemo(() => {
    const junk = findByRole("junk");
    return junk ? !!email.mailboxIds[junk.id] : false;
  }, [email.mailboxIds, findByRole]);

  const readReceiptTo = useMemo(() => {
    const raw = (email as unknown as Record<string, unknown>)["header:Disposition-Notification-To:asRaw"];
    if (!raw || typeof raw !== "string") return null;
    // Extract email from the header value (may be in format "Name <email>" or just "email")
    const match = raw.match(/<([^>]+)>/);
    return match ? match[1].trim() : raw.trim();
  }, [email]);

  const handleNotSpamBanner = useCallback(async () => {
    const inbox = findByRole("inbox");
    if (!inbox) return;
    trainSpam([email.id], "ham").catch(() => {});
    // Move via JMAP — reuse updateEmails to move from junk to inbox
    const { updateEmails } = await import("@/api/mail.ts");
    const junk = findByRole("junk");
    if (junk) {
      await updateEmails({
        [email.id]: {
          [`mailboxIds/${junk.id}`]: null,
          [`mailboxIds/${inbox.id}`]: true,
        },
      });
    }
  }, [email.id, findByRole]);

  // PGP message hook for decryption/verification
  const pgpMessage = usePGPMessage(
    hasPGPContent ? (rawBodyText ?? bodyHtml ?? null) : null,
    senderEmailAddr,
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="message-view">
        {/* Header */}
        <div className="message-view__header">
          {/* Subject */}
          <h2 className="message-view__subject">
            {email.subject || t("message.noSubject")}
          </h2>

          {/* Sender row */}
          <div className="message-view__sender-row">
            <div className="message-view__avatar">
              <Avatar address={sender} size={40} />
            </div>
            <div className="message-view__sender-info">
              <div className="message-view__sender-name-line">
                <AddressContextMenu address={sender}>
                  <span className="message-view__sender-name" style={{ cursor: "context-menu" }}>
                    {formatAddress(sender)}
                  </span>
                </AddressContextMenu>
                <AddressContextMenu address={sender}>
                  <span className="message-view__sender-email" style={{ cursor: "context-menu" }}>
                    &lt;{sender.email}&gt;
                  </span>
                </AddressContextMenu>
              </div>

              {/* Recipients as chips */}
              <div className="message-view__recipients">
                <span className="message-view__recipients-label">{t("messageView.to")}</span>
                {visibleRecipients.map((a, i) => (
                  <AddressContextMenu key={i} address={a}>
                    <span className="message-view__recipient-chip" style={{ cursor: "context-menu" }}>
                      {formatAddress(a)}
                    </span>
                  </AddressContextMenu>
                ))}
                {hiddenCount > 0 && !showAllRecipients && (
                  <button
                    onClick={() => setShowAllRecipients(true)}
                    className="message-view__recipients-more"
                  >
                    {t("messageView.more", { count: hiddenCount })}
                  </button>
                )}
              </div>
            </div>

            {/* Date + actions */}
            <div className="message-view__header-actions">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className="message-view__date">
                    {formatRelativeDate(email.receivedAt)}
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content
                  className="tooltip-content"
                  sideOffset={5}
                >
                  {formatFullDate(email.receivedAt)}
                </Tooltip.Content>
              </Tooltip.Root>

              <div className="message-view__action-buttons">
                <ActionButton
                  icon={<Reply size={18} />}
                  label={t("action.replyShortcut")}
                  onClick={() => openCompose({ mode: "reply", email, identity: defaultIdentity })}
                />
                <ActionButton
                  icon={<ReplyAll size={18} />}
                  label={t("action.replyAllShortcut")}
                  onClick={() => openCompose({ mode: "reply-all", email, identity: defaultIdentity })}
                />
                <ActionButton
                  icon={<Forward size={18} />}
                  label={t("action.forwardShortcut")}
                  onClick={() => openCompose({ mode: "forward", email, identity: defaultIdentity })}
                />
                <WaveCallButton senderEmail={senderEmailAddr} />
                <ActionButton
                  icon={<Printer size={18} />}
                  label={t("action.print")}
                  onClick={() => printEmail(email)}
                />
                <ActionButton
                  icon={<Info size={18} />}
                  label={t("action.properties")}
                  onClick={() => setShowProperties(true)}
                />
                <ActionButton icon={<MoreHorizontal size={18} />} label={t("action.more")} />
              </div>
            </div>
          </div>
        </div>

        {/* Spam banner — shown when email is in Junk folder with spam status */}
        {isInJunk && spamStatus && (
          <div className="message-view__images-bar" style={{ backgroundColor: "var(--color-bg-warning, #fef3cd)", borderColor: "var(--color-border-warning, #ffc107)" }}>
            <AlertTriangle size={14} />
            <span>{t("spam.flaggedBanner", { score: spamStatus.score.toFixed(1) })}</span>
            <button onClick={handleNotSpamBanner} className="message-view__images-bar-action">
              {t("action.notSpam")}
            </button>
          </div>
        )}

        {/* Spam score badge — shown when not in junk but has spam data */}
        {!isInJunk && spamStatus && (
          <div style={{ padding: "2px 8px", fontSize: "11px", color: "var(--color-text-tertiary)" }}>
            {t("spam.score", { score: spamStatus.score.toFixed(1) })}
          </div>
        )}

        {/* External images bar */}
        {sanitized?.hasExternalImages && !showExternalImages && (
          <div className="message-view__images-bar">
            <ImageOff size={14} />
            <span>{t("messageView.externalImagesHidden")}</span>
            <button onClick={handleLoadImages} className="message-view__images-bar-action">
              {t("messageView.loadImages")}
            </button>
          </div>
        )}

        {/* Read receipt banner */}
        {readReceiptTo && !readReceiptDismissed && !email.keywords["$mdnsent"] && (
          <div className="message-view__images-bar" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
            <MailCheck size={14} />
            <span>{t("readReceipt.requested")}</span>
            <button
              onClick={async () => {
                try {
                  await sendReadReceipt(email.id, readReceiptTo, defaultIdentity);
                  toast.success(t("readReceipt.sent"));
                  setReadReceiptDismissed(true);
                } catch {
                  toast.error(t("readReceipt.failed"));
                }
              }}
              className="message-view__images-bar-action"
            >
              {t("readReceipt.send")}
            </button>
            <button
              onClick={() => setReadReceiptDismissed(true)}
              className="message-view__images-bar-action"
              style={{ opacity: 0.7 }}
            >
              {t("readReceipt.ignore")}
            </button>
          </div>
        )}

        {/* Attachment cards */}
        {attachments.length > 0 && (
          <div className="message-view__attachments">
            {/* Inline previews for images and PDFs */}
            {attachments.some(a => a.size <= 10 * 1024 * 1024 && (a.type?.startsWith("image/") || a.type?.includes("pdf"))) && (
              <div className="message-view__attachment-previews">
                {attachments.filter(a => a.size <= 10 * 1024 * 1024).map((att, i) => {
                  if (att.type?.startsWith("image/")) {
                    return (
                      <button
                        key={i}
                        className="message-view__attachment-preview-img-btn"
                        onClick={() => setLightboxUrl(`/api/blob/${att.blobId}/inline`)}
                      >
                        <img
                          src={`/api/blob/${att.blobId}/inline`}
                          alt={att.name ?? "attachment"}
                          loading="lazy"
                          className="message-view__attachment-preview-img"
                        />
                      </button>
                    );
                  }
                  if (att.type?.includes("pdf")) {
                    return (
                      <div key={i} className="message-view__attachment-preview-pdf">
                        <iframe
                          src={`/api/blob/${att.blobId}`}
                          title={att.name ?? "PDF"}
                          className="message-view__attachment-preview-iframe"
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
            {/* Download all button when multiple attachments */}
            {attachments.length > 1 && (
              <div className="message-view__attachments-header">
                <span className="message-view__attachments-count">
                  {t("messageView.attachmentCount", { count: attachments.length })}
                </span>
                <button
                  className="message-view__download-all-btn"
                  onClick={() => {
                    for (const att of attachments) {
                      const a = document.createElement("a");
                      a.href = `/api/blob/${att.blobId}`;
                      a.download = att.name ?? "attachment";
                      a.click();
                    }
                  }}
                >
                  <Download size={14} />
                  {t("messageView.downloadAll")}
                </button>
              </div>
            )}
            {attachments.map((att, i) => (
              <AttachmentCard key={i} attachment={att} />
            ))}
          </div>
        )}

        {/* Calendar invitation cards */}
        {icsAttachments.map((att) => (
          <InvitationCard key={att.blobId} blobId={att.blobId!} />
        ))}

        {/* DMARC Report Cards */}
        {(email.attachments ?? []).filter(att => isDMARCReport(att, email.subject)).map((att, i) => (
          <div key={`dmarc-${i}`} className="message-view__attachments" style={{ padding: "16px 16px 12px" }}>
            <Suspense fallback={
              <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading DMARC report...</span>
              </div>
            }>
              <DMARCReportCard blobId={att.blobId!} filename={att.name ?? undefined} />
            </Suspense>
          </div>
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
        <div ref={contentRef} className="message-view__body">
          {/* Show decrypted content if available */}
          {pgpMessage.isDecrypted && pgpMessage.decryptedText ? (
            <pre className="message-view__text-content">
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
                className="message-view__text-content"
                dangerouslySetInnerHTML={{
                  __html: linkifyText(processedText.body),
                }}
              />
              {processedText.quoted && (
                <div className="message-view__quoted-section">
                  <button
                    onClick={() => setShowQuotedText(!showQuotedText)}
                    className="message-view__quoted-toggle"
                  >
                    {showQuotedText ? (
                      <>
                        <ChevronUp size={12} /> {t("messageView.hideQuotedText")}
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} /> {t("messageView.showQuotedText")}
                      </>
                    )}
                  </button>
                  {showQuotedText && (
                    <pre
                      className="message-view__quoted-text"
                      dangerouslySetInnerHTML={{
                        __html: linkifyText(processedText.quoted),
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="message-view__no-content">
              {t("message.noContent")}
            </p>
          )}
        </div>

        {/* Smart Reply Bar (AI-powered) */}
        {aiEnabled && (
          <SmartReplyBar email={email} />
        )}
      </div>

      {/* Email properties dialog */}
      {showProperties && (
        <EmailPropertiesDialog
          email={email}
          onClose={() => setShowProperties(false)}
        />
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="message-view__lightbox"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="message-view__lightbox-close"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={24} />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="message-view__lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Tooltip.Provider>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className="message-view__action-btn"
          onClick={onClick}
          aria-label={label}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content
        className="tooltip-content"
        sideOffset={5}
      >
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

function AttachmentCard({ attachment }: { attachment: EmailBodyPart }) {
  const { icon, color, bgColor } = getFileTypeInfo(attachment.type, attachment.name);
  const ext = getFileExtension(attachment.name);

  return (
    <div className="attachment-card">
      {/* Icon area with type-specific color */}
      <div className="attachment-card__icon" style={{ backgroundColor: bgColor, color }}>
        {icon}
        {ext && <span className="attachment-card__ext">{ext}</span>}
      </div>

      {/* File info */}
      <div className="attachment-card__info">
        <span className="attachment-card__name" title={attachment.name ?? "attachment"}>
          {attachment.name ?? "attachment"}
        </span>
        <span className="attachment-card__size">{formatFileSize(attachment.size)}</span>
      </div>

      {/* Download button */}
      <a
        href={`/api/blob/${attachment.blobId}`}
        download={attachment.name ?? "attachment"}
        className="attachment-card__download"
        onClick={(e) => e.stopPropagation()}
        title="Download"
      >
        <Download size={14} />
      </a>
    </div>
  );
}

interface FileTypeInfo {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

function getFileTypeInfo(mimeType: string, name?: string | null): FileTypeInfo {
  const ext = getFileExtension(name)?.toLowerCase();

  // Images
  if (mimeType.startsWith("image/")) {
    return { icon: <FileImage size={20} />, color: "#8b5cf6", bgColor: "rgba(139, 92, 246, 0.1)" };
  }

  // PDF
  if (mimeType.includes("pdf") || ext === "pdf") {
    return { icon: <FileText size={20} />, color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.1)" };
  }

  // Spreadsheets
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") ||
      ext === "xlsx" || ext === "xls" || ext === "csv") {
    return { icon: <FileSpreadsheet size={20} />, color: "#22c55e", bgColor: "rgba(34, 197, 94, 0.1)" };
  }

  // Presentations
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") ||
      ext === "pptx" || ext === "ppt" || ext === "key") {
    return { icon: <Presentation size={20} />, color: "#f97316", bgColor: "rgba(249, 115, 22, 0.1)" };
  }

  // Documents (Word, etc.)
  if (mimeType.includes("document") || mimeType.includes("msword") ||
      ext === "docx" || ext === "doc" || ext === "rtf" || ext === "odt") {
    return { icon: <FileText size={20} />, color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.1)" };
  }

  // Archives
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed") ||
      ext === "zip" || ext === "gz" || ext === "tar" || ext === "rar" || ext === "7z") {
    return { icon: <FileArchive size={20} />, color: "#a855f7", bgColor: "rgba(168, 85, 247, 0.1)" };
  }

  // Video
  if (mimeType.startsWith("video/") || ext === "mp4" || ext === "mov" || ext === "avi" || ext === "mkv") {
    return { icon: <FileVideo size={20} />, color: "#ec4899", bgColor: "rgba(236, 72, 153, 0.1)" };
  }

  // Audio
  if (mimeType.startsWith("audio/") || ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "flac") {
    return { icon: <FileAudio size={20} />, color: "#06b6d4", bgColor: "rgba(6, 182, 212, 0.1)" };
  }

  // Code / text
  if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("xml") ||
      mimeType.includes("html") || mimeType.includes("css") || mimeType.startsWith("text/") ||
      ext === "js" || ext === "ts" || ext === "py" || ext === "go" || ext === "rs" ||
      ext === "md" || ext === "yml" || ext === "yaml" || ext === "json" || ext === "xml") {
    return { icon: <FileCode size={20} />, color: "#64748b", bgColor: "rgba(100, 116, 139, 0.1)" };
  }

  // Figma / design
  if (ext === "fig" || ext === "sketch" || ext === "xd") {
    return { icon: <FileImage size={20} />, color: "#f97316", bgColor: "rgba(249, 115, 22, 0.1)" };
  }

  // Default
  return { icon: <File size={20} />, color: "#78716c", bgColor: "rgba(120, 113, 108, 0.1)" };
}

function getFileExtension(name?: string | null): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.substring(dot + 1);
}

/** Start Wave call button — opens lobby for same-domain senders */
function WaveCallButton({ senderEmail }: { senderEmail: string }) {
  const { t } = useTranslation();
  const userEmail = useAuthStore((s) => s.email);
  const callState = useWaveStore((s) => s.callState);
  const { startCall } = useWave();
  const [showLobby, setShowLobby] = useState(false);

  const userDomain = userEmail.split("@")[1]?.toLowerCase();
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
  if (!userDomain || !senderDomain || userDomain !== senderDomain || senderEmail === userEmail) return null;
  if (callState !== "idle") return null;

  const senderName = senderEmail.split("@")[0];

  return (
    <>
      <ActionButton
        icon={<Phone size={18} />}
        label={t("wave.startCall")}
        onClick={() => setShowLobby(true)}
      />
      <WaveLobby
        open={showLobby}
        onOpenChange={setShowLobby}
        peerEmail={senderEmail}
        peerName={senderName}
        onStartCall={(settings) => startCall(senderEmail, settings.video)}
      />
    </>
  );
}

/** Right-click context menu for email addresses in the reading pane */
function AddressContextMenu({
  address,
  children,
}: {
  address: { name: string | null; email: string };
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { open: openCompose } = useCompose();

  const handleAddToContacts = useCallback(() => {
    sessionStorage.setItem("newContactEmail", address.email);
    if (address.name) {
      sessionStorage.setItem("newContactName", address.name);
    }
    setActiveView("contacts");
  }, [address, setActiveView]);

  const handleCopyEmail = useCallback(() => {
    navigator.clipboard.writeText(address.email).catch(() => {});
  }, [address.email]);

  const handleCompose = useCallback(() => {
    openCompose({
      mode: "new",
      prefillTo: [address],
    });
  }, [address, openCompose]);

  const itemClassName =
    "flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer outline-none hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150";
  const itemStyle = {
    color: "var(--color-text-primary)",
    borderRadius: "var(--radius-sm)",
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-50 min-w-[180px] rounded-lg py-1"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <ContextMenu.Item
            className={itemClassName}
            style={itemStyle}
            onSelect={handleAddToContacts}
          >
            <UserPlus size={14} />
            {t("contextMenu.addToContacts", { defaultValue: "Add to contacts" })}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClassName}
            style={itemStyle}
            onSelect={handleCompose}
          >
            <Mail size={14} />
            {t("contextMenu.composeEmail", { defaultValue: "Send email" })}
          </ContextMenu.Item>
          <ContextMenu.Separator
            className="my-1"
            style={{ borderTop: "1px solid var(--color-border-secondary)" }}
          />
          <ContextMenu.Item
            className={itemClassName}
            style={itemStyle}
            onSelect={handleCopyEmail}
          >
            <Copy size={14} />
            {t("contextMenu.copyEmail", { defaultValue: "Copy email address" })}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function isDMARCReport(att: EmailBodyPart, subject?: string): boolean {
  const name = (att.name ?? "").toLowerCase();
  const type = (att.type ?? "").toLowerCase();
  // Check filename pattern: receiver!domain!begin!end[!id].ext
  const hasDMARCFilename = name.includes("!") && (name.endsWith(".xml.gz") || name.endsWith(".zip") || name.endsWith(".xml"));
  // Check subject
  const hasDMARCSubject = (subject ?? "").toLowerCase().startsWith("report domain:");
  // Check MIME type + subject combo
  const isDMARCMime = ["application/gzip", "application/x-gzip", "application/zip", "application/x-zip-compressed"].includes(type);

  return hasDMARCFilename || (hasDMARCSubject && (isDMARCMime || type === "application/xml" || type === "text/xml"));
}

function MessageViewSkeleton() {
  return (
    <div className="message-view message-view--skeleton">
      <div className="message-view__header">
        <Skeleton width="70%" height={24} className="mb-4" />
        <div className="flex items-start gap-3">
          <Skeleton width={40} height={40} rounded />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton width={180} height={14} />
            <Skeleton width={120} height={12} />
          </div>
        </div>
      </div>
      <div className="message-view__body">
        <div className="flex flex-col gap-3">
          <Skeleton width="100%" height={16} />
          <Skeleton width="95%" height={16} />
          <Skeleton width="80%" height={16} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="60%" height={16} />
        </div>
      </div>
    </div>
  );
}
