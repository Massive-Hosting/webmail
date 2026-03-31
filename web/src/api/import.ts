/** IMAP import API client */

import { apiPost, apiGet } from "./client.ts";

export interface IMAPConnectionParams {
  host: string;
  port: number;
  username: string;
  password: string;
  ssl: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  capabilities?: string[];
  error?: string;
}

export interface IMAPFolder {
  name: string;
  delimiter: string;
  messageCount: number;
  flags?: string[];
  noSelect: boolean;
}

export interface ListFoldersResult {
  folders: IMAPFolder[];
}

export interface ImportFolderConfig {
  sourceFolder: string;
  targetMailboxId: string;
  totalMessages: number;
}

export interface StartImportParams extends IMAPConnectionParams {
  folders: ImportFolderConfig[];
}

export interface StartImportResult {
  jobId: string;
  taskId: string;
  status: string;
}

export interface IMAPImportJob {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapSsl: boolean;
  status: string;
  folderConfig: FolderProgress[];
  totalMessages: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface FolderProgress {
  sourceFolder: string;
  targetMailboxId: string;
  totalMessages: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface ImportFailure {
  id: number;
  jobId: string;
  folder: string;
  messageUid?: number;
  messageId?: string;
  reason: string;
  detail?: string;
  createdAt: string;
}

export interface JobDetailResult {
  job: IMAPImportJob;
  failures: ImportFailure[];
}

export function testIMAPConnection(params: IMAPConnectionParams): Promise<TestConnectionResult> {
  return apiPost<TestConnectionResult>("/api/import/test-connection", params);
}

export function listIMAPFolders(params: IMAPConnectionParams): Promise<ListFoldersResult> {
  return apiPost<ListFoldersResult>("/api/import/list-folders", params);
}

export function startIMAPImport(params: StartImportParams): Promise<StartImportResult> {
  return apiPost<StartImportResult>("/api/import/start", params);
}

export function listImportJobs(): Promise<{ jobs: IMAPImportJob[] }> {
  return apiGet<{ jobs: IMAPImportJob[] }>("/api/import/jobs");
}

export function getImportJob(id: string): Promise<JobDetailResult> {
  return apiGet<JobDetailResult>(`/api/import/jobs/${id}`);
}
