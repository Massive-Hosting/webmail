/** IMAP import wizard — multi-step settings panel for importing email from external servers */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMailboxes } from "@/hooks/use-mailboxes.ts";
import { useTaskProgress } from "@/hooks/use-websocket.ts";
import type { WSServerMessage } from "@/lib/websocket.ts";
import {
  testIMAPConnection,
  listIMAPFolders,
  startIMAPImport,
  listImportJobs,
  getImportJob,
} from "@/api/import.ts";
import type {
  IMAPFolder,
  IMAPImportJob,
  ImportFailure,
  FolderProgress,
} from "@/api/import.ts";

type TaskProgressEvent = Extract<WSServerMessage, { type: "taskProgress" }>;

// Provider presets for auto-detection.
const PROVIDER_PRESETS: Record<string, { host: string; port: number; ssl: boolean; note?: string }> = {
  "gmail.com": { host: "imap.gmail.com", port: 993, ssl: true, note: "import.gmailAppPasswordNote" },
  "googlemail.com": { host: "imap.gmail.com", port: 993, ssl: true, note: "import.gmailAppPasswordNote" },
  "outlook.com": { host: "outlook.office365.com", port: 993, ssl: true },
  "hotmail.com": { host: "outlook.office365.com", port: 993, ssl: true },
  "live.com": { host: "outlook.office365.com", port: 993, ssl: true },
  "yahoo.com": { host: "imap.mail.yahoo.com", port: 993, ssl: true },
  "icloud.com": { host: "imap.mail.me.com", port: 993, ssl: true },
  "aol.com": { host: "imap.aol.com", port: 993, ssl: true },
};

// Auto-map folder names to standard roles.
const FOLDER_AUTO_MAP: Record<string, string> = {
  "inbox": "inbox",
  "sent": "sent",
  "sent items": "sent",
  "sent mail": "sent",
  "drafts": "drafts",
  "draft": "drafts",
  "trash": "trash",
  "deleted items": "trash",
  "deleted messages": "trash",
  "bin": "trash",
  "junk": "junk",
  "junk mail": "junk",
  "spam": "junk",
  "bulk mail": "junk",
  "archive": "archive",
  "all mail": "archive",
};

export const ImportSettings = React.memo(function ImportSettings() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);

  // Connection form state.
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(true);
  const [providerNote, setProviderNote] = useState<string | null>(null);

  // Connection test state.
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Folder listing state.
  const [folders, setFolders] = useState<IMAPFolder[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Folder mapping state.
  const { sortedMailboxes, findByRole } = useMailboxes();
  const [folderMapping, setFolderMapping] = useState<Record<string, string>>({});

  // Import progress state.
  const [importTaskId, setImportTaskId] = useState<string | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importDetail, setImportDetail] = useState("");
  const [importStatus, setImportStatus] = useState<"running" | "completed" | "failed" | null>(null);

  // Report state.
  const [reportJob, setReportJob] = useState<IMAPImportJob | null>(null);
  const [reportFailures, setReportFailures] = useState<ImportFailure[]>([]);

  // Previous imports.
  const [previousJobs, setPreviousJobs] = useState<IMAPImportJob[]>([]);

  // Load previous imports on mount.
  useEffect(() => {
    listImportJobs().then((data) => setPreviousJobs(data.jobs)).catch(() => {});
  }, []);

  // Auto-detect provider preset from username.
  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    const domain = value.split("@")[1]?.toLowerCase();
    if (domain && PROVIDER_PRESETS[domain]) {
      const preset = PROVIDER_PRESETS[domain];
      setHost(preset.host);
      setPort(preset.port);
      setSsl(preset.ssl);
      setProviderNote(preset.note ?? null);
    } else {
      setProviderNote(null);
    }
  }, []);

  // Test connection.
  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestError(null);
    try {
      const result = await testIMAPConnection({ host, port, username, password, ssl });
      if (result.success) {
        // Load folders and advance to step 2.
        setLoadingFolders(true);
        const folderResult = await listIMAPFolders({ host, port, username, password, ssl });
        setFolders(folderResult.folders);

        // Pre-select standard folders.
        const preSelected = new Set<string>();
        for (const f of folderResult.folders) {
          if (f.noSelect || f.messageCount === 0) continue;
          const lower = f.name.toLowerCase();
          const baseName = lower.split("/").pop() ?? lower;
          if (FOLDER_AUTO_MAP[baseName]) {
            preSelected.add(f.name);
          }
        }
        setSelectedFolders(preSelected);
        setLoadingFolders(false);
        setStep(2);
      } else {
        setTestError(result.error ?? t("import.connectionFailed"));
      }
    } catch {
      setTestError(t("import.connectionFailed"));
    } finally {
      setTesting(false);
    }
  }, [host, port, username, password, ssl, t]);

  // Auto-map folders to mailboxes.
  useEffect(() => {
    if (step !== 3 || sortedMailboxes.length === 0) return;

    const mapping: Record<string, string> = {};
    for (const folderName of selectedFolders) {
      const lower = folderName.toLowerCase();
      const baseName = lower.split("/").pop() ?? lower;
      const role = FOLDER_AUTO_MAP[baseName];
      if (role) {
        const mailbox = findByRole(role as Parameters<typeof findByRole>[0]);
        if (mailbox) {
          mapping[folderName] = mailbox.id;
          continue;
        }
      }
      // Default to inbox.
      const inbox = findByRole("inbox");
      if (inbox) {
        mapping[folderName] = inbox.id;
      }
    }
    setFolderMapping(mapping);
  }, [step, selectedFolders, sortedMailboxes, findByRole]);

  // Listen for import progress via WebSocket.
  const handleTaskProgress = useCallback((event: TaskProgressEvent) => {
    if (event.taskType !== "imap-import" || event.taskId !== importTaskId) return;
    setImportProgress(event.progress);
    setImportDetail(event.detail);
    if (event.status === "completed" || event.status === "failed") {
      setImportStatus(event.status as "completed" | "failed");
      // Load the report.
      if (importJobId) {
        getImportJob(importJobId).then((data) => {
          setReportJob(data.job);
          setReportFailures(data.failures);
          setStep(5);
        }).catch(() => setStep(5));
      }
      // Refresh previous jobs list.
      listImportJobs().then((data) => setPreviousJobs(data.jobs)).catch(() => {});
    }
  }, [importTaskId, importJobId]);

  useTaskProgress(handleTaskProgress);

  // Start import.
  const handleStartImport = useCallback(async () => {
    const importFolders = Array.from(selectedFolders).map((name) => {
      const folder = folders.find((f) => f.name === name);
      return {
        sourceFolder: name,
        targetMailboxId: folderMapping[name] ?? "",
        totalMessages: folder?.messageCount ?? 0,
      };
    }).filter((f) => f.targetMailboxId);

    try {
      const result = await startIMAPImport({
        host, port, username, password, ssl,
        folders: importFolders,
      });
      setImportTaskId(result.taskId);
      setImportJobId(result.jobId);
      setImportProgress(0);
      setImportDetail(t("import.starting"));
      setImportStatus("running");
      setStep(4);
    } catch {
      setTestError(t("import.startFailed"));
    }
  }, [selectedFolders, folders, folderMapping, host, port, username, password, ssl, t]);

  // Reset wizard for another import.
  const handleImportAgain = useCallback(() => {
    setStep(1);
    setHost("");
    setPort(993);
    setUsername("");
    setPassword("");
    setSsl(true);
    setProviderNote(null);
    setTestError(null);
    setFolders([]);
    setSelectedFolders(new Set());
    setFolderMapping({});
    setImportTaskId(null);
    setImportJobId(null);
    setImportProgress(0);
    setImportDetail("");
    setImportStatus(null);
    setReportJob(null);
    setReportFailures([]);
    // Refresh previous jobs.
    listImportJobs().then((data) => setPreviousJobs(data.jobs)).catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-primary">{t("import.title")}</h2>
        <p className="text-sm text-secondary mt-1">{t("import.description")}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3, 4, 5].map((s) => (
          <React.Fragment key={s}>
            {s > 1 && <div className="w-8 h-px" style={{ backgroundColor: s <= step ? "var(--color-bg-accent)" : "var(--color-border-secondary)" }} />}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
              style={{
                backgroundColor: s === step ? "var(--color-bg-accent)" : s < step ? "var(--color-text-success, #22c55e)" : "var(--color-bg-tertiary)",
                color: s <= step ? "#fff" : "var(--color-text-tertiary)",
              }}
            >
              {s < step ? <CheckCircle size={14} /> : s}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Connection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">{t("import.username")}</label>
              <input
                type="email"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2 rounded-md border text-sm bg-primary text-primary border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">{t("import.password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("import.passwordPlaceholder")}
                className="w-full px-3 py-2 rounded-md border text-sm bg-primary text-primary border-primary"
              />
            </div>
            {providerNote && (
              <p className="text-xs text-warning" style={{ color: "var(--color-text-warning, #f59e0b)" }}>
                {t(providerNote)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">{t("import.host")}</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="imap.example.com"
                  className="w-full px-3 py-2 rounded-md border text-sm bg-primary text-primary border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">{t("import.port")}</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 993)}
                  className="w-full px-3 py-2 rounded-md border text-sm bg-primary text-primary border-primary"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={ssl}
                onChange={(e) => {
                  setSsl(e.target.checked);
                  setPort(e.target.checked ? 993 : 143);
                }}
                className="rounded"
              />
              {t("import.useSSL")}
            </label>
          </div>

          {testError && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md" style={{ backgroundColor: "var(--color-bg-danger, rgba(239,68,68,0.1))", color: "var(--color-text-error, #ef4444)" }}>
              <AlertCircle size={14} />
              {testError}
            </div>
          )}

          <button
            onClick={handleTestConnection}
            disabled={testing || !host || !username || !password}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "#fff",
              opacity: testing || !host || !username || !password ? 0.5 : 1,
            }}
          >
            {testing ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {t("import.testing")}
              </span>
            ) : (
              t("import.testConnection")
            )}
          </button>
        </div>
      )}

      {/* Step 2: Folder Selection */}
      {step === 2 && (
        <div className="space-y-4">
          {loadingFolders ? (
            <div className="flex items-center gap-2 text-sm text-secondary">
              <Loader2 size={14} className="animate-spin" />
              {t("import.loadingFolders")}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedFolders(new Set(folders.filter((f) => !f.noSelect && f.messageCount > 0).map((f) => f.name)))} className="text-xs px-2 py-1 rounded border border-primary text-secondary hover:bg-[var(--color-bg-tertiary)]">
                  {t("import.selectAll")}
                </button>
                <button onClick={() => setSelectedFolders(new Set())} className="text-xs px-2 py-1 rounded border border-primary text-secondary hover:bg-[var(--color-bg-tertiary)]">
                  {t("import.deselectAll")}
                </button>
              </div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto" style={{ borderRadius: "6px", border: "1px solid var(--color-border-secondary)", padding: "8px" }}>
                {folders.map((folder) => {
                  const disabled = folder.noSelect || folder.messageCount === 0;
                  return (
                    <label
                      key={folder.name}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-[var(--color-bg-tertiary)] ${disabled ? "opacity-40 pointer-events-none" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFolders.has(folder.name)}
                        onChange={(e) => {
                          const next = new Set(selectedFolders);
                          if (e.target.checked) next.add(folder.name);
                          else next.delete(folder.name);
                          setSelectedFolders(next);
                        }}
                        disabled={disabled}
                        className="rounded"
                      />
                      <span className="flex-1 text-primary">{folder.name}</span>
                      <span className="text-xs text-tertiary">{folder.messageCount} {t("import.messages")}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="px-3 py-2 rounded-md text-sm border border-primary text-secondary hover:bg-[var(--color-bg-tertiary)]">
                  <ArrowLeft size={14} className="inline mr-1" />
                  {t("import.back")}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedFolders.size === 0}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--color-bg-accent)",
                    color: "#fff",
                    opacity: selectedFolders.size === 0 ? 0.5 : 1,
                  }}
                >
                  {t("import.next")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Folder Mapping */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {Array.from(selectedFolders).map((folderName) => (
              <div key={folderName} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-primary font-medium truncate">{folderName}</span>
                <ChevronRight size={14} className="text-tertiary shrink-0" />
                <select
                  value={folderMapping[folderName] ?? ""}
                  onChange={(e) => setFolderMapping((prev) => ({ ...prev, [folderName]: e.target.value }))}
                  className="px-2 py-1.5 rounded-md border text-sm bg-primary text-primary border-primary min-w-[180px]"
                >
                  <option value="">{t("import.selectMailbox")}</option>
                  {sortedMailboxes.map((mb) => (
                    <option key={mb.id} value={mb.id}>{mb.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-3 py-2 rounded-md text-sm border border-primary text-secondary hover:bg-[var(--color-bg-tertiary)]">
              <ArrowLeft size={14} className="inline mr-1" />
              {t("import.back")}
            </button>
            <button
              onClick={handleStartImport}
              disabled={Array.from(selectedFolders).some((f) => !folderMapping[f])}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-accent)",
                color: "#fff",
                opacity: Array.from(selectedFolders).some((f) => !folderMapping[f]) ? 0.5 : 1,
              }}
            >
              {t("import.startImport")}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Progress */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {importStatus === "running" ? (
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--color-text-accent)" }} />
              ) : importStatus === "completed" ? (
                <CheckCircle size={16} style={{ color: "var(--color-text-success, #22c55e)" }} />
              ) : (
                <AlertCircle size={16} style={{ color: "var(--color-text-error, #ef4444)" }} />
              )}
              <span className="text-primary font-medium">{importDetail || t("import.importing")}</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-bg-tertiary)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(importProgress * 100)}%`,
                  backgroundColor: importStatus === "failed" ? "var(--color-text-error, #ef4444)" : "var(--color-bg-accent)",
                }}
              />
            </div>
            <p className="text-xs text-tertiary">{Math.round(importProgress * 100)}%</p>
          </div>
        </div>
      )}

      {/* Step 5: Report */}
      {step === 5 && reportJob && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {reportJob.status === "completed" ? (
              <CheckCircle size={18} style={{ color: "var(--color-text-success, #22c55e)" }} />
            ) : (
              <AlertCircle size={18} style={{ color: "var(--color-text-error, #ef4444)" }} />
            )}
            <span className="text-primary font-semibold">{t("import.importComplete")}</span>
          </div>

          {/* Summary counters */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="px-3 py-2 rounded-md" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
              <div className="text-lg font-semibold text-primary">{reportJob.importedCount}</div>
              <div className="text-xs text-secondary">{t("import.imported")}</div>
            </div>
            <div className="px-3 py-2 rounded-md" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
              <div className="text-lg font-semibold text-primary">{reportJob.skippedCount}</div>
              <div className="text-xs text-secondary">{t("import.skipped")}</div>
            </div>
            <div className="px-3 py-2 rounded-md" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
              <div className="text-lg font-semibold text-primary">{reportJob.failedCount}</div>
              <div className="text-xs text-secondary">{t("import.failed")}</div>
            </div>
          </div>

          {/* Per-folder breakdown */}
          <FolderBreakdown folderConfig={reportJob.folderConfig} />

          {/* Failure details */}
          {reportFailures.length > 0 && (
            <FailureList failures={reportFailures} />
          )}

          <button
            onClick={handleImportAgain}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: "var(--color-bg-accent)", color: "#fff" }}
          >
            {t("import.importAgain")}
          </button>
        </div>
      )}

      {/* Previous imports */}
      {previousJobs.length > 0 && step !== 4 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-primary mb-3">{t("import.previousImports")}</h3>
          <div className="space-y-2">
            {previousJobs.map((job) => (
              <PreviousJobRow key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const FolderBreakdown = React.memo(function FolderBreakdown({ folderConfig }: { folderConfig: FolderProgress[] }) {
  const { t } = useTranslation();
  if (!folderConfig || folderConfig.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-secondary uppercase">{t("import.perFolder")}</h4>
      {folderConfig.map((fc) => (
        <div key={fc.sourceFolder} className="flex items-center justify-between text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
          <span className="text-primary font-medium truncate">{fc.sourceFolder}</span>
          <span className="text-secondary shrink-0 ml-2">
            {fc.importedCount}/{fc.totalMessages}
            {fc.skippedCount > 0 && `, ${fc.skippedCount} ${t("import.skipped").toLowerCase()}`}
            {fc.failedCount > 0 && `, ${fc.failedCount} ${t("import.failed").toLowerCase()}`}
          </span>
        </div>
      ))}
    </div>
  );
});

const FailureList = React.memo(function FailureList({ failures }: { failures: ImportFailure[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? failures : failures.slice(0, 5);

  return (
    <div className="space-y-1">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs font-semibold text-secondary uppercase cursor-pointer">
        <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        {t("import.failures")} ({failures.length})
      </button>
      {shown.map((f) => (
        <div key={f.id} className="text-xs px-2 py-1 rounded flex items-center gap-2" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
          <span className="pill pill--warning text-[10px] px-1.5 py-0.5 rounded">{f.reason}</span>
          <span className="text-secondary truncate">{f.folder}{f.messageId ? ` — ${f.messageId}` : ""}</span>
          {f.detail && <span className="text-tertiary truncate">{f.detail}</span>}
        </div>
      ))}
      {!expanded && failures.length > 5 && (
        <button onClick={() => setExpanded(true)} className="text-xs text-accent cursor-pointer" style={{ color: "var(--color-text-accent)" }}>
          {t("import.showMore", { count: failures.length - 5 })}
        </button>
      )}
    </div>
  );
});

const PreviousJobRow = React.memo(function PreviousJobRow({ job }: { job: IMAPImportJob }) {
  const statusColor = job.status === "completed"
    ? "var(--color-text-success, #22c55e)"
    : job.status === "failed"
      ? "var(--color-text-error, #ef4444)"
      : "var(--color-text-accent)";

  return (
    <div className="flex items-center gap-3 text-sm px-3 py-2 rounded-md" style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-primary truncate">{job.imapUser}@{job.imapHost}</div>
        <div className="text-xs text-secondary">
          {job.importedCount} imported, {job.skippedCount} skipped, {job.failedCount} failed
        </div>
      </div>
      <div className="text-xs text-tertiary shrink-0">
        {new Date(job.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
});
