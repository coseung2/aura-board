"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChatPanel } from "./AgentChatPanel";
import { useAgentChat } from "./useAgentChat";
import {
  AGENT_MODES,
  AGENT_MODE_LABELS,
  AGENT_MODE_DESCRIPTIONS,
  type AgentMode,
} from "@/lib/agent/types";

interface SessionSummary {
  id: string;
  mode: string;
  title: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  boardId: string;
  boardTitle: string;
  boardHref: string;
  studentId: string;
  studentName: string;
  recentSessions: SessionSummary[];
}

export function AgentPageClient({
  boardId,
  boardTitle,
  boardHref,
  recentSessions: initialSessions,
}: Props) {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>(initialSessions);
  const [showNewModal, setShowNewModal] = useState(!initialSessions.length);

  const {
    sessionId,
    mode,
    messages,
    streaming,
    error,
    tokenCount,
    createSession,
    sendMessage,
    stopStreaming,
    setMode,
    setMessages,
  } = useAgentChat({ boardId });

  const handleSend = useCallback(() => {
    if (!sessionId) return;
    void sendMessage(chatInput);
    setChatInput("");
  }, [sessionId, sendMessage, chatInput]);

  const handleNewSession = useCallback(
    async (selectedMode: AgentMode) => {
      setShowNewModal(false);
      setMessages([]);
      setChatInput("");
      await createSession(selectedMode);
    },
    [createSession, setMessages]
  );

  const handleResumeSession = useCallback(
    async (session: SessionSummary) => {
      setShowNewModal(false);
      try {
        const res = await fetch(`/api/agent/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setMode(data.mode as AgentMode);
        setMessages(
          (data.messages ?? []).map(
            (m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            })
          )
        );
        // Re-assign the hook's sessionId via createSession workaround
        // For now just create a new session
        await createSession(data.mode as AgentMode);
      } catch {
        // fallback to new session
        await handleNewSession(session.mode as AgentMode);
      }
    },
    [createSession, setMode, setMessages]
  );

  // Refresh session list after creating a new session
  useEffect(() => {
    if (sessionId) {
      fetch("/api/agent/sessions?status=active&limit=20")
        .then((r) => r.json())
        .then((data: SessionSummary[]) => setSessions(data))
        .catch(() => {});
    }
  }, [sessionId]);

  const canSave = messages.length >= 2 && !streaming && sessionId;

  return (
    <div className="agent-page">
      {/* Nav */}
      <nav className="agent-breadcrumb" aria-label="breadcrumb">
        <Link href={boardHref}>{boardTitle}</Link>
        <span className="agent-breadcrumb-sep">&gt;</span>
        <span>AI 도우미</span>
      </nav>

      {/* Hero */}
      <section className="agent-hero">
        <div>
          <h1>🤖 AI 도우미</h1>
          <p>게임, 학습, 코딩, 수업 — AI와 대화하고 결과물을 만들어보세요</p>
        </div>
        <div className="agent-hero-actions">
          <Link href={boardHref} className="ds-btn-secondary">
            ← 보드로
          </Link>
          <button
            type="button"
            className="ds-btn-primary"
            onClick={() => setShowNewModal(true)}
          >
            ✨ 새 대화
          </button>
        </div>
      </section>

      <div className="agent-layout">
        {/* Sidebar: Session list */}
        <aside className="agent-sidebar">
          <div className="agent-sidebar-head">
            <h3>내 대화</h3>
            <span className="agent-sidebar-count">{sessions.length}</span>
          </div>
          {sessions.length === 0 ? (
            <p className="agent-sidebar-empty">
              아직 대화가 없어요. 새 대화를 시작해보세요!
            </p>
          ) : (
            <div className="agent-sidebar-list">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`agent-sidebar-item ${
                    s.id === sessionId ? "agent-sidebar-item-active" : ""
                  }`}
                  onClick={() => handleResumeSession(s)}
                >
                  <span className="agent-sidebar-item-icon">
                    {AGENT_MODE_LABELS[s.mode as AgentMode]?.split(" ")[0] ??
                      "💬"}
                  </span>
                  <span className="agent-sidebar-item-info">
                    <span className="agent-sidebar-item-title">
                      {s.title || "새 대화"}
                    </span>
                    <span className="agent-sidebar-item-meta">
                      {AGENT_MODE_LABELS[s.mode as AgentMode] ?? s.mode} ·{" "}
                      {s.messageCount}개 메시지
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Main: Chat */}
        <main className="agent-main">
          {!sessionId && !showNewModal ? (
            <div className="agent-main-empty">
              <p>대화를 선택하거나 새 대화를 시작하세요</p>
            </div>
          ) : sessionId || showNewModal ? (
            <>
              {/* Active session indicator */}
              {sessionId && (
                <div className="agent-session-info">
                  <span className="agent-session-mode">
                    {AGENT_MODE_LABELS[mode] ?? "대화"}
                  </span>
                  <span className="agent-session-tokens">
                    ⚡ {tokenCount.in + tokenCount.out} 토큰
                  </span>
                </div>
              )}

              <AgentChatPanel
                messages={messages}
                streaming={streaming}
                error={error}
                chatInput={chatInput}
                onChatInputChange={setChatInput}
                onSubmit={handleSend}
                onStopStreaming={stopStreaming}
              />

              {/* Save to project button */}
              {canSave && (
                <div className="agent-save-bar">
                  <button
                    type="button"
                    className="ds-btn-primary"
                    onClick={async () => {
                      // Phase 0: navigate to vibe-arcade studio with session
                      router.push(
                        `${boardHref}/vibe-arcade/studio?agentSession=${sessionId}`
                      );
                    }}
                  >
                    📦 프로젝트로 저장
                  </button>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>

      {/* New session modal */}
      {showNewModal && !sessionId && (
        <div className="agent-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()}>
            <h2>새 대화 시작</h2>
            <p>원하는 모드를 선택하세요</p>
            <div className="agent-mode-grid">
              {AGENT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="agent-mode-card"
                  onClick={() => handleNewSession(m)}
                >
                  <span className="agent-mode-card-icon">
                    {AGENT_MODE_LABELS[m].split(" ")[0]}
                  </span>
                  <span className="agent-mode-card-label">
                    {AGENT_MODE_LABELS[m].slice(
                      AGENT_MODE_LABELS[m].indexOf(" ") + 1
                    )}
                  </span>
                  <span className="agent-mode-card-desc">
                    {AGENT_MODE_DESCRIPTIONS[m]}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="agent-modal-close"
              onClick={() => setShowNewModal(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
