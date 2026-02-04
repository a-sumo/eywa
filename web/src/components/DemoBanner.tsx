import { useRoomContext } from "../context/RoomContext";

export function DemoBanner() {
  const { isDemo } = useRoomContext();

  if (!isDemo) return null;

  return (
    <div className="demo-banner">
      <span className="demo-banner-text">
        Demo Mode - This is a shared demo room with sample data
      </span>
    </div>
  );
}
