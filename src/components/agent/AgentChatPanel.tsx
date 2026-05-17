"use client";

import { useRef, useEffect, useState } from "react";
import type { AgentMessage } from "./useAgentChat";
import {
  AGENT_MODES,
  AGENT_MODE_LABELS,
  AGENT_MODE_DESCRIPTIONS,
  type AgentMode,
} from "@/lib/agent/types";

interface Props {
  messages: AgentMessage[];
  streaming: boolean;
  error: string | null;
  chatInput: string;
  onChatInputChange: (text: string) => void;
  onSubmit: () => void;
  onStopStreaming: () => void;
}

export function AgentChatPanel({
  messages,
  streaming,
  error,
  chatInput,
  onChatInputChange,
  onSubmit,
  onStopStreaming,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (streaming) {
        onStopStreaming();
      } else {
        onSubmit();
      }
    }
  };

  const hasStarted = messages.length > 0;

  return (
    <div className="agent-chat-panel">
      {!hasStarted ? (
        <div className="agent-welcome">
          <div className="agent-welcome-icon">🤖</div>
          <h2>AI 도우미와 대화해요</h2>
          <p>
            게임, 학습, 코딩, 수업 — 원하는 주제로 AI와 자유롭게 대화하세요.
          </p>
          <div className="agent-hint">
            <span>👇</span>
            <span>아래 채팅창에 메시지를 입력해보세요</span>
          </div>
        </div>
      ) : (
        <div className="agent-messages">
          {messages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`agent-message agent-message-${msg.role}`}
            >
              <div className="agent-message-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="agent-message-bubble">
                <div className="agent-message-content">
                  {msg.content ? (
                    <MessageContent content={msg.content} />
                  ) : msg.streaming ? (
                    <span className="agent-typing">생각하는 중...</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <div className="agent-error">
          <span>⚠️</span> {error}
        </div>
      )}

      <div className="agent-input-bar">
        <textarea
          ref={inputRef}
          className="agent-textarea"
          placeholder="메시지를 입력하세요..."
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={streaming}
        />
        <button
          type="button"
          className={`agent-send-btn ${streaming ? "agent-stop-btn" : ""}`}
          onClick={streaming ? onStopStreaming : onSubmit}
          aria-label={streaming ? "생성 중단" : "전송"}
        >
          {streaming ? "⏹" : "↵"}
        </button>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Render simple code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const code = part
            .replace(/^```\w*\n?/, "")
            .replace(/```$/, "");
          return (
            <pre key={i} className="agent-code-block">
              <code>{code}</code>
            </pre>
          );
        }
        // Split on newlines for basic text rendering
        return (
          <span key={i}>
            {part.split("\n").map((line, j) => (
              <span key={j}>
                {line}
                {j < part.split("\n").length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}
