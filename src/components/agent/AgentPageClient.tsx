"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentChatPanel } from "./AgentChatPanel";
import { useAgentChat, type AgentMessage } from "./useAgentChat";
import MonacoEditor from "./MonacoEditor";
import {
  AGENT_MODES,
  AGENT_MODE_DESCRIPTIONS,
  AGENT_MODE_LABELS,
  type AgentMode,
} from "@/lib/agent/types";
import { createEmptyCanvas } from "@/lib/agent/canvas";

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

const MODE_ICONS: Record<AgentMode, string> = {
  arcade: "게임",
  tutor: "학습",
  code: "코드",
  lesson: "수업",
};

function normalizeMessage(raw: {
  id: string;
  role: string;
  content: string;
}): AgentMessage {
  let content = raw.content;
  let code: string | undefined;

  if (raw.role === "assistant") {
    try {
      const parsed = JSON.parse(raw.content) as { message?: unknown; code?: unknown };
      if (typeof parsed.message === "string") content = parsed.message;
      if (typeof parsed.code === "string" && parsed.code.trim()) code = parsed.code;
    } catch {
      // Older messages were stored as plain text.
    }
  }

  return {
    id: raw.id,
    role: raw.role as "user" | "assistant",
    content,
    code,
  };
}

function canvasWithCode(mode: AgentMode, code?: string) {
  const canvas = createEmptyCanvas(mode);
  if (!code) return canvas;
  return {
    ...canvas,
    files: canvas.files.map((file) =>
      file.path === canvas.activeFile ? { ...file, content: code } : file,
    ),
  };
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

  const {
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
  } = useAgentChat({ boardId });

  const handleSend = useCallback(() => {
    if (!sessionId) return;
    void sendMessage(chatInput);
    setChatInput("");
  }, [chatInput, sendMessage, sessionId]);

  const handleNewSession = useCallback(
    async (selectedMode: AgentMode) => {
      setShowNewModal(false);
      setMessages([]);
      setChatInput("");
      await createSession(selectedMode);
    },
    [createSession, setMessages],
  );

  const handleResumeSession = useCallback(
    async (session: SessionSummary) => {
      setShowNewModal(false);
      try {
        const res = await fetch(`/api/agent/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const restoredMessages = (data.messages ?? []).map(normalizeMessage);
        const restoredMode = session.mode as AgentMode;
        const latestCode = [...restoredMessages].reverse().find((message) => message.code)?.code;

        setMode(restoredMode);
        setMessages(restoredMessages);
        setCanvas(data.canvas ?? canvasWithCode(restoredMode, latestCode));
        resumeSession(session.id);
      } catch {
        await handleNewSession(session.mode as AgentMode);
      }
    },
    [handleNewSession, resumeSession, setCanvas, setMessages, setMode],
  );

  const openSaveModal = useCallback(() => {
    const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
    setSaveTitle((current) => current || firstUserMessage?.slice(0, 40) || "나의 AI 게임");
    setSaveDescription((current) => current || "AI 도우미와 함께 만든 프로젝트입니다.");
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
        throw new Error(
          data.error === "bad_request"
            ? "입력값을 확인해 주세요."
            : "프로젝트 저장에 실패했어요.",
        );
      }
      router.push(`${boardHref}/project/${data.projectId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "프로젝트 저장 중 오류가 발생했어요.");
    } finally {
      setSavingProject(false);
    }
  }, [boardHref, boardId, router, saveDescription, saveTags, saveTitle, savingProject, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/agent/sessions?status=active&limit=20")
      .then((res) => res.json())
      .then((data: SessionSummary[]) => setSessions(data))
      .catch(() => {});
  }, [sessionId]);

  const canSave = messages.length >= 2 && !streaming && !!sessionId;
  const previewUrl = useMemo(() => {
    if (!sessionId || !canvas.activeFile) return null;
    return `${boardHref}/agent/preview?session=${sessionId}&file=${encodeURIComponent(canvas.activeFile)}`;
  }, [boardHref, canvas.activeFile, sessionId]);

  return (
    <div className="agent-page">
      <nav className="agent-breadcrumb" aria-label="breadcrumb">
        <Link href={boardHref}>{boardTitle}</Link>
        <span className="agent-breadcrumb-sep">&gt;</span>
        <span>AI 도우미</span>
      </nav>

      <section className="agent-hero">
        <div>
          <h1>AI 도우미</h1>
          <p>게임, 학습, 코딩, 수업 아이디어를 대화로 만들고 바로 실행해보세요.</p>
        </div>
        <div className="agent-hero-actions">
          <Link href={boardHref} className="ds-btn-secondary">
            보드로 돌아가기
          </Link>
          <button type="button" className="ds-btn-primary" onClick={() => setShowNewModal(true)}>
            새 대화
          </button>
        </div>
      </section>

      <div className="agent-layout agent-layout-with-preview">
        <aside className="agent-sidebar">
          <div className="agent-sidebar-head">
            <h3>대화</h3>
            <span className="agent-sidebar-count">{sessions.length}</span>
          </div>
          {sessions.length === 0 ? (
            <p className="agent-sidebar-empty">아직 대화가 없어요. 새 대화를 시작해보세요.</p>
          ) : (
            <div className="agent-sidebar-list">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`agent-sidebar-item ${
                    session.id === sessionId ? "agent-sidebar-item-active" : ""
                  }`}
                  onClick={() => handleResumeSession(session)}
                >
                  <span className="agent-sidebar-item-icon">
                    {MODE_ICONS[session.mode as AgentMode] ?? "AI"}
                  </span>
                  <span className="agent-sidebar-item-info">
                    <span className="agent-sidebar-item-title">
                      {session.title || "제목 없는 대화"}
                    </span>
                    <span className="agent-sidebar-item-meta">
                      {AGENT_MODE_LABELS[session.mode as AgentMode] ?? session.mode} ·{" "}
                      {session.messageCount}개 메시지
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="agent-main">
          {!sessionId && !showNewModal ? (
            <div className="agent-main-empty">
              <p>대화를 선택하거나 새 대화를 시작해 주세요.</p>
            </div>
          ) : (
            <div className="agent-main-split">
              <div className="agent-chat-column">
                {sessionId && (
                  <div className="agent-session-info">
                    <span className="agent-session-mode">{AGENT_MODE_LABELS[mode]}</span>
                    <span className="agent-session-tokens">
                      {tokenCount.in + tokenCount.out} 토큰
                    </span>
                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="agent-preview-link"
                        title="새 창에서 미리보기"
                      >
                        새 창 미리보기
                      </a>
                    )}
                  </div>
                )}

                <div className="agent-canvas-area">
                  <MonacoEditor canvas={canvas} onCanvasChange={updateCanvas} readonly={false} />
                </div>

                {canSave && (
                  <div className="agent-save-bar">
                    <button type="button" className="ds-btn-primary" onClick={openSaveModal}>
                      프로젝트로 저장
                    </button>
                  </div>
                )}
              </div>

              <div className="agent-preview-column">
                <AgentChatPanel
                  messages={messages}
                  streaming={streaming}
                  error={error}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  onSubmit={handleSend}
                  onStopStreaming={stopStreaming}
                />

                {previewUrl && (
                  <div className="agent-mini-preview">
                    <div className="agent-mini-preview-header">
                      <span>실행 미리보기</span>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="agent-preview-refresh"
                        title="새 창에서 열기"
                      >
                        열기
                      </a>
                    </div>
                    <div className="agent-mini-preview-frame">
                      <iframe
                        key={previewUrl}
                        src={previewUrl}
                        sandbox="allow-scripts"
                        title="실행 미리보기"
                        className="agent-preview-iframe"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {showNewModal && !sessionId && (
        <div className="agent-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="agent-modal" onClick={(event) => event.stopPropagation()}>
            <h2>새 대화 시작</h2>
            <p>원하는 모드를 선택해 주세요.</p>
            <div className="agent-mode-grid">
              {AGENT_MODES.map((agentMode) => (
                <button
                  key={agentMode}
                  type="button"
                  className="agent-mode-card"
                  onClick={() => handleNewSession(agentMode)}
                >
                  <span className="agent-mode-card-icon">{MODE_ICONS[agentMode]}</span>
                  <span className="agent-mode-card-label">{AGENT_MODE_LABELS[agentMode]}</span>
                  <span className="agent-mode-card-desc">
                    {AGENT_MODE_DESCRIPTIONS[agentMode]}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="agent-modal-close" onClick={() => setShowNewModal(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div
          className="agent-modal-overlay"
          onClick={() => !savingProject && setShowSaveModal(false)}
        >
          <div className="agent-modal agent-save-modal" onClick={(event) => event.stopPropagation()}>
            <h2>프로젝트로 저장</h2>
            <p>갤러리에 표시할 제목과 설명을 입력해 주세요.</p>
            <label className="agent-save-field">
              <span>제목</span>
              <input
                value={saveTitle}
                onChange={(event) => setSaveTitle(event.target.value)}
                maxLength={40}
                placeholder="예: 우주 달리기 게임"
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
                placeholder="게임, 어드벤처, 퀴즈"
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
