import { useState, useCallback, useRef, useEffect } from "react";
import {
  getToolsPayload,
  executeTool,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "../lib/geminiTools";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
];

/** Max tool-call rounds before we bail out (prevents infinite loops). */
const MAX_TOOL_ROUNDS = 6;

function geminiUrl(model: string, stream?: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  const alt = stream ? "&alt=sse" : "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}?key=${GEMINI_API_KEY}${alt}`;
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
  ts: number;
  /** True while this message is still receiving streaming tokens. */
  streaming?: boolean;
  /** Tool calls the model made (for debugging/display). */
  toolCalls?: string[];
}

// ---------------------------------------------------------------------------
// Gemini REST API content types
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: string } };
}

interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const STEERING_PROMPT = `You are the steering agent for an Eywa room. Your job is to help the human navigate their agent swarm toward their destination.

You have tools to query agent status, thread history, knowledge, and detect patterns. Use them proactively: when the user asks about agents or activity, call get_agent_status or get_thread instead of guessing. When asked to analyze the room, call detect_patterns.

When analyzing activity, look for:
- REDUNDANCY: Multiple agents doing similar work
- DIVERGENCE: Agents pulling in conflicting directions
- IDLENESS: Agents that could be productive but aren't
- PROGRESS: How close are we to the destination?

Be direct. Highlight what matters. Skip noise. Use short paragraphs. No em dashes.`;

const CONTEXT_PROMPT = `You are a helpful AI assistant analyzing shared context from multiple AI agent threads in an Eywa room.

You have tools to query agent status, thread history, knowledge, and detect patterns. Use them when they would help answer the user's question more accurately.

Help the user understand, compare, and work with the context provided. Be concise and direct. No em dashes.`;

function buildSystemInstruction(
  roomContext: string,
  autoContext: string
): { parts: GeminiPart[] } {
  const hasManualContext = roomContext.length > 0;
  const base = hasManualContext ? CONTEXT_PROMPT : STEERING_PROMPT;

  const parts: string[] = [base];

  if (autoContext) {
    parts.push(`\nCurrent room snapshot:\n${autoContext}`);
  }
  if (hasManualContext) {
    parts.push(`\nUser-selected context:\n${roomContext}`);
  }

  return { parts: [{ text: parts.join("\n") }] };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGeminiChat(systemContext: string, roomId?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoContext, setAutoContext] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const autoContextFetched = useRef(false);

  // -----------------------------------------------------------------------
  // Auto-context: fetch agent status on mount when we have a roomId
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!roomId || autoContextFetched.current) return;
    autoContextFetched.current = true;

    // Fetch agent status, distress signals, and patterns in parallel
    Promise.all([
      executeTool(roomId, { name: "get_agent_status", args: {} }),
      executeTool(roomId, { name: "get_distress_signals", args: {} }),
      executeTool(roomId, { name: "detect_patterns", args: {} }),
    ]).then(([statusResult, distressResult, patternsResult]) => {
      const parts: string[] = [statusResult.response.result];

      const distressText = distressResult.response.result;
      if (distressText && !distressText.includes("No distress signals") && !distressText.includes("appear healthy")) {
        parts.push("\n" + distressText);
      }

      const patternsText = patternsResult.response.result;
      if (patternsText && !patternsText.includes("No significant patterns") && !patternsText.includes("No recent activity")) {
        parts.push("\n" + patternsText);
      }

      setAutoContext(parts.join("\n"));

      // If there are distress signals or patterns, show a proactive alert
      const hasDistress = distressText && distressText.includes("UNRESOLVED DISTRESS");
      const hasPatterns = patternsText && (
        patternsText.includes("REDUNDANCY") ||
        patternsText.includes("DIVERGENCE") ||
        patternsText.includes("DISTRESS")
      );

      if (hasDistress || hasPatterns) {
        const alertParts: string[] = [];
        if (hasDistress) alertParts.push(distressText);
        if (hasPatterns) alertParts.push(patternsText);
        setMessages((prev) => [
          ...prev,
          {
            role: "model" as const,
            content: alertParts.join("\n\n"),
            ts: Date.now(),
          },
        ]);
      }
    });
  }, [roomId]);

  // Reset auto-context fetch flag when room changes
  useEffect(() => {
    autoContextFetched.current = false;
    setAutoContext("");
  }, [roomId]);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------
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

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        // Build conversation contents from message history.
        // We keep a separate "API contents" array that includes tool
        // call/response pairs which are not shown to the user.
        const apiContents: GeminiContent[] = [];

        // Add previous visible messages
        for (const m of messages) {
          apiContents.push({
            role: m.role,
            parts: [{ text: m.content }],
          });
        }
        // Add the new user message
        apiContents.push({
          role: "user",
          parts: [{ text: userMessage }],
        });

        const systemInstruction = buildSystemInstruction(
          systemContext,
          autoContext
        );

        // Tool calling loop: Gemini may return function calls that we
        // need to execute, then feed the results back and ask again.
        let toolRound = 0;
        const toolNames: string[] = [];

        while (toolRound < MAX_TOOL_ROUNDS) {
          // On the last possible round, or if we already have tool results,
          // try streaming. On tool-call rounds, use non-streaming for simpler parsing.
          const isLastRound = toolRound > 0;
          const useStreaming = isLastRound;

          const requestBody: Record<string, unknown> = {
            systemInstruction,
            contents: apiContents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
            },
            tools: roomId ? getToolsPayload() : undefined,
          };

          let modelText = "";
          let functionCalls: GeminiFunctionCall[] = [];
          let success = false;

          // Try models in order (fallback on rate limit)
          let lastError = "";
          for (const model of MODELS) {
            if (signal.aborted) return;

            const url = geminiUrl(model, useStreaming);
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal,
              body: JSON.stringify(requestBody),
            });

            if (response.status === 429) {
              lastError = `Rate limited on ${model}`;
              continue;
            }

            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(
                `Gemini API error ${response.status}: ${errBody}`
              );
            }

            if (useStreaming && response.body) {
              // Parse SSE stream
              const parsed = await parseStreamingResponse(
                response,
                signal,
                (partialText) => {
                  // Update the streaming message in place
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.streaming) {
                      return [
                        ...prev.slice(0, -1),
                        { ...last, content: partialText },
                      ];
                    }
                    // First chunk: add new streaming message
                    return [
                      ...prev,
                      {
                        role: "model" as const,
                        content: partialText,
                        ts: Date.now(),
                        streaming: true,
                        toolCalls: toolNames.length > 0 ? [...toolNames] : undefined,
                      },
                    ];
                  });
                }
              );
              modelText = parsed.text;
              functionCalls = parsed.functionCalls;
            } else {
              // Non-streaming: parse JSON response
              const data = await response.json();
              const candidate = data.candidates?.[0];
              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    modelText += part.text;
                  }
                  if (part.functionCall) {
                    functionCalls.push({
                      name: part.functionCall.name,
                      args: part.functionCall.args || {},
                    });
                  }
                }
              }
            }

            success = true;
            break;
          }

          if (!success) {
            throw new Error(
              lastError ||
                "All Gemini models rate limited. Please try again in a minute."
            );
          }

          // If Gemini returned function calls, execute them and loop
          if (functionCalls.length > 0 && roomId) {
            // Add the model's function call to the API conversation
            apiContents.push({
              role: "model",
              parts: functionCalls.map((fc) => ({
                functionCall: { name: fc.name, args: fc.args },
              })),
            });

            // Execute each tool
            const responses: GeminiFunctionResponse[] = [];
            for (const fc of functionCalls) {
              toolNames.push(fc.name);
              const result = await executeTool(roomId, fc);
              responses.push(result);
            }

            // Add function responses to API conversation
            apiContents.push({
              role: "function" as GeminiContent["role"],
              parts: responses.map((r) => ({
                functionResponse: {
                  name: r.name,
                  response: r.response,
                },
              })),
            });

            toolRound++;
            continue;
          }

          // No function calls: we have the final text response
          if (useStreaming) {
            // Finalize the streaming message
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.streaming) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    content: modelText || last.content,
                    streaming: false,
                  },
                ];
              }
              // Streaming didn't produce any chunks; add final message
              return [
                ...prev,
                {
                  role: "model" as const,
                  content: modelText || "No response from Gemini.",
                  ts: Date.now(),
                  toolCalls: toolNames.length > 0 ? [...toolNames] : undefined,
                },
              ];
            });
          } else {
            // Non-streaming: add completed message
            setMessages((prev) => [
              ...prev,
              {
                role: "model" as const,
                content: modelText || "No response from Gemini.",
                ts: Date.now(),
                toolCalls: toolNames.length > 0 ? [...toolNames] : undefined,
              },
            ]);
          }

          break;
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Remove any dangling streaming message
        setMessages((prev) =>
          prev.filter((m) => !m.streaming)
        );
        setError(
          err instanceof Error ? err.message : "Failed to call Gemini"
        );
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, systemContext, autoContext, roomId]
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, loading, error, send, clear, autoContext };
}

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

async function parseStreamingResponse(
  response: Response,
  signal: AbortSignal,
  onChunk: (text: string) => void
): Promise<{ text: string; functionCalls: GeminiFunctionCall[] }> {
  let fullText = "";
  const functionCalls: GeminiFunctionCall[] = [];

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (!parts) continue;

          for (const part of parts) {
            if (part.text) {
              fullText += part.text;
              onChunk(fullText);
            }
            if (part.functionCall) {
              functionCalls.push({
                name: part.functionCall.name,
                args: part.functionCall.args || {},
              });
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, functionCalls };
}
