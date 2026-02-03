import { useState, useCallback, useRef } from "react";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  ts: number;
}

export function useGeminiChat(systemContext: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (userMessage: string) => {
      if (!GEMINI_API_KEY) {
        setError("Missing VITE_GEMINI_API_KEY in environment");
        return;
      }

      const userMsg: ChatMessage = {
        role: "user",
        content: userMessage,
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      // Build conversation history for Gemini
      const allMessages = [...messages, userMsg];
      const contents = allMessages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      // Build system instruction from context
      const systemInstruction = systemContext
        ? {
            parts: [
              {
                text: `You are a helpful AI assistant analyzing shared context from multiple AI agent threads in a Remix room. Here is the context:\n\n${systemContext}\n\nHelp the user understand, compare, and work with this context. Be concise and direct.`,
              },
            ],
          }
        : {
            parts: [
              {
                text: "You are a helpful AI assistant in Remix, a tool for managing multi-agent AI conversations. The user hasn't added any context yet - suggest they drag memories into the context panel first.",
              },
            ],
          };

      try {
        abortRef.current = new AbortController();

        const response = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            systemInstruction,
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const text =
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          "No response from Gemini.";

        const assistantMsg: ChatMessage = {
          role: "model",
          content: text,
          ts: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to call Gemini"
        );
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, systemContext]
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, loading, error, send, clear };
}
