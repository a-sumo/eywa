import { useState, useCallback, useRef } from "react";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash-lite"];

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

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
                text: `You are a helpful AI assistant analyzing shared context from multiple AI agent threads in an Eywa room. Here is the context:\n\n${systemContext}\n\nHelp the user understand, compare, and work with this context. Be concise and direct.`,
              },
            ],
          }
        : {
            parts: [
              {
                text: "You are a helpful AI assistant in Eywa, a tool for managing multi-agent AI conversations. The user hasn't added any context yet - suggest they drag memories into the context panel first.",
              },
            ],
          };

      try {
        abortRef.current = new AbortController();

        const body = JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        });

        let lastError = "";
        for (const model of MODELS) {
          const response = await fetch(geminiUrl(model), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortRef.current.signal,
            body,
          });

          if (response.status === 429) {
            lastError = `Rate limited on ${model}, trying next model...`;
            continue;
          }

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(
              `Gemini API error ${response.status}: ${errBody}`
            );
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
          return;
        }

        throw new Error(
          lastError ||
            "All Gemini models rate limited. Please try again in a minute."
        );
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
