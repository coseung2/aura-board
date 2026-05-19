"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createEmptyCanvas, extractSelectionContext } from "@/lib/agent/canvas";
import type { AgentMode, CodeCanvas } from "@/lib/agent/types";

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

function appendToStreamingMessage(
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>,
  patch: Partial<Pick<AgentMessage, "content" | "code">>,
) {
  setMessages((prev) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last?.streaming) {
      next[next.length - 1] = { ...last, ...patch };
    }
    return next;
  });
}

export function useAgentChat({ boardId }: Args) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>("arcade");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState({ in: 0, out: 0 });
  const [canvas, setCanvas] = useState<CodeCanvas>(() => createEmptyCanvas("arcade"));

  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  const createSession = useCallback(
    async (selectedMode?: AgentMode) => {
      const nextMode = selectedMode ?? mode;
      setError(null);
      setMessages([]);
      setSessionId(null);
      setTokenCount({ in: 0, out: 0 });
      setCanvas(createEmptyCanvas(nextMode));

      try {
        const res = await fetch("/api/agent/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boardId, mode: nextMode }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown" }));
          throw new Error(err.error ?? "Session creation failed");
        }
        const data = await res.json();
        setSessionId(data.id);
        setMode(nextMode);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [boardId, mode],
  );

  const resumeSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const updateCanvas = useCallback((nextCanvas: CodeCanvas) => {
    setCanvas(nextCanvas);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || streaming) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);

      const currentCanvas = canvasRef.current;
      const ctx = extractSelectionContext(currentCanvas, 5);

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
        { id: `assistant-${Date.now()}`, role: "assistant", content: "", streaming: true },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            canvas: {
              files: currentCanvas.files.map((file) => ({
                path: file.path,
                language: file.language,
              })),
              activeFile: currentCanvas.activeFile,
              selection: currentCanvas.selection,
              selectedText: ctx.selectedText,
              surroundingText: ctx.surroundingText,
              outline: ctx.outline,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(errText);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let codeText = "";

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

              if (event.type === "delta") {
                // The current provider streams a JSON object. Keep the UI in a
                // simple "thinking" state until the final parsed message arrives.
              } else if (event.type === "message_delta") {
                assistantText += event.text;
                appendToStreamingMessage(setMessages, { content: assistantText });
              } else if (event.type === "code_delta") {
                codeText += event.text;
                appendToStreamingMessage(setMessages, { code: codeText });
              } else if (event.type === "done") {
                setTokenCount({
                  in: event.tokensIn ?? 0,
                  out: event.tokensOut ?? 0,
                });

                assistantText = event.message ?? assistantText;
                codeText = event.code ?? codeText;
                if (codeText) {
                  setCanvas((currentCanvas) => ({
                    ...currentCanvas,
                    files: currentCanvas.files.map((file) =>
                      file.path === currentCanvas.activeFile
                        ? { ...file, content: codeText }
                        : file,
                    ),
                  }));
                }
                appendToStreamingMessage(setMessages, {
                  content: assistantText,
                  code: codeText || undefined,
                });
              } else if (event.type === "error") {
                setError(event.message);
              }
            } catch {
              // Ignore malformed SSE frames.
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
        setMessages((prev) =>
          prev.map((msg) => (msg.streaming ? { ...msg, streaming: false } : msg)),
        );
      }
    },
    [sessionId, streaming],
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
    tokenCount,
    canvas,
    createSession,
    resumeSession,
    sendMessage,
    stopStreaming,
    updateCanvas,
    setMode,
    setMessages,
    setCanvas,
  };
}
