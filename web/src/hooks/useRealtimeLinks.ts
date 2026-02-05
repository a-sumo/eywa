import { useEffect, useState, useCallback } from "react";
import { supabase, type Link } from "../lib/supabase";

export function useRealtimeLinks(roomId: string | null) {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInitial = useCallback(async () => {
    if (!roomId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("links")
      .select("*")
      .eq("room_id", roomId)
      .order("ts", { ascending: false })
      .limit(200);
    if (data) setLinks(data);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchInitial();

    if (!roomId) return;

    const channel = supabase
      .channel(`links-realtime-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "links", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setLinks((prev) => [payload.new as Link, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "links", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setLinks((prev) => prev.filter((l) => l.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitial, roomId]);

  return { links, loading, refresh: fetchInitial };
}
