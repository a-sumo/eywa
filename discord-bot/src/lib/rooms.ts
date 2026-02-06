import { db, type Room } from "./db.js";

export interface RoomInfo {
  id: string;
  slug: string;
  name: string;
}

// Channel ID → Room binding (in-memory, resets on restart)
const channelRooms = new Map<string, RoomInfo>();

const DEFAULT_ROOM = process.env.DEFAULT_ROOM ?? "demo";

/**
 * Resolve the room for a Discord channel.
 * Falls back to DEFAULT_ROOM if no explicit binding exists.
 */
export async function resolveRoom(
  channelId: string,
): Promise<RoomInfo | null> {
  if (channelRooms.has(channelId)) {
    return channelRooms.get(channelId)!;
  }
  return bindRoom(channelId, DEFAULT_ROOM);
}

/**
 * Bind a Discord channel to a Eywa room by slug.
 * Returns null if the room doesn't exist.
 */
export async function bindRoom(
  channelId: string,
  slug: string,
): Promise<RoomInfo | null> {
  const { data, error } = await db()
    .from("rooms")
    .select("id,slug,name")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  const room: RoomInfo = { id: data.id, slug: data.slug, name: data.name };
  channelRooms.set(channelId, room);
  return room;
}

/** List all available rooms. */
export async function listRooms(): Promise<Room[]> {
  const { data } = await db()
    .from("rooms")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Room[]) ?? [];
}

/** Get current binding for a channel (without fallback). */
export function currentBinding(channelId: string): RoomInfo | undefined {
  return channelRooms.get(channelId);
}
