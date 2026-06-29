"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareTab } from "../share/ShareTab";
import {
  BoardThumbnailPicker,
  type ThumbnailMode,
} from "../BoardThumbnailPicker";
import { BOARD_THEME_OPTIONS } from "./constants";
import { SettingsSection } from "./SettingsSection";
import type { BoardTheme } from "./types";

export function BasicTab({
  boardId,
  layout,
  title,
  classrooms,
  classroomId,
  onClassroomIdChange,
  thumbnailMode,
  thumbnailUrl,
  onThumbnailChange,
  anonymousAuthor,
  onAnonymousAuthorChange,
  initialShareMode,
  initialShareToken,
  initialShareShortCode,
  boardTheme,
  onThemeChange,
  streamTitlePrompt,
  streamContentPrompt,
  onStreamTitlePromptChange,
  onStreamContentPromptChange,
  streamSectionsEnabled,
  onStreamSectionsEnabledChange,
}: {
  boardId: string;
  layout: string;
  title: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  onClassroomIdChange: (next: string | null) => void;
  thumbnailMode: ThumbnailMode;
  thumbnailUrl: string | null;
  onThumbnailChange: (next: { mode: ThumbnailMode; url: string | null }) => void;
  anonymousAuthor: boolean;
  onAnonymousAuthorChange: (next: boolean) => void;
  initialShareMode: string;
  initialShareToken: string | null;
  initialShareShortCode: string | null;
  boardTheme: BoardTheme;
  onThemeChange: (next: BoardTheme) => void;
  streamTitlePrompt: string;
  streamContentPrompt: string;
  onStreamTitlePromptChange: (next: string) => void;
  onStreamContentPromptChange: (next: string) => void;
  streamSectionsEnabled: boolean;
  onStreamSectionsEnabledChange: (next: boolean) => void;
}) {
  return (
    <div className="board-settings-basic">
      <SettingsSection title="기본 정보">
        <BasicInfoTab
          boardId={boardId}
          layout={layout}
          title={title}
          classrooms={classrooms}
          classroomId={classroomId}
          onClassroomIdChange={onClassroomIdChange}
          thumbnailMode={thumbnailMode}
          thumbnailUrl={thumbnailUrl}
          onThumbnailChange={onThumbnailChange}
        />
      </SettingsSection>
      <SettingsSection title="참여">
        <EngagementTab
          boardId={boardId}
          anonymousAuthor={anonymousAuthor}
          onChange={onAnonymousAuthorChange}
        />
      </SettingsSection>
      {layout === "stream" && (
        <SettingsSection title="글쓰기 안내">
          <StreamGuidanceTab
            boardId={boardId}
            titlePrompt={streamTitlePrompt}
            contentPrompt={streamContentPrompt}
            onTitlePromptChange={onStreamTitlePromptChange}
            onContentPromptChange={onStreamContentPromptChange}
          />
        </SettingsSection>
      )}
      {layout === "stream" && (
        <SettingsSection title="섹션">
          <StreamSectionsToggle
            boardId={boardId}
            enabled={streamSectionsEnabled}
            onChange={onStreamSectionsEnabledChange}
          />
        </SettingsSection>
      )}
      <SettingsSection title="공유">
        <ShareTab
          boardId={boardId}
          initialShareMode={initialShareMode}
          initialShareToken={initialShareToken}
          initialShareShortCode={initialShareShortCode}
        />
      </SettingsSection>
      <SettingsSection title="테마">
        <ThemeTab
          boardId={boardId}
          value={boardTheme}
          onChange={onThemeChange}
        />
      </SettingsSection>
    </div>
  );
}

function BasicInfoTab({
  boardId,
  layout,
  title,
  classrooms,
  classroomId,
  onClassroomIdChange,
  thumbnailMode,
  thumbnailUrl,
  onThumbnailChange,
}: {
  boardId: string;
  layout: string;
  title: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  onClassroomIdChange: (next: string | null) => void;
  thumbnailMode: ThumbnailMode;
  thumbnailUrl: string | null;
  onThumbnailChange: (next: { mode: ThumbnailMode; url: string | null }) => void;
}) {
  const router = useRouter();
  const [titleDraft, setTitleDraft] = useState(title);
  const [classroomDraft, setClassroomDraft] = useState<string | null>(classroomId);
  const [thumbnailDraft, setThumbnailDraft] = useState<{
    mode: ThumbnailMode;
    url: string | null;
  }>({ mode: thumbnailMode, url: thumbnailUrl });
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; at: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    setTitleDraft(title);
    setClassroomDraft(classroomId);
    setThumbnailDraft({ mode: thumbnailMode, url: thumbnailUrl });
    setSaveState({ status: "idle" });
  }, [title, classroomId, thumbnailMode, thumbnailUrl]);

  const titleDirty = titleDraft.trim() !== title;
  const classroomDirty = classroomDraft !== classroomId;
  const thumbnailDirty =
    thumbnailDraft.mode !== thumbnailMode ||
    thumbnailDraft.url !== thumbnailUrl;
  const canSave = titleDirty || classroomDirty || thumbnailDirty;
  const canEditClassroom =
    layout !== "assignment" || classroomId == null;
  const shouldSyncAssignmentClassroom =
    layout === "assignment" && classroomId == null && Boolean(classroomDraft);

  async function save() {
    if (!canSave) return;
    setSaveState({ status: "saving" });
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: titleDraft.trim() || "제목 없음",
          ...(layout === "assignment" ? {} : { classroomId: classroomDraft }),
          thumbnailMode:
            thumbnailDraft.mode === "custom" && thumbnailDraft.url
              ? "custom"
              : "default",
          thumbnailUrl:
            thumbnailDraft.mode === "custom" && thumbnailDraft.url
              ? thumbnailDraft.url
              : null,
        }),
      });
      if (!res.ok) {
        setSaveState({ status: "error", message: "저장에 실패했어요." });
        return;
      }
      if (shouldSyncAssignmentClassroom) {
        const syncRes = await fetch(`/api/boards/${boardId}/roster-sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ classroomId: classroomDraft }),
        });
        if (!syncRes.ok) {
          setSaveState({ status: "error", message: "학급 연결에 실패했어요." });
          return;
        }
      }
      onClassroomIdChange(classroomDraft);
      onThumbnailChange(thumbnailDraft);
      router.refresh();
      setSaveState({ status: "saved", at: Date.now() });
    } catch {
      setSaveState({ status: "error", message: "저장에 실패했어요." });
    }
  }

  return (
    <div className="board-settings-control-stack">
      <label className="modal-field-label" htmlFor={`basic-title-${boardId}`}>
        보드 이름
      </label>
      <input
        id={`basic-title-${boardId}`}
        type="text"
        className="modal-input"
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value.slice(0, 200))}
        maxLength={200}
        disabled={saveState.status === "saving"}
      />

      <label className="modal-field-label" htmlFor={`basic-classroom-${boardId}`}>
        학급 연결
      </label>
      <select
        id={`basic-classroom-${boardId}`}
        className="modal-select"
        value={classroomDraft ?? ""}
        onChange={(e) => setClassroomDraft(e.target.value || null)}
        disabled={saveState.status === "saving" || !canEditClassroom}
      >
        <option value="" disabled={layout === "dj-queue"}>
          학급 연결 없음
        </option>
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} (학생 {c.studentCount}명)
          </option>
        ))}
      </select>

      <label className="modal-field-label">대시보드 썸네일</label>
      <BoardThumbnailPicker
        layout={layout}
        mode={thumbnailDraft.mode}
        url={thumbnailDraft.url}
        onChange={setThumbnailDraft}
        disabled={saveState.status === "saving"}
      />

      <div className="stream-guidance-actions">
        <button
          type="button"
          className="stream-guidance-save"
          onClick={() => void save()}
          disabled={!canSave || saveState.status === "saving"}
        >
          {saveState.status === "saving" ? "저장 중..." : "저장"}
        </button>
        {saveState.status === "saved" && (
          <span className="stream-guidance-status" aria-live="polite">
            저장했어요.
          </span>
        )}
        {saveState.status === "error" && (
          <span className="stream-guidance-error" aria-live="polite">
            {saveState.message}
          </span>
        )}
      </div>
    </div>
  );
}

function EngagementTab({
  boardId,
  anonymousAuthor,
  onChange,
}: {
  boardId: string;
  anonymousAuthor: boolean;
  onChange: (next: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !anonymousAuthor;
    setBusy(true);
    setErr(null);
    onChange(next);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonymousAuthor: next }),
      });
      if (!res.ok) {
        onChange(!next);
        setErr("저장에 실패했어요.");
      }
    } catch {
      onChange(!next);
      setErr("저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board-settings-control-stack">
      <label className="board-settings-check-row">
        <input
          type="checkbox"
          checked={anonymousAuthor}
          onChange={toggle}
          disabled={busy}
        />
        <span className="board-settings-check-copy">
          <span className="board-settings-check-title">작성자 익명 표시</span>
          <span className="board-settings-check-desc">
            카드 작성자와 댓글 작성자 이름을 모두 익명으로 보여줘요. 좋아요와
            댓글 수는 그대로 유지돼요.
          </span>
        </span>
      </label>
      {err && <p className="board-settings-error">{err}</p>}
    </div>
  );
}

function StreamGuidanceTab({
  boardId,
  titlePrompt,
  contentPrompt,
  onTitlePromptChange,
  onContentPromptChange,
}: {
  boardId: string;
  titlePrompt: string;
  contentPrompt: string;
  onTitlePromptChange: (next: string) => void;
  onContentPromptChange: (next: string) => void;
}) {
  const router = useRouter();
  const [titleDraft, setTitleDraft] = useState(titlePrompt);
  const [contentDraft, setContentDraft] = useState(contentPrompt);
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; at: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  // Sync drafts when the panel reopens or the upstream state changes.
  useEffect(() => {
    setTitleDraft(titlePrompt);
    setContentDraft(contentPrompt);
  }, [titlePrompt, contentPrompt]);

  const titleDirty = titleDraft !== titlePrompt;
  const contentDirty = contentDraft !== contentPrompt;
  const canSave = titleDirty || contentDirty;

  async function save() {
    if (!canSave) return;
    setSaveState({ status: "saving" });
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          streamTitlePrompt: titleDraft.slice(0, 200),
          streamContentPrompt: contentDraft.slice(0, 1000),
        }),
      });
      if (!res.ok) {
        setSaveState({ status: "error", message: "저장에 실패했어요." });
        return;
      }
      onTitlePromptChange(titleDraft.slice(0, 200));
      onContentPromptChange(contentDraft.slice(0, 1000));
      router.refresh();
      setSaveState({ status: "saved", at: Date.now() });
    } catch {
      setSaveState({ status: "error", message: "저장에 실패했어요." });
    }
  }

  return (
    <div className="board-settings-control-stack">
      <div className="stream-guidance-field">
        <label className="stream-guidance-label" htmlFor={`sg-title-${boardId}`}>
          제목 안내
        </label>
        <input
          id={`sg-title-${boardId}`}
          type="text"
          className="stream-guidance-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value.slice(0, 200))}
          placeholder="예: 0번 자기 이름: 제목 쓰기"
          maxLength={200}
          disabled={saveState.status === "saving"}
        />
        <span className="stream-guidance-counter">
          {titleDraft.length}/200
        </span>
      </div>
      <div className="stream-guidance-field">
        <label
          className="stream-guidance-label"
          htmlFor={`sg-content-${boardId}`}
        >
          본문 안내
        </label>
        <textarea
          id={`sg-content-${boardId}`}
          className="stream-guidance-textarea"
          value={contentDraft}
          onChange={(e) => setContentDraft(e.target.value.slice(0, 1000))}
          placeholder="예: 자료를 조사하고 설명하는 글의 구조에 맞게 설명하는 글쓰기"
          maxLength={1000}
          rows={4}
          disabled={saveState.status === "saving"}
        />
        <span className="stream-guidance-counter">
          {contentDraft.length}/1000
        </span>
      </div>
      <div className="stream-guidance-actions">
        <button
          type="button"
          className="stream-guidance-save"
          onClick={() => void save()}
          disabled={!canSave || saveState.status === "saving"}
        >
          {saveState.status === "saving" ? "저장 중..." : "저장"}
        </button>
        {saveState.status === "saved" && (
          <span className="stream-guidance-status" aria-live="polite">
            저장했어요.
          </span>
        )}
        {saveState.status === "error" && (
          <span className="stream-guidance-error" aria-live="polite">
            {saveState.message}
          </span>
        )}
      </div>
    </div>
  );
}

function StreamSectionsToggle({
  boardId,
  enabled,
  onChange,
}: {
  boardId: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setErr(null);
    onChange(next);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streamSectionsEnabled: next }),
      });
      if (!res.ok) {
        onChange(!next);
        setErr("저장에 실패했어요.");
        return;
      }
      router.refresh();
    } catch {
      onChange(!next);
      setErr("저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board-settings-control-stack">
      <button
        type="button"
        className="board-settings-check-row board-settings-check-row-compact board-settings-switch-row"
        role="switch"
        aria-checked={enabled}
        onClick={() => {
          if (!busy) void toggle();
        }}
        disabled={busy}
      >
        <span className="board-settings-switch-track" aria-hidden="true">
          <span className="board-settings-switch-thumb" />
        </span>
        <span className="board-settings-check-copy">
          <span className="board-settings-check-title">섹션별로 게시물 그룹화</span>
        </span>
      </button>
      {err && <p className="board-settings-error">{err}</p>}
    </div>
  );
}

function ThemeTab({
  boardId,
  value,
  onChange,
}: {
  boardId: string;
  value: BoardTheme;
  onChange: (next: BoardTheme) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<BoardTheme | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectTheme(next: BoardTheme) {
    if (next === value || busy) return;
    const prev = value;
    onChange(next);
    setBusy(next);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardTheme: next }),
      });
      if (!res.ok) {
        onChange(prev);
        setError("테마 저장에 실패했어요.");
        return;
      }
      router.refresh();
    } catch {
      onChange(prev);
      setError("테마 저장에 실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="board-settings-control-stack">
      <div className="board-theme-grid">
        {BOARD_THEME_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={`board-theme-option ${selected ? "is-selected" : ""}`}
              onClick={() => void selectTheme(option.value)}
              aria-pressed={selected}
              disabled={busy !== null}
            >
              <span
                className="board-theme-swatch"
                style={{ background: option.swatch }}
                aria-hidden="true"
              />
              <span className="board-theme-copy">
                <span className="board-theme-label">{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="board-settings-error">{error}</p>}
    </div>
  );
}
