import { useEffect, useState, useCallback } from "react";
import { supabase, type Link } from "../lib/supabase";

export function useRealtimeLinks(foldId: string | null) {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInitial = useCallback(async () => {
    if (!foldId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("links")
      .select("*")
      .eq("room_id", foldId)
      .order("ts", { ascending: false })
      .limit(200);
    if (data) setLinks(data);
    setLoading(false);
  }, [foldId]);

  useEffect(() => {
    fetchInitial();

    if (!foldId) return;

    const channel = supabase
      .channel(`links-realtime-${foldId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "links", filter: `room_id=eq.${foldId}` },
        (payload) => {
          setLinks((prev) => [payload.new as Link, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "links", filter: `room_id=eq.${foldId}` },
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
  }, [fetchInitial, foldId]);

  return { links, loading, refresh: fetchInitial };
}
