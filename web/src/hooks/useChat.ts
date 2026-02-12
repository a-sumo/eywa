import { useEffect, useState, useCallback } from "react";
import { supabase, type Message } from "../lib/supabase";

export function useChat(foldId: string | null, channel = "general") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!foldId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("messages")
      .select("*")
      .eq("fold_id", foldId)
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
  }, [foldId, channel]);

  useEffect(() => {
    fetchInitial();

    if (!foldId) return;

    const sub = supabase
      .channel(`chat-${foldId}-${channel}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `fold_id=eq.${foldId}`,
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
  }, [fetchInitial, foldId, channel]);

  const send = useCallback(
    async (sender: string, content: string) => {
      if (!foldId) return;
      const { error: insertError } = await supabase.from("messages").insert({
        fold_id: foldId,
        sender,
        channel,
        content,
      });
      if (insertError) {
        setError(insertError.message);
      }
    },
    [foldId, channel]
  );

  return { messages, loading, error, send };
}
