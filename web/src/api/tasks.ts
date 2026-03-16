/** Task API client for Temporal workflow operations */

import { apiPost, apiGet } from "./client.ts";

export interface TaskResponse {
  taskId: string;
  status: "running" | "completed" | "failed";
}

export interface TaskStatusResponse {
  taskId: string;
  status: "running" | "completed" | "failed";
}

export async function startBulkMove(params: {
  emailIds: string[];
  fromMailboxId: string;
  toMailboxId: string;
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/bulk-move", params);
}

export async function startBulkDelete(params: {
  emailIds: string[];
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/bulk-delete", params);
}

export async function startBulkMarkRead(params: {
  emailIds: string[];
  markRead: boolean;
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/bulk-mark-read", params);
}

export async function startExportMailbox(params: {
  mailboxId: string;
  format?: "mbox" | "eml-zip";
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/export-mailbox", params);
}

export async function startImportMailbox(params: {
  mailboxId: string;
  blobId: string;
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/import-mailbox", params);
}

export async function startScheduledSend(params: {
  emailId: string;
  identityId: string;
  sendAt: string;
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/schedule-send", params);
}

export async function startSnooze(params: {
  emailId: string;
  mailboxId: string;
  until: string;
}): Promise<TaskResponse> {
  return apiPost<TaskResponse>("/api/tasks/snooze", params);
}

export async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return apiGet<TaskStatusResponse>(`/api/tasks/${encodeURIComponent(taskId)}`);
}

/** Upload an mbox file as a blob and return the blobId */
export async function uploadMboxFile(file: File): Promise<string> {
  const response = await fetch("/api/jmap/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/mbox",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const result = (await response.json()) as { blobId: string };
  return result.blobId;
}
