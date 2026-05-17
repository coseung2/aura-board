"use client";

import { useState, useRef, useCallback } from "react";
import type { AgentMode } from "@/lib/agent/types";

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  streaming?: boolean;
};

type AgentSseEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "message_delta"; text: string }
  | { type: "code_delta"; text: string }
  | {
      type: "done";
      stopReason?: string;
      tokensIn?: number;
      tokensOut?: number;
      message?: string;
      code?: string | null;
    }
  | { type: "error"; message: string };

type Args = {
  boardId: string;
};

export function useAgentChat({ boardId }: Args) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>("arcade");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState({ in: 0, out: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const createSession = useCallback(
    async (selectedMode?: AgentMode) => {
      const m = selectedMode ?? mode;
      setError(null);
      setMessages([]);
      setGeneratedCode(null);
      setSessionId(null);
      setTokenCount({ in: 0, out: 0 });

      try {
        const res = await fetch("/api/agent/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boardId, mode: m }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown" }));
          throw new Error(err.error ?? "세션 생성 실패");
        }
        const data = await res.json();
        setSessionId(data.id);
        setMode(m);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [boardId, mode]
  );

  /** 기존 세션 ID로 재개 — 새 세션 생성 없이 sessionId만 설정 */
  const resumeSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || streaming) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);

      // Add user message
      const userMsg: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setGeneratedCode(null);

      // Add placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: "assistant", content: "", streaming: true },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/agent/sessions/${sessionId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: trimmed }),
            signal: controller.signal,
          }
        );

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(errText);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let codeAccumulator = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!frame.startsWith("data:")) continue;
            const json = frame.slice(5).trim();
            if (!json) continue;

            try {
              const event = JSON.parse(json) as AgentSseEvent;

              if (event.type === "delta" || event.type === "message_delta") {
                assistantText += event.text;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.streaming) {
                    next[next.length - 1] = {
                      ...last,
                      content: assistantText,
                    };
                  }
                  return next;
                });
              } else if (event.type === "code_delta") {
                codeAccumulator += event.text;
                setGeneratedCode(codeAccumulator);
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.streaming) {
                    next[next.length - 1] = {
                      ...last,
                      code: codeAccumulator,
                    };
                  }
                  return next;
                });
              } else if (event.type === "done") {
                setTokenCount({
                  in: event.tokensIn ?? 0,
                  out: event.tokensOut ?? 0,
                });

                const finalMessage = event.message ?? assistantText;
                const finalCode = event.code ?? (codeAccumulator || null);
                setGeneratedCode(finalCode);
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.streaming) {
                    next[next.length - 1] = {
                      ...last,
                      content: finalMessage,
                      code: finalCode ?? undefined,
                    };
                  }
                  return next;
                });
              } else if (event.type === "error") {
                setError(event.message);
              }
            } catch {
              // skip unparseable
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // Clear streaming flag on the last assistant message
        setMessages((prev) =>
          prev.map((msg) => (msg.streaming ? { ...msg, streaming: false } : msg))
        );
      }
    },
    [sessionId, streaming]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.streaming) {
        next[next.length - 1] = { ...last, streaming: false };
      }
      return next;
    });
  }, []);

  return {
    sessionId,
    mode,
    messages,
    streaming,
    error,
    generatedCode,
    tokenCount,
    createSession,
    resumeSession,
    sendMessage,
    stopStreaming,
    setMode,
    setMessages,
    setGeneratedCode,
  };
}
