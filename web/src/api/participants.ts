/** Event participants API — stored in webmail DB since Stalwart
 * doesn't return participants via JMAP CalendarEvent/get. */

import { apiGet, apiPost, apiPut, apiDelete } from "./client.ts";

export interface EventParticipant {
  eventId: string;
  email: string;
  name: string;
  role: string; // "attendee" | "owner"
  status: string; // "needs-action" | "accepted" | "declined" | "tentative"
}

export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  return apiGet<EventParticipant[]>(`/api/events/${encodeURIComponent(eventId)}/participants`);
}

export async function getBatchEventParticipants(
  eventIds: string[],
): Promise<Record<string, EventParticipant[]>> {
  return apiPost<Record<string, EventParticipant[]>>("/api/events/participants/batch", { eventIds });
}

export async function saveEventParticipants(
  eventId: string,
  participants: EventParticipant[],
): Promise<void> {
  return apiPut(`/api/events/${encodeURIComponent(eventId)}/participants`, participants);
}

export async function deleteEventParticipants(eventId: string): Promise<void> {
  return apiDelete(`/api/events/${encodeURIComponent(eventId)}/participants`);
}
