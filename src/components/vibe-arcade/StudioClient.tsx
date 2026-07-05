"use client";

// 학생 전용 Studio 풀페이지 (2026-04-23).
// 기존 VibeStudio 모달을 대체. 좌: Claude 챗, 우: 실시간 프리뷰.
// 카드 진입 대신 /board/[id]/vibe-arcade/studio 로 이동해 렌더된다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildStudioSrcDoc } from "@/lib/vibe-arcade/sandbox-renderer";
import MonacoEditor from "@/components/agent/MonacoEditor";
import type { CodeCanvas } from "@/lib/agent/types";

type ChatMessage = { role: "user" | "assistant"; content: string; streaming?: boolean };
type VibeCategory = "game" | "quiz" | "art" | "sim";

const VIBE_FILE_PATHS = {
  html: "index.html",
  css: "styles.css",
  js: "script.js",
} as const;

const TAG_OPTIONS = ["게임", "퀴즈", "시뮬", "아트", "기타"] as const;
type Tag = (typeof TAG_OPTIONS)[number];

const CATEGORY_OPTIONS: ReadonlyArray<{
  key: VibeCategory;
  emoji: string;
  label: string;
  initialMessage: string;
}> = [
  { key: "game", emoji: "🎮", label: "게임", initialMessage: "게임을 만들어 보고 싶어요." },
  { key: "quiz", emoji: "🧩", label: "퀴즈", initialMessage: "퀴즈를 만들어 보고 싶어요." },
  { key: "art", emoji: "🎨", label: "아트", initialMessage: "인터랙티브한 시각 작품을 만들고 싶어요." },
  { key: "sim", emoji: "🧪", label: "시뮬", initialMessage: "간단한 시뮬레이션을 만들고 싶어요." },
];

function extractCodeBlocks(text: string): { html?: string; css?: string; js?: string } {
  const blocks: { html?: string; css?: string; js?: string } = {};
  const re = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lang = (m[1] ?? "").toLowerCase();
    const body = m[2].replace(/\n$/, "");
    if (lang.startsWith("html") || lang === "htm") blocks.html = body;
    else if (lang === "css") blocks.css = body;
    else if (lang === "js" || lang === "javascript" || lang === "mjs" || lang === "jsx")
      blocks.js = body;
  }
  // 폴백: 펜스를 빼먹고 전체 응답에 HTML 문서가 실려 온 경우 살려내기.
  if (!blocks.html && /<!doctype html|<html[\s>]/i.test(text)) {
    const m2 = text.match(/<!doctype html[\s\S]*?<\/html\s*>|<html[\s\S]*?<\/html\s*>/i);
    if (m2) blocks.html = m2[0];
  }
  return blocks;
}

type ExistingProject = {
  id: string;
  title: string;
  moderationStatus: string;
  moderationNote: string | null;
};

type Props = {
  boardId: string;
  boardHref: string;
  studentId: string;
  studentName: string;
  existingProject: ExistingProject | null;
};

export function StudioClient({ boardId, boardHref, studentName, existingProject }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(existingProject?.title ?? "");
  const [htmlContent, setHtmlContent] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [jsContent, setJsContent] = useState("");
  const [tag, setTag] = useState<Tag>("게임");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissedStarters, setDismissedStarters] = useState(false);
  const [category, setCategory] = useState<VibeCategory | null>(null);
  const [previewTab, setPreviewTab] = useState<"preview" | "code">("preview");
  const [activeCodeFile, setActiveCodeFile] = useState<string>(VIBE_FILE_PATHS.html);
  const abortRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!existingProject) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/vibe/projects/${existingProject.id}`);
        if (!res.ok) throw new Error(`load ${res.status}`);
        const data = (await res.json()) as {
          title: string;
          htmlContent: string;
          cssContent: string;
          jsContent: string;
          tags: string;
        };
        if (cancelled) return;
        setTitle(data.title);
        setHtmlContent(data.htmlContent);
        setCssContent(data.cssContent ?? "");
        setJsContent(data.jsContent ?? "");
        try {
          const parsed = JSON.parse(data.tags);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const first = parsed[0];
            if (TAG_OPTIONS.includes(first as Tag)) setTag(first as Tag);
          }
        } catch {
          /* ignore malformed */
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingProject]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // 새 메시지가 붙으면 챗 로그를 바닥으로 스크롤. streaming 중에도 동작.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const srcDoc = useMemo(
    () => buildStudioSrcDoc({ htmlContent, cssContent, jsContent }),
    [htmlContent, cssContent, jsContent],
  );

  // Keep the code editor in the same html/css/js shape that VibeProject stores.
  const codeCanvas = useMemo<CodeCanvas>(
    () => ({
      files: [
        { path: VIBE_FILE_PATHS.html, language: "html", content: htmlContent },
        { path: VIBE_FILE_PATHS.css, language: "css", content: cssContent },
        { path: VIBE_FILE_PATHS.js, language: "javascript", content: jsContent },
      ],
      activeFile: activeCodeFile,
      selection: null,
      baseVersion: 0,
    }),
    [activeCodeFile, cssContent, htmlContent, jsContent],
  );

  const handleCanvasChange = useCallback((nextCanvas: CodeCanvas) => {
    setActiveCodeFile(nextCanvas.activeFile);

    const nextHtml =
      nextCanvas.files.find((file) => file.path === VIBE_FILE_PATHS.html)?.content ?? "";
    const nextCss =
      nextCanvas.files.find((file) => file.path === VIBE_FILE_PATHS.css)?.content ?? "";
    const nextJs =
      nextCanvas.files.find((file) => file.path === VIBE_FILE_PATHS.js)?.content ?? "";

    setHtmlContent((current) => (current === nextHtml ? current : nextHtml));
    setCssContent((current) => (current === nextCss ? current : nextCss));
    setJsContent((current) => (current === nextJs ? current : nextJs));
  }, []);

  async function sendChat(
    overrideText?: string,
    overrideCategory?: VibeCategory | null,
  ) {
    const trimmed = (overrideText ?? chatInput).trim();
    if (!trimmed || streaming) return;
    const effectiveCategory =
      overrideCategory !== undefined ? overrideCategory : category;
    setChatInput("");
    setDismissedStarters(true);
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setMessages((m) => [...m, { role: "assistant", content: "", streaming: true }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/vibe/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          sessionId,
          userMessage: trimmed,
          category: effectiveCategory ?? undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => `http ${res.status}`));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const frames = buffered.split("\n\n");
        buffered = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.startsWith("data:")) continue;
          const json = frame.slice(5).trim();
          if (!json) continue;
          let parsed: { type?: string; id?: string; text?: string; message?: string };
          try {
            parsed = JSON.parse(json);
          } catch {
            continue;
          }
          if (parsed.type === "session" && parsed.id) setSessionId(parsed.id);
          if (parsed.type === "delta" && parsed.text) {
            assistantText += parsed.text;
            setMessages((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last && last.streaming) {
                next[next.length - 1] = { ...last, content: assistantText };
              }
              return next;
            });
          }
          if (parsed.type === "error") {
            throw new Error(parsed.message ?? "stream_error");
          }
        }
      }
      const extracted = extractCodeBlocks(assistantText);
      if (extracted.html !== undefined) setHtmlContent(extracted.html);
      if (extracted.css !== undefined) setCssContent(extracted.css);
      if (extracted.js !== undefined) setJsContent(extracted.js);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setMessages((m) => [...m, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally {
      setStreaming(false);
      setMessages((m) => m.map((msg) => (msg.streaming ? { ...msg, streaming: false } : msg)));
    }
  }

  async function handleSave() {
    if (!sessionId) {
      setSaveError("먼저 Claude와 대화해서 작품을 만들어 주세요.");
      return;
    }
    if (!title.trim()) {
      setSaveError("제목을 입력해 주세요.");
      return;
    }
    if (!htmlContent.trim()) {
      setSaveError("작품이 아직 없어요. Claude 에게 만들고 싶은 걸 더 구체적으로 요청해 주세요.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/vibe/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          sessionId,
          title: title.trim(),
          description: "",
          htmlContent,
          cssContent,
          jsContent,
          tags: [tag],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `save ${res.status}`);
      }
      // 저장 성공 → 보드로 복귀
      router.push(boardHref);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const showStarters =
    messages.length === 0 && !existingProject && !dismissedStarters;
  const showHint = messages.length === 0 && !showStarters;

  return (
    <main className="va-studio-page">
      <header className="va-studio-bar">
        <Link href={boardHref} className="va-studio-back" aria-label="보드로 돌아가기">
          ← 보드
        </Link>
        <div className="va-studio-bar-center">
          <input
            type="text"
            className="va-studio-title"
            placeholder="작품 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
          />
          <span className="va-studio-author">by {studentName}</span>
        </div>
        <div className="va-studio-bar-actions">
          <label className="va-studio-tag">
            태그
            <select value={tag} onChange={(e) => setTag(e.target.value as Tag)}>
              {TAG_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="va-studio-submit"
            onClick={handleSave}
            disabled={saving || streaming}
          >
            {saving ? "저장 중…" : existingProject ? "다시 제출" : "제출하기"}
          </button>
        </div>
      </header>

      {(loadError || saveError) && (
        <div className="va-studio-err" role="alert">
          {loadError ? `불러오기 실패: ${loadError}` : ""}
          {saveError ? `저장 실패: ${saveError}` : ""}
        </div>
      )}

      <section className="va-studio-grid">
        <div className="va-studio-chat">
          <div className="va-studio-chat-log" ref={logRef} aria-live="polite">
            {showStarters && (
              <div className="vs-starter-grid" role="group" aria-label="시작 분야 선택">
                <p className="vs-starter-title">무엇을 개발해 보시겠어요?</p>
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="vs-starter-card"
                    disabled={streaming}
                    onClick={() => {
                      setCategory(c.key);
                      void sendChat(c.initialMessage, c.key);
                    }}
                  >
                    <span className="vs-starter-emoji" aria-hidden>{c.emoji}</span>
                    <span className="vs-starter-label">{c.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="vs-starter-card vs-starter-custom"
                  onClick={() => {
                    setDismissedStarters(true);
                    requestAnimationFrame(() => chatInputRef.current?.focus());
                  }}
                >
                  <span className="vs-starter-emoji" aria-hidden>✏️</span>
                  <span className="vs-starter-label">직접 입력하기</span>
                </button>
              </div>
            )}
            {showHint && (
              <p className="vs-chat-hint">만들고 싶은 작품을 자유롭게 설명해 주세요.</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`vs-chat-msg vs-chat-msg-${m.role}${m.streaming ? " is-streaming" : ""}`}
              >
                {m.content}
              </div>
            ))}
          </div>
          <form
            className="va-studio-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <textarea
              ref={chatInputRef}
              className="va-studio-chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="요청을 입력하고 Enter"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat();
                }
              }}
              disabled={streaming}
            />
            <button
              type="submit"
              className="va-studio-chat-send"
              disabled={streaming || chatInput.trim().length === 0}
            >
              {streaming ? "전송 중…" : "보내기"}
            </button>
          </form>
        </div>

        <div className="va-studio-preview">
          <div className="va-studio-preview-head" role="tablist" aria-label="프리뷰 탭">
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "preview"}
              className={`va-studio-preview-tab${previewTab === "preview" ? " is-active" : ""}`}
              onClick={() => setPreviewTab("preview")}
            >
              미리보기
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === "code"}
              className={`va-studio-preview-tab${previewTab === "code" ? " is-active" : ""}`}
              onClick={() => setPreviewTab("code")}
            >
              코드
            </button>
          </div>
          {previewTab === "preview" ? (
            <iframe
              title="vibe-studio-preview"
              className="va-studio-iframe"
              srcDoc={srcDoc}
              sandbox="allow-scripts"
            />
          ) : (
            <div className="va-studio-code-editor">
              <MonacoEditor
                canvas={codeCanvas}
                onCanvasChange={handleCanvasChange}
                readonly={streaming}
              />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
