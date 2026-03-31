/** Email properties/headers dialog — Overview + Raw Headers tabs */

import React, { useMemo, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Lock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchEmailHeaders } from "@/api/mail.ts";
import type { Email, EmailAddress } from "@/types/mail.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import {
  formatAddress,
  formatFullDate,
  formatFileSize,
} from "@/lib/format.ts";
import {
  parseReceivedHeaders,
  parseAuthResults,
  type ReceivedHop,
  type AuthStatus,
} from "@/lib/email-headers.ts";

interface EmailPropertiesDialogProps {
  email: Email;
  onClose: () => void;
}

export const EmailPropertiesDialog = React.memo(function EmailPropertiesDialog({
  email,
  onClose,
}: EmailPropertiesDialogProps) {
  const { t } = useTranslation();

  const { data: headersData, isLoading } = useQuery({
    queryKey: ["emailHeaders", email.id],
    queryFn: () => fetchEmailHeaders(email.id),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-overlay"
        />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full rounded-lg flex flex-col bg-elevated border-primary"
          style={{
            maxWidth: 800,
            height: "80vh",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b-primary"
          >
            <Dialog.Title
              className="text-lg font-semibold text-primary"
            >
              {t("properties.title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors text-secondary"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
            <Tabs.List
              className="flex px-6 gap-1 shrink-0 border-b-primary"
            >
              <TabTrigger value="overview">{t("properties.overview")}</TabTrigger>
              <TabTrigger value="raw">{t("properties.rawHeaders")}</TabTrigger>
            </Tabs.List>

            <Tabs.Content value="overview" className="px-6 py-4 flex-1 overflow-y-auto">
              {isLoading ? (
                <div
                  className="py-8 text-center text-sm text-secondary"
                >
                  Loading...
                </div>
              ) : (
                <OverviewTab email={email} headersData={headersData ?? null} />
              )}
            </Tabs.Content>

            <Tabs.Content value="raw" className="px-6 py-4 flex-1 overflow-y-auto">
              {isLoading ? (
                <div
                  className="py-8 text-center text-sm text-secondary"
                >
                  Loading...
                </div>
              ) : (
                <RawHeadersTab headersData={headersData ?? null} />
              )}
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

/* ================================================================
   Tab trigger button
   ================================================================ */

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 border-transparent data-[state=active]:border-[var(--color-accent)] data-[state=active]:text-[var(--color-accent)] hover:text-[var(--color-text-primary)] text-secondary"
    >
      {children}
    </Tabs.Trigger>
  );
}

/* ================================================================
   Overview tab
   ================================================================ */

interface OverviewTabProps {
  email: Email;
  headersData: Awaited<ReturnType<typeof fetchEmailHeaders>> | null;
}

function OverviewTab({ email, headersData }: OverviewTabProps) {
  const { t } = useTranslation();

  const receivedRaw = headersData?.headerValues?.["Received"] ?? null;
  const receivedHeaders = useMemo(() => {
    if (!receivedRaw) {
      // Try from rawHeaders array
      if (headersData?.rawHeaders) {
        const received = headersData.rawHeaders
          .filter((h) => h.name.toLowerCase() === "received")
          .map((h) => h.value);
        if (received.length > 0) return parseReceivedHeaders(received);
      }
      return [];
    }
    // Single header value — may contain multiple values concatenated
    return parseReceivedHeaders([receivedRaw]);
  }, [receivedRaw, headersData]);

  // Collect ALL Authentication-Results and ARC-Authentication-Results headers from rawHeaders
  const authHeaders = useMemo(() => {
    if (!headersData?.rawHeaders) return [];
    return headersData.rawHeaders
      .filter((h) => {
        const name = h.name.toLowerCase();
        return name === "authentication-results" || name === "arc-authentication-results";
      })
      .map((h) => h.value);
  }, [headersData]);

  const receivedStrings = useMemo(() => {
    if (headersData?.rawHeaders) {
      return headersData.rawHeaders
        .filter((h) => h.name.toLowerCase() === "received")
        .map((h) => h.value);
    }
    return receivedRaw ? [receivedRaw] : [];
  }, [headersData, receivedRaw]);

  const authResults = useMemo(
    () => parseAuthResults(authHeaders, receivedStrings),
    [authHeaders, receivedStrings],
  );

  const messageId = headersData?.headerValues?.["Message-ID"]?.trim() ?? null;
  const inReplyTo = headersData?.headerValues?.["In-Reply-To"]?.trim() ?? null;
  const references = headersData?.headerValues?.["References"]?.trim() ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* Message Info */}
      <Section title={t("properties.messageInfo")}>
        <InfoRow label={t("compose.subject")} value={email.subject || t("message.noSubject")} />
        <InfoRow label="Message-ID" value={messageId} mono />
        <InfoRow label={t("properties.date")} value={formatFullDate(email.receivedAt)} />
        <InfoRow label={t("properties.size")} value={formatFileSize(email.size)} />
        {headersData?.headerValues?.["X-Mailer"] && (
          <InfoRow label="X-Mailer" value={headersData.headerValues["X-Mailer"].trim()} />
        )}
        {headersData?.headerValues?.["User-Agent"] && (
          <InfoRow label="User-Agent" value={headersData.headerValues["User-Agent"].trim()} />
        )}
      </Section>

      {/* Participants */}
      <Section title={t("properties.participants")}>
        {email.from && email.from.length > 0 && (
          <ParticipantRow label={t("compose.from")} addresses={email.from} />
        )}
        {email.to && email.to.length > 0 && (
          <ParticipantRow label={t("compose.to")} addresses={email.to} />
        )}
        {email.cc && email.cc.length > 0 && (
          <ParticipantRow label={t("compose.cc")} addresses={email.cc} />
        )}
        {email.bcc && email.bcc.length > 0 && (
          <ParticipantRow label={t("compose.bcc")} addresses={email.bcc} />
        )}
        {email.replyTo && email.replyTo.length > 0 && (
          <ParticipantRow label="Reply-To" addresses={email.replyTo} />
        )}
        {headersData?.headerValues?.["Return-Path"] && (
          <InfoRow label="Return-Path" value={headersData.headerValues["Return-Path"].trim()} mono />
        )}
      </Section>

      {/* Delivery Route */}
      {receivedHeaders.length > 0 && (
        <Section title={t("properties.deliveryRoute")}>
          <DeliveryTimeline hops={receivedHeaders} />
        </Section>
      )}

      {/* Security */}
      <Section title={t("properties.security")}>
        <SecurityRow label="SPF" status={authResults.spf} />
        <SecurityRow label="DKIM" status={authResults.dkim} />
        <SecurityRow label="DMARC" status={authResults.dmarc} />
        <SecurityRow label="ARC" status={authResults.arc} />
        {authResults.tlsVersion && (
          <div className="flex items-center gap-2 py-1">
            <Lock size={14} className="text-accent" />
            <span
              className="text-sm font-medium text-primary"
            >
              TLS
            </span>
            <span
              className="text-sm text-secondary"
            >
              {authResults.tlsVersion}
            </span>
          </div>
        )}
      </Section>

      {/* Threading */}
      {(inReplyTo || references) && (
        <Section title={t("properties.threading")}>
          {inReplyTo && <InfoRow label="In-Reply-To" value={inReplyTo} mono />}
          {references && <InfoRow label="References" value={references} mono />}
          <InfoRow label="Thread-ID" value={email.threadId} mono />
        </Section>
      )}
    </div>
  );
}

/* ================================================================
   Section wrapper
   ================================================================ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-md p-4 border-primary bg-secondary"
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3 text-secondary"
      >
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/* ================================================================
   Info row (label + value)
   ================================================================ */

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-0.5 text-sm">
      <span
        className="shrink-0 w-24 text-right font-medium text-secondary"
      >
        {label}
      </span>
      <span
        className={`break-all text-primary ${mono ? "font-mono text-xs leading-5" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ================================================================
   Participant row with avatar cards
   ================================================================ */

function ParticipantRow({
  label,
  addresses,
}: {
  label: string;
  addresses: EmailAddress[];
}) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span
        className="shrink-0 w-24 text-right font-medium pt-1.5 text-secondary"
      >
        {label}
      </span>
      <div className="flex flex-col gap-1.5">
        {addresses.map((addr, i) => (
          <div key={i} className="flex items-center gap-2">
            <Avatar address={addr} size={24} />
            <span className="text-primary">
              {formatAddress(addr)}
            </span>
            {addr.name && (
              <span
                className="text-xs text-secondary"
              >
                &lt;{addr.email}&gt;
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   Delivery route timeline
   ================================================================ */

function DeliveryTimeline({ hops }: { hops: ReceivedHop[] }) {
  return (
    <div className="relative ml-28">
      {/* Vertical line */}
      <div
        className="absolute left-[7px] top-3 bottom-3"
        style={{ width: 2, backgroundColor: "var(--color-border-primary)" }}
      />

      {/* Render hops in reverse order (newest = top = final destination) */}
      {[...hops].reverse().map((hop, i, arr) => {
        const isFirst = i === 0;
        const isLast = i === arr.length - 1;
        return (
          <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Dot */}
            <div
              className="relative z-10 shrink-0 mt-1.5 rounded-full"
              style={{
                width: 16,
                height: 16,
                backgroundColor: isFirst
                  ? "var(--color-accent)"
                  : "var(--color-bg-tertiary)",
                border: `2px solid ${isFirst ? "var(--color-accent)" : "var(--color-border-primary)"}`,
              }}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-medium text-primary"
                >
                  {isFirst
                    ? "Received by your server"
                    : isLast
                      ? "Sent from"
                      : "Relayed through"}
                </span>
                {hop.tls && (
                  <Lock
                    size={12}
                    className="text-accent"
                    aria-label="TLS encrypted"
                  />
                )}
                {hop.protocol && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-mono bg-tertiary text-secondary"
                  >
                    {hop.protocol}
                  </span>
                )}
              </div>

              <div
                className="text-sm text-secondary"
              >
                {hop.from || hop.by}
                {hop.fromIp && (
                  <span className="font-mono text-xs ml-1">
                    ({hop.fromIp})
                  </span>
                )}
              </div>

              {hop.timestamp && (
                <div
                  className="text-xs mt-0.5 text-tertiary"
                >
                  {formatFullDate(hop.timestamp)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   Security status row
   ================================================================ */

function SecurityRow({ label, status }: { label: string; status: AuthStatus }) {
  const { t } = useTranslation();

  let icon: React.ReactNode;
  let color: string;
  let text: string;

  switch (status.result) {
    case "pass":
      icon = <CheckCircle2 size={14} />;
      color = "var(--color-success, #22c55e)";
      text = t("properties.pass");
      break;
    case "fail":
      icon = <XCircle size={14} />;
      color = "var(--color-danger, #ef4444)";
      text = t("properties.fail");
      break;
    case "none":
      icon = <AlertTriangle size={14} />;
      color = "var(--color-warning, #eab308)";
      text = t("properties.notPresent");
      break;
    case "unknown":
    default:
      // No Authentication-Results header found at all
      icon = <AlertTriangle size={14} />;
      color = "var(--color-text-tertiary)";
      text = t("properties.notPresent");
      break;
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span style={{ color }}>{icon}</span>
      <span
        className="text-sm font-medium w-14 text-primary"
      >
        {label}
      </span>
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
        }}
      >
        {text}
      </span>
      {status.detail && (
        <span
          className="text-xs truncate text-secondary"
        >
          {status.detail}
        </span>
      )}
    </div>
  );
}

/* ================================================================
   Raw Headers tab
   ================================================================ */

function RawHeadersTab({
  headersData,
}: {
  headersData: Awaited<ReturnType<typeof fetchEmailHeaders>> | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const rawText = useMemo(() => {
    if (!headersData?.rawHeaders || headersData.rawHeaders.length === 0)
      return "";
    return headersData.rawHeaders
      .map((h) => `${h.name}: ${h.value}`)
      .join("\n");
  }, [headersData]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [rawText]);

  // Highlighted lines
  const lines = useMemo(() => {
    if (!headersData?.rawHeaders) return [];
    return headersData.rawHeaders.map((h) => ({
      name: h.name,
      value: h.value,
      matches: searchTerm
        ? `${h.name}: ${h.value}`.toLowerCase().includes(searchTerm.toLowerCase())
        : true,
    }));
  }, [headersData, searchTerm]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border-primary bg-primary"
        >
          <Search size={14} className="text-tertiary" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent border-none outline-none text-sm text-primary"
          />
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)] border-primary text-secondary"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {t("properties.copyHeaders")}
        </button>
      </div>

      {/* Raw headers display */}
      <div
        className="rounded-md p-4 overflow-auto font-mono text-xs leading-relaxed bg-tertiary border-primary"
        style={{ maxHeight: "50vh" }}
      >
        {lines.length === 0 ? (
          <span className="text-tertiary">
            No headers available
          </span>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className="py-0.5"
              style={{
                opacity: line.matches ? 1 : 0.3,
              }}
            >
              <span
                className="font-semibold text-accent"
              >
                {line.name}:
              </span>{" "}
              <span
                className="break-all whitespace-pre-wrap text-primary"
              >
                {line.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
