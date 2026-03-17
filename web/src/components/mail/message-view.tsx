/** Full message view in reading pane - premium design */

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
  Info,
  Printer,
  UserPlus,
  Copy,
  Mail,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useUIStore } from "@/stores/ui-store.ts";
import { PGPStatusBar, EncryptedPlaceholder, usePGPMessage } from "@/components/mail/pgp-message.tsx";
import { detectPGPContent } from "@/lib/pgp-detect.ts";
import { InvitationCard } from "@/components/calendar/invitation-card.tsx";
import { SmartReplyBar } from "@/components/mail/smart-reply-bar.tsx";
import { useAIEnabled } from "@/hooks/use-ai-enabled.ts";
import { useTranslation } from "react-i18next";
import { EmailPropertiesDialog } from "@/components/mail/email-properties-dialog.tsx";
import { printEmail } from "@/lib/print.ts";

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

        {/* Attachment cards */}
        {attachments.length > 0 && (
          <div className="message-view__attachments">
            {attachments.map((att, i) => (
              <AttachmentCard key={i} attachment={att} />
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
  const icon = getFileIcon(attachment.type);
  return (
    <a
      href={`/api/blob/${attachment.blobId}`}
      download={attachment.name ?? "attachment"}
      className="message-view__attachment-card"
    >
      <span className="message-view__attachment-icon">{icon}</span>
      <div className="message-view__attachment-info">
        <span className="message-view__attachment-name">{attachment.name ?? "attachment"}</span>
        <span className="message-view__attachment-size">{formatFileSize(attachment.size)}</span>
      </div>
      <Download size={14} className="message-view__attachment-download" />
    </a>
  );
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("image/")) return <FileImage size={18} />;
  if (mimeType.includes("pdf")) return <FileText size={18} />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <FileArchive size={18} />;
  return <File size={18} />;
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
