/** Free/busy availability and tenant directory APIs */

import { apiPost, apiGet, apiPut } from "./client.ts";

// --- Free/Busy ---

export interface BusySlot {
  start: string;
  duration: string;
}

export async function fetchAvailability(
  email: string,
  start: string,
  end: string,
): Promise<BusySlot[]> {
  const result = await apiPost<{ busySlots: BusySlot[] }>("/api/availability", { email, start, end });
  return result.busySlots ?? [];
}

// --- Directory ---

export interface DirectoryEntry {
  email: string;
  name: string;
}

export async function searchDirectory(query: string, limit = 10): Promise<DirectoryEntry[]> {
  return apiPost<DirectoryEntry[]>("/api/directory/search", { query, limit });
}

// --- Domain Settings ---

export interface DomainSettings {
  domain: string;
  freebusyEnabled: boolean;
  directoryEnabled: boolean;
}

export async function getDomainSettings(): Promise<DomainSettings> {
  return apiGet<DomainSettings>("/api/domain-settings");
}

export async function updateDomainSettings(settings: Partial<DomainSettings>): Promise<void> {
  return apiPut("/api/domain-settings", settings);
}
