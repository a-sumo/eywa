import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, type Room } from "../lib/supabase";

interface RoomContextValue {
  room: Room | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setRoom(null);
      setLoading(false);
      return;
    }

    async function fetchRoom() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("folds")
        .select("*")
        .eq("slug", slug)
        .single();

      if (fetchError || !data) {
        setError("Room not found");
        setRoom(null);
      } else {
        setRoom(data);
      }
      setLoading(false);
    }

    fetchRoom();
  }, [slug, navigate]);

  return (
    <RoomContext.Provider
      value={{
        room,
        loading,
        error,
        isDemo: room?.is_demo ?? false,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoomContext() {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoomContext must be used within a RoomProvider");
  }
  return ctx;
}
