import { useState, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { useRoomContext } from "../context/RoomContext";
import { VoiceButton } from "./VoiceButton";

function timeStr(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Chat() {
  const { room } = useRoomContext();
  const { messages, loading, send } = useChat(room?.id ?? null, "general");
  const [input, setInput] = useState("");
  const [sender, setSender] = useState(
    () => localStorage.getItem("eywa_user") || ""
  );
  const [showNamePrompt, setShowNamePrompt] = useState(!sender);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !sender) return;
    send(sender, text);
    setInput("");
  };

  if (showNamePrompt) {
    return (
      <div className="chat-name-prompt">
        <h2>Enter your name</h2>
        <input
          autoFocus
          placeholder="Your name..."
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && sender.trim()) {
              localStorage.setItem("eywa_user", sender.trim());
              setShowNamePrompt(false);
            }
          }}
        />
        <button
          onClick={() => {
            if (sender.trim()) {
              localStorage.setItem("eywa_user", sender.trim());
              setShowNamePrompt(false);
            }
          }}
        >
          Join
        </button>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <h2>#general</h2>
        <span className="chat-user">
          {sender}{" "}
          <button
            className="change-name-btn"
            onClick={() => setShowNamePrompt(true)}
          >
            change
          </button>
        </span>
      </div>
      <div className="chat-messages">
        {loading && <div className="feed-loading">Loading...</div>}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg">
            <span className="chat-msg-sender">{m.sender}</span>
            <span className="chat-msg-time">{timeStr(m.ts)}</span>
            <p className="chat-msg-content">{m.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <VoiceButton onTranscript={(text) => setInput((prev) => prev + text)} />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
