// Static snapshot loader for frozen deployments.
// Loads /snapshot.json once, serves data from memory.
// If no snapshot exists, returns null and callers fall back to Supabase.

interface Snapshot {
  fold: Record<string, unknown> | null;
  memories: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  links: Record<string, unknown>[];
  global_insights: Record<string, unknown>[];
}

let data: Snapshot | null = null;
let loaded = false;

export async function getSnapshot(): Promise<Snapshot | null> {
  if (loaded) return data;
  loaded = true;
  try {
    const res = await fetch("/snapshot.json");
    if (res.ok) data = await res.json();
  } catch {
    // No snapshot available, all queries go to Supabase
  }
  return data;
}
