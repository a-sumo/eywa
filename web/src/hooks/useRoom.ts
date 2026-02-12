import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Room } from "../lib/supabase";

function generateSlug(): string {
  const adjectives = ["cosmic", "lunar", "solar", "stellar", "quantum", "neural", "cyber", "astral"];
  const nouns = ["fox", "owl", "wolf", "hawk", "bear", "lynx", "raven", "phoenix"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const code = Math.random().toString(36).substring(2, 6);
  return `${adj}-${noun}-${code}`;
}

function generateRoomName(slug: string): string {
  const words = slug.split("-").slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function useRoom() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(async (createdBy?: string): Promise<Room | null> => {
    setCreating(true);
    setError(null);

    const slug = generateSlug();
    const name = generateRoomName(slug);

    const { data, error: insertError } = await supabase
      .from("rooms")
      .insert({
        slug,
        name,
        created_by: createdBy || null,
        is_demo: false,
      })
      .select()
      .single();

    setCreating(false);

    if (insertError || !data) {
      setError(insertError?.message
        ? `Could not create room: ${insertError.message}`
        : "Could not create room. Check your connection and try again.");
      return null;
    }

    navigate(`/r/${slug}`);
    return data;
  }, [navigate]);

  const createDemoRoom = useCallback(async (): Promise<Room | null> => {
    setCreating(true);
    setError(null);

    const slug = "demo-" + Math.random().toString(36).substring(2, 6);

    try {
      // Worker creates the room and seeds it with demo data (needs service key for RLS)
      const res = await fetch("https://mcp.eywa-ai.dev/clone-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }

      const result = await res.json() as { id: string; slug: string; seeded: number };

      // Fetch the full room record
      const { data } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", result.id)
        .single();

      setCreating(false);
      navigate(`/r/${slug}`);
      return data;
    } catch (err) {
      console.warn("Create demo failed:", err);
      setCreating(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch")) {
        setError("Could not reach the server. Check your connection and try again.");
      } else if (msg.includes("HTTP 5")) {
        setError("The server ran into a problem creating the demo. Try again in a moment.");
      } else {
        setError(`Failed to create demo room: ${msg}`);
      }
      return null;
    }
  }, [navigate]);

  const joinRoom = useCallback(async (slug: string): Promise<Room | null> => {
    const { data, error: fetchError } = await supabase
      .from("rooms")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !data) {
      setError("Room not found");
      return null;
    }

    navigate(`/r/${slug}`);
    return data;
  }, [navigate]);

  const getShareUrl = useCallback((slug: string): string => {
    const base = window.location.origin;
    return `${base}/r/${slug}`;
  }, []);

  return {
    createRoom,
    createDemoRoom,
    joinRoom,
    getShareUrl,
    creating,
    error,
  };
}
