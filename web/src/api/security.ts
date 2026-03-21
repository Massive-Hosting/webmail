/** Security API: TOTP 2FA and App Passwords */

import { apiGet, apiPost, apiDelete } from "./client.ts";

// --- TOTP ---

export interface TOTPStatus {
  enabled: boolean;
}

export interface TOTPSetupResponse {
  secret: string;
  url: string;
}

export async function getTOTPStatus(): Promise<TOTPStatus> {
  return apiGet<TOTPStatus>("/api/security/totp/status");
}

export async function setupTOTP(): Promise<TOTPSetupResponse> {
  return apiPost<TOTPSetupResponse>("/api/security/totp/setup");
}

export async function confirmTOTP(code: string): Promise<void> {
  return apiPost("/api/security/totp/confirm", { code });
}

export async function disableTOTP(): Promise<void> {
  return apiDelete("/api/security/totp");
}

// --- App Passwords ---

export interface AppPassword {
  id: string;
  name: string;
  createdAt: string;
}

export interface AppPasswordCreateResponse {
  id: string;
  name: string;
  password: string;
}

export async function listAppPasswords(): Promise<AppPassword[]> {
  return apiGet<AppPassword[]>("/api/security/app-passwords");
}

export async function createAppPassword(name: string): Promise<AppPasswordCreateResponse> {
  return apiPost<AppPasswordCreateResponse>("/api/security/app-passwords", { name });
}

export async function deleteAppPassword(id: string): Promise<void> {
  return apiDelete(`/api/security/app-passwords/${encodeURIComponent(id)}`);
}
