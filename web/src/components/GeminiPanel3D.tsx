import { useState, useRef, useEffect } from "react";
import { useGeminiChat } from "../hooks/useGeminiChat";
import { useVoiceInput } from "../hooks/useVoiceInput";

interface GeminiPanel3DProps {
  contextSummary: string;
  contextCount: number;
}

export function GeminiPanel3D({ contextSummary, contextCount }: GeminiPanel3DProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const {
    messages: chatMessages,
    loading: chatLoading,
    error: chatError,
    send: sendChat,
    clear: clearChat,
  } = useGeminiChat(contextSummary);

  const { isListening, isSupported, toggleListening, transcript } = useVoiceInput({
    onResult: (text) => {
      setChatInput((prev) => (prev + " " + text).trim());
    },
  });

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    sendChat(text);
  };

  return (
    <div className={`remix3d-chat-panel ${collapsed ? "collapsed" : ""}`}>
      <div
        className="remix3d-chat-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Gemini Agent</span>
        <span className="remix3d-chat-count">
          {contextCount > 0 ? `${contextCount} ctx` : "no ctx"}
        </span>
        <button
          className="remix3d-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? "+" : "-"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="remix3d-chat-messages">
            {chatMessages.length === 0 && !chatLoading && (
              <div className="remix3d-chat-empty">
                {contextCount === 0
                  ? "Drag memories into context first"
                  : `${contextCount} memories loaded. Ask Gemini anything.`}
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`remix-chat-msg remix-chat-${msg.role}`}
              >
                <div className="remix-chat-msg-role">
                  {msg.role === "user" ? "You" : "Gemini"}
                </div>
                <div className="remix-chat-msg-content">{msg.content}</div>
              </div>
            ))}

            {chatLoading && (
              <div className="remix-chat-msg remix-chat-model">
                <div className="remix-chat-msg-role">Gemini</div>
                <div className="remix-chat-msg-content remix-chat-typing">
                  Thinking...
                </div>
              </div>
            )}

            {chatError && (
              <div className="remix-chat-error">{chatError}</div>
            )}

            <div ref={chatBottomRef} />
          </div>

          <div className="remix3d-chat-input-row">
            {isSupported && (
              <button
                className={`remix3d-voice-btn ${isListening ? "listening" : ""}`}
                onClick={toggleListening}
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? "..." : "Mic"}
              </button>
            )}
            <input
              className="remix3d-chat-input"
              placeholder={
                contextCount === 0
                  ? "Add context first..."
                  : "Ask about context..."
              }
              value={isListening && transcript ? chatInput + " " + transcript : chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={chatLoading}
            />
            <button
              className="remix3d-send-btn"
              onClick={handleSend}
              disabled={chatLoading || !chatInput.trim()}
            >
              Send
            </button>
          </div>

          {chatMessages.length > 0 && (
            <button className="remix3d-clear-btn" onClick={clearChat}>
              Clear chat
            </button>
          )}
        </>
      )}
    </div>
  );
}
