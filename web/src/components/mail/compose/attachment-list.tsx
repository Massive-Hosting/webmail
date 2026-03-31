/** Attachment list for compose with upload, progress, and drag-drop */

import React, { useCallback, useRef, useState } from "react";
import {
  Paperclip,
  X,
  FileText,
  File,
  FileImage,
  FileArchive,
  Upload,
  Check,
  AlertCircle,
} from "lucide-react";
import { formatFileSize } from "@/lib/format.ts";
import { useComposeStore, type AttachmentState } from "@/stores/compose-store.ts";
import { toast } from "sonner";

import i18n from "@/i18n/index.ts";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 3;

interface AttachmentListProps {
  draftId: string;
  attachments: AttachmentState[];
}

/** Upload a file to the blob endpoint */
async function uploadBlob(
  file: File,
  draftId: string,
  attachmentId: string,
  abortController: AbortController,
): Promise<string | null> {
  const { updateAttachment } = useComposeStore.getState();

  try {
    const xhr = new XMLHttpRequest();
    const blobIdPromise = new Promise<string | null>((resolve, reject) => {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          updateAttachment(draftId, attachmentId, { progress });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            // Backend returns array [{blobId, type, size}] or object {blobId}
            const blobId = Array.isArray(result) ? result[0]?.blobId : result.blobId;
            resolve(blobId ?? null);
          } catch {
            resolve(null);
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => resolve(null));

      abortController.signal.addEventListener("abort", () => xhr.abort());
    });

    xhr.open("POST", "/api/blob/upload");
    xhr.withCredentials = true;
    const formData = new FormData();
    formData.append("file", file, file.name);
    xhr.send(formData);

    return await blobIdPromise;
  } catch (err) {
    if (abortController.signal.aborted) return null;
    throw err;
  }
}

/** Upload queue to limit concurrent uploads */
let activeUploads = 0;
const uploadQueue: Array<() => void> = [];

function enqueueUpload(fn: () => Promise<void>) {
  const run = async () => {
    activeUploads++;
    try {
      await fn();
    } finally {
      activeUploads--;
      const next = uploadQueue.shift();
      if (next) next();
    }
  };

  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    run();
  } else {
    uploadQueue.push(() => { run(); });
  }
}

export function useAttachmentUpload(draftId: string) {
  const addAttachment = useComposeStore((s) => s.addAttachment);
  const updateAttachment = useComposeStore((s) => s.updateAttachment);
  const getDraft = useComposeStore((s) => s.getDraft);

  const uploadFiles = useCallback(
    (files: FileList | File[]) => {
      const draft = getDraft(draftId);
      if (!draft) return;

      const currentTotalSize = draft.attachments.reduce((sum, a) => sum + a.size, 0);
      let runningTotal = currentTotalSize;

      for (const file of Array.from(files)) {
        // Per-file size check
        if (file.size > MAX_FILE_SIZE) {
          toast.error(i18n.t("attachment.exceedsFileSize", { name: file.name }));
          continue;
        }

        // Total size check
        if (runningTotal + file.size > MAX_TOTAL_SIZE) {
          toast.error(i18n.t("attachment.exceedsTotalSize"));
          break;
        }

        runningTotal += file.size;
        const abortController = new AbortController();
        const attachmentId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const attachment: AttachmentState = {
          id: attachmentId,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          progress: 0,
          status: "uploading",
          abortController,
          file,
        };

        addAttachment(draftId, attachment);

        enqueueUpload(async () => {
          try {
            const blobId = await uploadBlob(file, draftId, attachmentId, abortController);
            if (blobId) {
              updateAttachment(draftId, attachmentId, {
                blobId,
                progress: 100,
                status: "complete",
              });
            }
          } catch {
            updateAttachment(draftId, attachmentId, {
              status: "error",
              progress: 0,
            });
            toast.error(i18n.t("attachment.failedToUpload", { name: file.name }));
          }
        });
      }
    },
    [draftId, addAttachment, updateAttachment, getDraft],
  );

  return { uploadFiles };
}

export const AttachmentList = React.memo(function AttachmentList({
  draftId,
  attachments,
}: AttachmentListProps) {
  const removeAttachment = useComposeStore((s) => s.removeAttachment);
  if (attachments.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderTop: "1px solid var(--color-border-secondary)",
      }}
    >
      <Paperclip
        size={14}
        style={{ color: "var(--color-text-tertiary)" }}
        className="shrink-0"
      />
      {attachments.map((att) => (
        <AttachmentChip
          key={att.id}
          attachment={att}
          onRemove={() => removeAttachment(draftId, att.id)}
        />
      ))}
    </div>
  );
});

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AttachmentState;
  onRemove: () => void;
}) {
  const icon = getFileIcon(attachment.type);
  const isUploading = attachment.status === "uploading";
  const isError = attachment.status === "error";

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs shrink-0 relative overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        color: "var(--color-text-primary)",
        border: isError
          ? "1px solid var(--color-border-error, #fca5a5)"
          : "1px solid var(--color-border-primary)",
      }}
    >
      {/* Upload progress bar */}
      {isUploading && (
        <div
          className="absolute bottom-0 left-0 h-0.5 transition-all duration-200"
          style={{
            width: `${attachment.progress}%`,
            backgroundColor: "var(--color-bg-accent)",
          }}
        />
      )}
      {icon}
      <span className="max-w-[120px] truncate">{attachment.name}</span>
      <span style={{ color: "var(--color-text-tertiary)" }}>
        {formatFileSize(attachment.size)}
      </span>
      {isUploading && (
        <span style={{ color: "var(--color-text-tertiary)" }}>
          {attachment.progress}%
        </span>
      )}
      {attachment.status === "complete" && (
        <Check size={12} style={{ color: "var(--color-text-success, #16a34a)" }} />
      )}
      {isError && (
        <AlertCircle size={12} style={{ color: "var(--color-text-error, #dc2626)" }} />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 hover:opacity-70 ml-0.5"
        style={{ color: "var(--color-text-tertiary)" }}
        title={i18n.t("attachment.removeAttachment")}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith("image/")) return <FileImage size={14} />;
  if (mimeType.includes("pdf")) return <FileText size={14} />;
  if (mimeType.includes("zip") || mimeType.includes("archive"))
    return <FileArchive size={14} />;
  return <File size={14} />;
}

/** Drop zone overlay for drag-and-drop */
export function DragDropZone({
  draftId,
  children,
}: {
  draftId: string;
  children: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);
  const { uploadFiles } = useAttachmentUpload(draftId);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      dragCountRef.current = 0;
      setIsDragging(false);

      // If the native event was already handled (e.g. by the editor's inline
      // image drop handler), don't also attach the files.
      if (e.defaultPrevented) return;

      e.preventDefault();

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadFiles(files);
      }
    },
    [uploadFiles],
  );

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center rounded"
          style={{
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            border: "2px dashed var(--color-bg-accent, #2563eb)",
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <Upload size={32} style={{ color: "var(--color-bg-accent, #2563eb)" }} />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--color-bg-accent, #2563eb)" }}
            >
              {i18n.t("attachment.dropToAttach")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
