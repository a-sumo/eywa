/**
 * Spectacles API helpers
 *
 * For the hackathon demo, we use:
 * - Supabase Storage for frames (or a simple blob URL)
 * - Supabase Realtime for interaction events
 *
 * In production, you'd use Cloudflare R2 + Workers for lower latency.
 */

import { supabase } from "./supabase";

const FRAME_BUCKET = "spectacles-frames";

/**
 * Upload a frame to Supabase Storage
 */
export async function uploadFrame(roomSlug: string, blob: Blob): Promise<string | null> {
  const fileName = `${roomSlug}/frame.jpg`;

  const { error } = await supabase.storage
    .from(FRAME_BUCKET)
    .upload(fileName, blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "0", // No caching - always get latest
    });

  if (error) {
    console.error("Failed to upload frame:", error);
    return null;
  }

  const { data } = supabase.storage
    .from(FRAME_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}

/**
 * Get the latest frame URL
 */
export function getFrameUrl(roomSlug: string): string {
  const { data } = supabase.storage
    .from(FRAME_BUCKET)
    .getPublicUrl(`${roomSlug}/frame.jpg`);

  // Add cache-busting timestamp
  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Send an interaction event via Supabase Realtime
 */
export async function sendInteraction(
  roomSlug: string,
  type: "pointer_move" | "pointer_down" | "pointer_up" | "drag" | "drop",
  uv: [number, number],
  itemId?: string
): Promise<void> {
  const channel = supabase.channel(`spectacles:${roomSlug}`);

  await channel.send({
    type: "broadcast",
    event: "interaction",
    payload: {
      type,
      uv,
      itemId,
      timestamp: Date.now(),
    },
  });
}

/**
 * Subscribe to interaction events
 */
export function subscribeToInteractions(
  roomSlug: string,
  callback: (event: {
    type: "pointer_move" | "pointer_down" | "pointer_up" | "drag" | "drop";
    uv: [number, number];
    itemId?: string;
  }) => void
): () => void {
  const channel = supabase.channel(`spectacles:${roomSlug}`);

  channel
    .on("broadcast", { event: "interaction" }, ({ payload }) => {
      callback(payload);
    })
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

/**
 * For local development without Supabase Storage,
 * use a simple in-memory frame buffer via BroadcastChannel
 */
const localFrameChannel = new BroadcastChannel("spectacles-frames");
let latestLocalFrame: string | null = null;

export function uploadFrameLocal(roomSlug: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);

  // Revoke previous URL to avoid memory leaks
  if (latestLocalFrame) {
    URL.revokeObjectURL(latestLocalFrame);
  }
  latestLocalFrame = url;

  // Broadcast to other tabs
  localFrameChannel.postMessage({ roomSlug, url });

  return url;
}

export function getFrameUrlLocal(): string | null {
  return latestLocalFrame;
}

export function subscribeToFramesLocal(
  callback: (url: string) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data.url) {
      callback(event.data.url);
    }
  };

  localFrameChannel.addEventListener("message", handler);
  return () => localFrameChannel.removeEventListener("message", handler);
}
