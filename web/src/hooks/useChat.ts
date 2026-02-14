import { useEffect, useState, useCallback } from "react";
import { supabase, type Message } from "../lib/supabase";
import { getSnapshot } from "../lib/snapshot";

export function useChat(roomId: string | null, channel = "general") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInitial = useCallback(async () => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    // Try static snapshot first
    const snapshot = await getSnapshot();
    if (snapshot?.messages?.length) {
      const filtered = (snapshot.messages as unknown as Message[]).filter(
        (m) => m.channel === channel
      );
      setMessages(filtered);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("fold_id", roomId)
      .eq("channel", channel)
      .order("ts", { ascending: true })
      .limit(200);
    if (data) setMessages(data);
    setLoading(false);
  }, [roomId, channel]);

  useEffect(() => {
    fetchInitial();

    if (!roomId) return;

    const sub = supabase
      .channel(`chat-${roomId}-${channel}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `fold_id=eq.${roomId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.channel === channel) {
            setMessages((prev) => [...prev, msg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [fetchInitial, roomId, channel]);

  const send = useCallback(
    async (sender: string, content: string) => {
      if (!roomId) return;
      await supabase.from("messages").insert({
        fold_id: roomId,
        sender,
        channel,
        content,
      });
    },
    [roomId, channel]
  );

  return { messages, loading, send };
}
