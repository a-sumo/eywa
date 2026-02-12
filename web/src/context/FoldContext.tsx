import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, type Fold } from "../lib/supabase";

interface FoldContextValue {
  fold: Fold | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
}

const FoldContext = createContext<FoldContextValue | null>(null);

export function FoldProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [fold, setFold] = useState<Fold | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setFold(null);
      setLoading(false);
      return;
    }

    async function fetchFold() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("folds")
        .select("*")
        .eq("slug", slug)
        .single();

      if (fetchError || !data) {
        setError("Fold not found");
        setFold(null);
      } else {
        setFold(data);
      }
      setLoading(false);
    }

    fetchFold();
  }, [slug, navigate]);

  return (
    <FoldContext.Provider
      value={{
        fold,
        loading,
        error,
        isDemo: fold?.is_demo ?? false,
      }}
    >
      {children}
    </FoldContext.Provider>
  );
}

export function useFoldContext() {
  const ctx = useContext(FoldContext);
  if (!ctx) {
    throw new Error("useFoldContext must be used within a FoldProvider");
  }
  return ctx;
}
