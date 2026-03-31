/** Free/busy availability and tenant directory APIs */

import { apiPost, apiGet } from "./client.ts";

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

// --- Absence Check ---

export interface AbsenceInfo {
  absent: boolean;
  subject?: string;
  until?: string;
}

export async function checkAbsence(email: string): Promise<AbsenceInfo> {
  return apiPost<AbsenceInfo>("/api/absence-check", { email });
}

// --- Team Availability ---

export interface TeamMember {
  email: string;
  name: string;
  busySlots: BusySlot[];
}

export async function fetchTeamAvailability(
  start: string,
  end: string,
): Promise<TeamMember[]> {
  const result = await apiPost<{ members: TeamMember[] }>("/api/availability/team", { start, end });
  return result.members ?? [];
}

// --- Resources ---

export interface Resource {
  email: string;
  name: string;
  description: string;
}

export async function listResources(): Promise<Resource[]> {
  return apiGet<Resource[]>("/api/resources");
}
