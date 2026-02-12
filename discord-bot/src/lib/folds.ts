import { db, type Fold } from "./db.js";

export interface FoldInfo {
  id: string;
  slug: string;
  name: string;
}

// Channel ID → Fold binding (in-memory, resets on restart)
const channelFolds = new Map<string, FoldInfo>();

const DEFAULT_FOLD = process.env.DEFAULT_FOLD ?? "demo";

/**
 * Resolve the fold for a Discord channel.
 * Falls back to DEFAULT_FOLD if no explicit binding exists.
 */
export async function resolveFold(
  channelId: string,
): Promise<FoldInfo | null> {
  if (channelFolds.has(channelId)) {
    return channelFolds.get(channelId)!;
  }
  return bindFold(channelId, DEFAULT_FOLD);
}

/**
 * Bind a Discord channel to a Eywa fold by slug.
 * Returns null if the fold doesn't exist.
 */
export async function bindFold(
  channelId: string,
  slug: string,
): Promise<FoldInfo | null> {
  const { data, error } = await db()
    .from("folds")
    .select("id,slug,name")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  const fold: FoldInfo = { id: data.id, slug: data.slug, name: data.name };
  channelFolds.set(channelId, fold);
  return fold;
}

/** List all available folds. */
export async function listFolds(): Promise<Fold[]> {
  const { data } = await db()
    .from("folds")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Fold[]) ?? [];
}

/** Get current binding for a channel (without fallback). */
export function currentBinding(channelId: string): FoldInfo | undefined {
  return channelFolds.get(channelId);
}
