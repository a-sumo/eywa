import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Fold } from "../lib/supabase";

function generateSlug(): string {
  const adjectives = ["cosmic", "lunar", "solar", "stellar", "quantum", "neural", "cyber", "astral"];
  const nouns = ["fox", "owl", "wolf", "hawk", "bear", "lynx", "raven", "phoenix"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const code = Math.random().toString(36).substring(2, 6);
  return `${adj}-${noun}-${code}`;
}

function generateFoldName(slug: string): string {
  const words = slug.split("-").slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function useFold() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createFold = useCallback(async (createdBy?: string): Promise<Fold | null> => {
    setCreating(true);
    setError(null);

    const slug = generateSlug();
    const name = generateFoldName(slug);

    const { data, error: insertError } = await supabase
      .from("folds")
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
        ? `Could not create fold: ${insertError.message}`
        : "Could not create fold. Check your connection and try again.");
      return null;
    }

    // Store secret in localStorage for sharing
    if (data.secret) {
      try {
        localStorage.setItem(`fold-secret-${slug}`, data.secret);
      } catch {}
    }

    navigate(`/f/${slug}`);
    return data;
  }, [navigate]);

  const createDemoFold = useCallback(async (): Promise<Fold | null> => {
    setCreating(true);
    setError(null);

    const slug = "demo-" + Math.random().toString(36).substring(2, 6);

    try {
      // Worker creates the fold and seeds it with demo data (needs service key for RLS)
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

      // Fetch the full fold record
      const { data } = await supabase
        .from("folds")
        .select("*")
        .eq("id", result.id)
        .single();

      setCreating(false);

      // Store secret in localStorage for sharing
      if (data?.secret) {
        try {
          localStorage.setItem(`fold-secret-${slug}`, data.secret);
        } catch {}
      }

      navigate(`/f/${slug}`);
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
        setError(`Failed to create demo fold: ${msg}`);
      }
      return null;
    }
  }, [navigate]);

  const joinFold = useCallback(async (slug: string): Promise<Fold | null> => {
    const { data, error: fetchError } = await supabase
      .from("folds")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !data) {
      setError("Fold not found");
      return null;
    }

    navigate(`/f/${slug}`);
    return data;
  }, [navigate]);

  const getShareUrl = useCallback((slug: string): string => {
    const base = window.location.origin;
    const secret = (() => {
      try {
        return localStorage.getItem(`fold-secret-${slug}`);
      } catch {
        return null;
      }
    })();
    return secret ? `${base}/f/${slug}?s=${secret}` : `${base}/f/${slug}`;
  }, []);

  return {
    createFold,
    createDemoFold,
    joinFold,
    getShareUrl,
    creating,
    error,
  };
}
