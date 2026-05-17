"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
import { buildStudioSrcDoc } from "@/lib/vibe-arcade/sandbox-renderer";

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

/** 마지막 assistant 메시지에서 ```html 블록 추출 */
function extractLatestHtml(messages: { role: string; content: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const match = m.content.match(/```html\s*\n?([\s\S]*?)```/);
    if (match?.[1]) return match[1].trim();
  }
  return null;
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveTags, setSaveTags] = useState("게임");
  const [savingProject, setSavingProject] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const {
    sessionId,
    mode,
    messages,
    streaming,
    error,
    tokenCount,
    createSession,
    resumeSession,
    sendMessage,
    stopStreaming,
    setMode,
    setMessages,
  } = useAgentChat({ boardId });

  // Extract HTML from latest assistant message for preview
  useEffect(() => {
    const html = extractLatestHtml(messages);
    if (html) {
      setPreviewHtml(html);
    }
  }, [messages]);

  // Compute preview srcdoc when HTML changes
  const previewSrcdoc = useMemo(() => {
    if (!previewHtml) return "";
    try {
      return buildStudioSrcDoc({ htmlContent: previewHtml });
    } catch {
      // Fallback: wrap in basic HTML
      return previewHtml.startsWith("<!") || previewHtml.startsWith("<html")
        ? previewHtml
        : `<!DOCTYPE html><html><body>${previewHtml}</body></html>`;
    }
  }, [previewHtml]);

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
      setPreviewHtml(null);
      await createSession(selectedMode);
    },
    [createSession, setMessages]
  );

  const handleResumeSession = useCallback(
    async (session: SessionSummary) => {
      setShowNewModal(false);
      setPreviewHtml(null);
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
        // Re-assign the hook's sessionId to the existing session
        resumeSession(session.id);
      } catch {
        await handleNewSession(session.mode as AgentMode);
      }
    },
    [createSession, handleNewSession, resumeSession, setMode, setMessages]
  );

  const openSaveModal = useCallback(() => {
    const firstUserMessage = messages.find((m) => m.role === "user")?.content.trim();
    setSaveTitle((current) => current || firstUserMessage?.slice(0, 40) || "나의 AI 게임");
    setSaveDescription((current) => current || "AI 도우미와 함께 만든 게임입니다.");
    setSaveError(null);
    setShowSaveModal(true);
  }, [messages]);

  const handleSaveProject = useCallback(async () => {
    if (!sessionId || savingProject) return;
    const title = saveTitle.trim();
    if (!title) {
      setSaveError("프로젝트 제목을 입력해 주세요.");
      return;
    }

    setSavingProject(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          title,
          description: saveDescription.trim(),
          tags: saveTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error === "bad_request" ? "입력값을 확인해 주세요." : "프로젝트 저장에 실패했어요.");
      }
      router.push(`${boardHref}/project/${data.projectId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "프로젝트 저장 중 오류가 발생했어요.");
    } finally {
      setSavingProject(false);
    }
  }, [boardHref, boardId, router, saveDescription, saveTags, saveTitle, savingProject, sessionId]);

  // Refresh session list
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

      <div className="agent-layout agent-layout-with-preview">
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

        {/* Main: Chat + Preview */}
        <main className="agent-main">
          {!sessionId && !showNewModal ? (
            <div className="agent-main-empty">
              <p>대화를 선택하거나 새 대화를 시작하세요</p>
            </div>
          ) : sessionId || showNewModal ? (
            <div className="agent-main-split">
              {/* Left: Chat */}
              <div className="agent-chat-column">
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
                      onClick={openSaveModal}
                    >
                      📦 프로젝트로 저장
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Preview */}
              <div className="agent-preview-column">
                <div className="agent-preview-header">
                  <span>🎮 미리보기</span>
                  {previewHtml && (
                    <button
                      type="button"
                      className="agent-preview-refresh"
                      onClick={() => {
                        const html = extractLatestHtml(messages);
                        if (html) setPreviewHtml(html);
                      }}
                      title="새로고침"
                    >
                      🔄
                    </button>
                  )}
                </div>
                <div className="agent-preview-frame">
                  {previewSrcdoc ? (
                    <iframe
                      key={previewSrcdoc.slice(0, 80)}
                      srcDoc={previewSrcdoc}
                      sandbox="allow-scripts"
                      title="게임 미리보기"
                      className="agent-preview-iframe"
                    />
                  ) : (
                    <div className="agent-preview-empty">
                      <span>💡</span>
                      <p>AI가 게임 코드를 생성하면<br />여기서 미리볼 수 있어요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
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

      {/* Save project modal */}
      {showSaveModal && (
        <div
          className="agent-modal-overlay"
          onClick={() => !savingProject && setShowSaveModal(false)}
        >
          <div className="agent-modal agent-save-modal" onClick={(e) => e.stopPropagation()}>
            <h2>프로젝트로 저장</h2>
            <p>갤러리에 표시될 제목과 설명을 입력하세요.</p>
            <label className="agent-save-field">
              <span>제목</span>
              <input
                value={saveTitle}
                onChange={(event) => setSaveTitle(event.target.value)}
                maxLength={40}
                placeholder="예: 우주 피하기 게임"
                disabled={savingProject}
              />
            </label>
            <label className="agent-save-field">
              <span>설명</span>
              <textarea
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
                maxLength={500}
                placeholder="게임 방법, 특징, 만든 의도를 적어보세요."
                disabled={savingProject}
              />
            </label>
            <label className="agent-save-field">
              <span>태그 (쉼표로 구분)</span>
              <input
                value={saveTags}
                onChange={(event) => setSaveTags(event.target.value)}
                placeholder="게임, 아케이드, 퀴즈"
                disabled={savingProject}
              />
            </label>
            {saveError && <p className="agent-save-error">{saveError}</p>}
            <div className="agent-save-modal-actions">
              <button
                type="button"
                className="agent-modal-close"
                onClick={() => setShowSaveModal(false)}
                disabled={savingProject}
              >
                취소
              </button>
              <button
                type="button"
                className="ds-btn-primary"
                onClick={handleSaveProject}
                disabled={savingProject || !saveTitle.trim()}
              >
                {savingProject ? "저장 중..." : "저장하고 상세 페이지로 이동"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
