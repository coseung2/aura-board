"use client";

import { useEffect, useRef } from "react";
import type { AgentMessage } from "./useAgentChat";

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (streaming) onStopStreaming();
    else onSubmit();
  }

  return (
    <div className="agent-chat-panel">
      {messages.length === 0 ? (
        <div className="agent-welcome">
          <div className="agent-welcome-icon">AI</div>
          <h2>AI 도우미와 대화해보세요</h2>
          <p>게임, 학습, 코딩, 수업 아이디어를 자연스럽게 물어볼 수 있어요.</p>
          <div className="agent-hint">
            <span>힌트</span>
            <span>아래 입력창에 만들고 싶은 것부터 적어보세요.</span>
          </div>
        </div>
      ) : (
        <div className="agent-messages">
          {messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`agent-message agent-message-${message.role}`}
            >
              <div className="agent-message-avatar">
                {message.role === "user" ? "나" : "AI"}
              </div>
              <div className="agent-message-bubble">
                <div className="agent-message-content">
                  {message.content ? (
                    <MessageContent content={message.content} />
                  ) : message.streaming ? (
                    <span className="agent-typing">생각하는 중...</span>
                  ) : null}
                  {message.code && (
                    <span className="agent-code-preview-badge">
                      실행할 코드가 미리보기에 반영됐어요.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && (
        <div className="agent-error">
          <span>오류</span> {error}
        </div>
      )}

      <div className="agent-input-bar">
        <textarea
          className="agent-textarea"
          placeholder="메시지를 입력하세요..."
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
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
          {streaming ? "중단" : "전송"}
        </button>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          const isHtml = part.startsWith("```html");
          if (isHtml) {
            return (
              <span key={index} className="agent-code-preview-badge">
                HTML 코드가 미리보기에 반영됐어요.
              </span>
            );
          }
          const code = part.replace(/^```\w*\n?/, "").replace(/```$/, "");
          return (
            <pre key={index} className="agent-code-block">
              <code>{code}</code>
            </pre>
          );
        }

        const lines = part.split("\n");
        return (
          <span key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {line}
                {lineIndex < lines.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}
