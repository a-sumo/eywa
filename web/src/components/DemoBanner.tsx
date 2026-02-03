import { useRoomContext } from "../context/RoomContext";
import { supabase } from "../lib/supabase";

export function DemoBanner() {
  const { room, isDemo } = useRoomContext();

  if (!isDemo || !room) return null;

  const handleReset = async () => {
    if (!confirm("Reset demo data? This will clear all memories and messages in the demo room.")) {
      return;
    }

    await supabase.from("memories").delete().eq("room_id", room.id);
    await supabase.from("messages").delete().eq("room_id", room.id);
    window.location.reload();
  };

  return (
    <div className="demo-banner">
      <span className="demo-banner-text">
        Demo Mode - This is a shared demo room with sample data
      </span>
      <button className="demo-reset-btn" onClick={handleReset}>
        Reset
      </button>
    </div>
  );
}
