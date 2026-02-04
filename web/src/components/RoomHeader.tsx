import { useState } from "react";
import { useRoomContext } from "../context/RoomContext";
import { useRoom } from "../hooks/useRoom";
import { ConnectAgent } from "./ConnectAgent";

export function RoomHeader() {
  const { room, isDemo } = useRoomContext();
  const { getShareUrl } = useRoom();
  const [copied, setCopied] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  if (!room) return null;

  const handleShare = async () => {
    const url = getShareUrl(room.slug);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="room-header">
        <div className="room-header-info">
          <h2 className="room-name">{room.name}</h2>
          <span className="room-slug">/{room.slug}</span>
        </div>
        <div className="room-header-actions">
          {isDemo && <span className="demo-badge">Demo</span>}
          <button
            className="share-btn"
            onClick={() => setShowConnect(!showConnect)}
          >
            {showConnect ? "Hide" : "Connect Agent"}
          </button>
          <button className="share-btn" onClick={handleShare}>
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>
      {showConnect && (
        <div className="connect-agent-dropdown">
          <ConnectAgent slug={room.slug} inline />
        </div>
      )}
    </>
  );
}
