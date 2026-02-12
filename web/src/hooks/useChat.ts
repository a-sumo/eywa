import { useEffect, useState, useCallback } from "react";
import { supabase, type Message } from "../lib/supabase";

export function useChat(roomId: string | null, channel = "general") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("messages")
      .select("*")
      .eq("room_id", roomId)
      .eq("channel", channel)
      .order("ts", { ascending: true })
      .limit(200);
    if (queryError) {
      setError(queryError.message);
    } else {
      setError(null);
      if (data) setMessages(data);
    }
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
          filter: `room_id=eq.${roomId}`,
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
      const { error: insertError } = await supabase.from("messages").insert({
        room_id: roomId,
        sender,
        channel,
        content,
      });
      if (insertError) {
        setError(insertError.message);
      }
    },
    [roomId, channel]
  );

  return { messages, loading, error, send };
}
