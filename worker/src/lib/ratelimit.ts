/**
 * Simple in-memory sliding window rate limiter.
 * Counters reset when the worker instance recycles (every few minutes of inactivity).
 * Good enough to prevent burst abuse. For durable limiting, add a KV binding.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Clean up expired entries periodically to prevent memory leak
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000; // 1 minute

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, win] of windows) {
    if (now > win.resetAt) windows.delete(key);
  }
}

/**
 * Check if a request should be allowed.
 * @param key       Unique identifier (e.g. IP + endpoint)
 * @param limit     Max requests per window
 * @param windowMs  Window duration in milliseconds
 * @returns         { allowed, remaining, resetAt }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  let win = windows.get(key);

  if (!win || now > win.resetAt) {
    win = { count: 0, resetAt: now + windowMs };
    windows.set(key, win);
  }

  win.count++;
  const allowed = win.count <= limit;
  const remaining = Math.max(0, limit - win.count);

  return { allowed, remaining, resetAt: win.resetAt };
}

/** Per-fold memory cap check. */
export async function checkMemoryCap(
  db: { count: (table: string, filters: Record<string, string>) => Promise<number> },
  foldId: string,
  cap: number,
): Promise<{ allowed: boolean; current: number }> {
  const current = await db.count("memories", { fold_id: `eq.${foldId}` });
  return { allowed: current < cap, current };
}
