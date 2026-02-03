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
      setError("Failed to create room");
      return null;
    }

    navigate(`/r/${slug}`);
    return data;
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
    joinRoom,
    getShareUrl,
    creating,
    error,
  };
}
