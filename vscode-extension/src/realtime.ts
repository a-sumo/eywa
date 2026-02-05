import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export type MemoryPayload = {
  id: string;
  agent: string;
  session_id: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
  message_type: string;
  room_id: string;
};

export type RealtimeListener = (memory: MemoryPayload) => void;

export class RealtimeManager {
  private channel: RealtimeChannel | null = null;
  private listeners: RealtimeListener[] = [];

  subscribe(
    supabase: SupabaseClient,
    roomId: string,
  ): void {
    this.unsubscribe(supabase);

    this.channel = supabase
      .channel(`vscode-memories-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "memories",
          filter: `room_id=eq.${roomId}`,
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

  unsubscribe(supabase: SupabaseClient): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  on(fn: RealtimeListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}
