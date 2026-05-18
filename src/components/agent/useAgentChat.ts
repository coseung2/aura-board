"use client";

import { useState, useRef, useCallback } from "react";
import type { AgentMode, AIAction, CanvasEditEvent, CanvasOperation, CanvasPatch, CodeCanvas } from "@/lib/agent/types";
import { createEmptyCanvas, extractSelectionContext, applyPatch, undoEvent, redoEvent } from "@/lib/agent/patch-engine";

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  streaming?: boolean;
  /** If this assistant message produced a patch, link it here */
  canvasPatchId?: string;
};

type AgentSseEvent =
  | { type: "session"; id: string }
  | { type: "delta"; text: string }
  | { type: "message_delta"; text: string }
  | { type: "code_delta"; text: string }
  | { type: "actions"; actions: AIAction[] }
  | { type: "patch_proposed"; patch: CanvasPatch }
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
  const [tokenCount, setTokenCount] = useState({ in: 0, out: 0 });

  // ── Canvas state ──
  const [canvas, setCanvas] = useState<CodeCanvas>(() => createEmptyCanvas("arcade"));
  const [history, setHistory] = useState<{ past: CanvasEditEvent[]; future: CanvasEditEvent[] }>({
    past: [],
    future: [],
  });
  // Proposed patches awaiting accept/reject
  const [proposedPatch, setProposedPatch] = useState<CanvasPatch | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const historyRef = useRef(history);
  historyRef.current = history;

  const createSession = useCallback(
    async (selectedMode?: AgentMode) => {
      const m = selectedMode ?? mode;
      setError(null);
      setMessages([]);
      setSessionId(null);
      setTokenCount({ in: 0, out: 0 });
      setProposedPatch(null);

      // Reset canvas per mode
      const freshCanvas = createEmptyCanvas(m);
      setCanvas(freshCanvas);
      setHistory({ past: [], future: [] });

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

  /** 기존 세션 ID로 재개 */
  const resumeSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  /** 캔버스가 외부에서 변경되었을 때 (MonacoEditor에서) */
  const updateCanvas = useCallback((nextCanvas: CodeCanvas) => {
    setCanvas(nextCanvas);
  }, []);

  /** Undo */
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const event = h.past[h.past.length - 1];
    const { undoEvent } = require("@/lib/agent/patch-engine");
    setCanvas(undoEvent(canvasRef.current, event));
    setHistory({
      past: h.past.slice(0, -1),
      future: [event, ...h.future],
    });
  }, []);

  /** Redo */
  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const event = h.future[0];
    const { redoEvent } = require("@/lib/agent/patch-engine");
    setCanvas(redoEvent(canvasRef.current, event));
    setHistory({
      past: [...h.past, event],
      future: h.future.slice(1),
    });
  }, []);

  /** Accept a proposed patch — apply it to the canvas */
  const acceptPatch = useCallback((patchId?: string, acceptedOpIds?: string[]) => {
    const patch = proposedPatch;
    if (!patch) return;
    if (patchId && patch.id !== patchId) return;

    const result = applyPatch(canvasRef.current, patch, acceptedOpIds);
    if (result.error) {
      setError(result.error);
      return;
    }

    setCanvas(result.canvas);
    setHistory((prev) => ({
      past: [...prev.past, ...result.events],
      future: [],
    }));

    setProposedPatch(null);

    // Mark last assistant message with patch id
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant" && !next[i].canvasPatchId) {
          next[i] = { ...next[i], canvasPatchId: patch.id };
          break;
        }
      }
      return next;
    });
  }, [proposedPatch]);

  /** Reject the proposed patch */
  const rejectPatch = useCallback(() => {
    setProposedPatch(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || streaming) return;
      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);
      setProposedPatch(null); // Clear any pending patch

      // Get canvas context for the request
      const currentCanvas = canvasRef.current;
      const ctx = extractSelectionContext(currentCanvas, 5);

      // Add user message
      const userMsg: AgentMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);

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
            body: JSON.stringify({
              content: trimmed,
              canvas: {
                files: currentCanvas.files.map((f) => ({ path: f.path, language: f.language })),
                activeFile: currentCanvas.activeFile,
                selection: currentCanvas.selection,
                selectedText: ctx.selectedText,
                surroundingText: ctx.surroundingText,
                outline: ctx.outline,
              },
            }),
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
                    next[next.length - 1] = { ...last, content: assistantText };
                  }
                  return next;
                });
              } else if (event.type === "code_delta") {
                codeAccumulator += event.text;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.streaming) {
                    next[next.length - 1] = { ...last, code: codeAccumulator };
                  }
                  return next;
                });
              } else if (event.type === "actions") {
                // Structured output: AI actions → create a patch proposal
                const patchId = crypto.randomUUID();
                const operations: CanvasOperation[] = event.actions.map((action) => ({
                  id: crypto.randomUUID(),
                  action,
                  valid: true,
                }));
                const proposed: CanvasPatch = {
                  id: patchId,
                  sessionId: sessionId!,
                  baseVersion: currentCanvas.baseVersion,
                  operations,
                  summary: assistantText.slice(0, 100) || "AI 제안",
                  status: "proposed",
                  acceptedOps: [],
                  createdAt: new Date().toISOString(),
                };
                setProposedPatch(proposed);
              } else if (event.type === "patch_proposed") {
                setProposedPatch(event.patch);
              } else if (event.type === "done") {
                setTokenCount({
                  in: event.tokensIn ?? 0,
                  out: event.tokensOut ?? 0,
                });

                const finalMessage = event.message ?? assistantText;
                const finalCode = event.code ?? (codeAccumulator || null);
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
    tokenCount,
    // Canvas state
    canvas,
    history,
    proposedPatch,
    // Actions
    createSession,
    resumeSession,
    sendMessage,
    stopStreaming,
    updateCanvas,
    undo,
    redo,
    acceptPatch,
    rejectPatch,
    setMode,
    setMessages,
    // Direct canvas setter for loading saved sessions
    setCanvas,
  };
}
