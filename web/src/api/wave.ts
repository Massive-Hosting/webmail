/** Wave call room API for guest/external calls */

import { apiPost } from "./client.ts";

export interface CallRoom {
  id: string;
  host_email: string;
  host_name: string;
  guest_email: string;
  guest_name: string;
  video: boolean;
}

export interface CreateRoomResponse {
  room: CallRoom;
  join_url: string;
}

/** Create a call room for an external guest and get the join URL */
export async function createCallRoom(params: {
  guest_email: string;
  guest_name: string;
  host_name: string;
  video: boolean;
}): Promise<CreateRoomResponse> {
  return apiPost<CreateRoomResponse>("/api/call-rooms", params);
}
