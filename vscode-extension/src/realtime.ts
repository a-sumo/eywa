/**
 * Supabase Realtime channel wrapper for the Eywa VS Code extension.
 * Subscribes to postgres_changes on the memories table and fans out
 * INSERT events to registered listeners (activity feed, agent tree, etc.).
 */
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

/** Row shape pushed by Supabase Realtime on memories INSERT. */
export type MemoryPayload = {
  id: string;
  agent: string;
  session_id: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
  message_type: string;
  fold_id: string;
};

export type RealtimeListener = (memory: MemoryPayload) => void;

/**
 * Manages a single Supabase Realtime channel scoped to a fold.
 * Call {@link subscribe} to connect, {@link on} to register listeners,
 * and {@link unsubscribe} to tear down.
 */
export class RealtimeManager {
  private channel: RealtimeChannel | null = null;
  private listeners: RealtimeListener[] = [];

  /** Subscribe to memory INSERTs for the given fold. Cleans up any prior subscription. */
  subscribe(
    supabase: SupabaseClient,
    foldId: string,
  ): void {
    this.unsubscribe(supabase);

    this.channel = supabase
      .channel(`vscode-memories-${foldId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "memories",
          filter: `fold_id=eq.${foldId}`,
        },
        (payload) => {
          const mem = payload.new as MemoryPayload;
          for (const fn of this.listeners) {
            fn(mem);
          }
        },
      )
      .subscribe();
  }

  /** Remove the active channel. Safe to call when already unsubscribed. */
  unsubscribe(supabase: SupabaseClient): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /** Register a listener. Returns an unsubscribe function. */
  on(fn: RealtimeListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}
