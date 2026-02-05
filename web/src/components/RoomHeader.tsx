import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRoomContext } from "../context/RoomContext";
import { useRoom } from "../hooks/useRoom";
import { ConnectAgent } from "./ConnectAgent";
import { NotificationBell } from "./NotificationBell";

export function RoomHeader() {
  const { room, isDemo } = useRoomContext();
  const { getShareUrl } = useRoom();
  const [copied, setCopied] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showShare, setShowShare] = useState(false);

  if (!room) return null;

  const shareUrl = getShareUrl(room.slug);

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
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
          <NotificationBell />
          {isDemo && <span className="demo-badge">Demo</span>}
          <button
            className="share-btn"
            onClick={() => { setShowConnect(!showConnect); setShowShare(false); }}
          >
            {showConnect ? "Hide" : "Connect Agent"}
          </button>
          <button
            className="share-btn"
            onClick={() => { setShowShare(!showShare); setShowConnect(false); }}
          >
            {showShare ? "Hide" : "Share"}
          </button>
        </div>
      </div>
      {showConnect && (
        <div className="connect-agent-dropdown">
          <ConnectAgent slug={room.slug} inline />
        </div>
      )}
      {showShare && (
        <div className="share-dropdown">
          <div className="share-dropdown-content">
            <div className="share-url-row">
              <code className="share-url">{shareUrl}</code>
              <button className="share-copy-btn" onClick={handleCopyUrl}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="share-qr">
              <QRCodeSVG
                value={shareUrl}
                size={120}
                bgColor="transparent"
                fgColor="#333"
                level="M"
              />
            </div>
            <span className="share-hint">Scan to open this room on another device</span>
          </div>
        </div>
      )}
    </>
  );
}
