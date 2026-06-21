"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareTab } from "./share/ShareTab";
import { SidePanel } from "./ui/SidePanel";
import {
  BoardThumbnailPicker,
  type ThumbnailMode,
} from "./BoardThumbnailPicker";

export type BoardSection = {
  id: string;
  title: string;
  accessToken: string | null;
};

export type BoardTheme =
  | "pastel-peach"
  | "pastel-mint"
  | "pastel-sky"
  | "pastel-lilac"
  | "pastel-lemon";

type Tab = "basic" | "breakout" | "canva";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  classrooms?: Array<{
    id: string;
    name: string;
    studentCount: number;
  }>;
  initialClassroomId?: string | null;
  initialThumbnailMode?: string | null;
  initialThumbnailUrl?: string | null;
  boardId: string;
  layout: string;
  initialSections: BoardSection[];
  initialAnonymousAuthor?: boolean;
  initialBoardTheme?: BoardTheme;
  initialShareMode?: string;
  initialShareToken?: string | null;
  initialShareShortCode?: string | null;
  initialStreamTitlePrompt?: string;
  initialStreamContentPrompt?: string;
  initialStreamSectionsEnabled?: boolean;
};

const TAB_LABELS: Record<Tab, string> = {
  basic: "기본",
  breakout: "브레이크아웃",
  canva: "Canva 연동",
};

const BOARD_THEME_OPTIONS: Array<{
  value: BoardTheme;
  label: string;
  swatch: string;
}> = [
  {
    value: "pastel-peach",
    label: "복숭아",
    swatch: "linear-gradient(135deg, #fff4ef 0%, #ffe1dc 100%)",
  },
  {
    value: "pastel-mint",
    label: "민트",
    swatch: "linear-gradient(135deg, #f2fff8 0%, #d9f6ea 100%)",
  },
  {
    value: "pastel-sky",
    label: "하늘",
    swatch: "linear-gradient(135deg, #f2f8ff 0%, #dcecff 100%)",
  },
  {
    value: "pastel-lilac",
    label: "라일락",
    swatch: "linear-gradient(135deg, #f8f4ff 0%, #eadfff 100%)",
  },
  {
    value: "pastel-lemon",
    label: "레몬",
    swatch: "linear-gradient(135deg, #fffdf1 0%, #fff1c9 100%)",
  },
];

export function BoardSettingsPanel({
  open,
  onClose,
  title = "",
  classrooms = [],
  initialClassroomId = null,
  initialThumbnailMode = "default",
  initialThumbnailUrl = null,
  boardId,
  layout,
  initialSections,
  initialAnonymousAuthor = false,
  initialBoardTheme = "pastel-sky",
  initialShareMode = "private",
  initialShareToken = null,
  initialShareShortCode = null,
  initialStreamTitlePrompt = "",
  initialStreamContentPrompt = "",
  initialStreamSectionsEnabled = false,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("basic");
  const [sections, setSections] = useState<BoardSection[]>(initialSections);
  const [anonymousAuthor, setAnonymousAuthor] = useState(initialAnonymousAuthor);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(initialBoardTheme);
  const [shareMode, setShareMode] = useState(initialShareMode);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [shareShortCode, setShareShortCode] = useState<string | null>(
    initialShareShortCode,
  );
  const [classroomId, setClassroomId] = useState<string | null>(
    initialClassroomId,
  );
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>(
    normalizeThumbnailMode(initialThumbnailMode),
  );
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    initialThumbnailUrl,
  );
  const [streamTitlePrompt, setStreamTitlePrompt] = useState(
    initialStreamTitlePrompt,
  );
  const [streamContentPrompt, setStreamContentPrompt] = useState(
    initialStreamContentPrompt,
  );
  const [streamSectionsEnabled, setStreamSectionsEnabled] = useState(
    initialStreamSectionsEnabled,
  );
  const tablistId = useId();

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    setSections(initialSections);
    setAnonymousAuthor(initialAnonymousAuthor);
    setBoardTheme(initialBoardTheme);
    setShareMode(initialShareMode);
    setShareToken(initialShareToken);
    setShareShortCode(initialShareShortCode);
    setClassroomId(initialClassroomId);
    setThumbnailMode(normalizeThumbnailMode(initialThumbnailMode));
    setThumbnailUrl(initialThumbnailUrl);
    setStreamTitlePrompt(initialStreamTitlePrompt);
    setStreamContentPrompt(initialStreamContentPrompt);
    setStreamSectionsEnabled(initialStreamSectionsEnabled);
  }, [
    open,
    initialSections,
    initialAnonymousAuthor,
    initialBoardTheme,
    initialShareMode,
    initialShareToken,
    initialShareShortCode,
    initialClassroomId,
    initialThumbnailMode,
    initialThumbnailUrl,
    initialStreamTitlePrompt,
    initialStreamContentPrompt,
    initialStreamSectionsEnabled,
  ]);

  function handleSectionTokenChange(sectionId: string, nextToken: string | null) {
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId ? { ...s, accessToken: nextToken } : s,
      ),
    );
    router.refresh();
  }

  return (
    <SidePanel open={open} onClose={onClose} title="보드 설정">
      <div
        role="tablist"
        aria-label="보드 설정 탭"
        className="side-panel-tabs"
        id={tablistId}
        style={{ margin: "-16px -20px 16px" }}
      >
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${tablistId}-panel-${key}`}
            id={`${tablistId}-tab-${key}`}
            className="side-panel-tab"
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
            {key === "canva" && (
              <span className="board-settings-tab-meta"> (준비 중)</span>
            )}
          </button>
        ))}
      </div>

      {tab === "basic" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-basic`}
          aria-labelledby={`${tablistId}-tab-basic`}
        >
          <BasicTab
            boardId={boardId}
            layout={layout}
            title={title}
            classrooms={classrooms}
            classroomId={classroomId}
            onClassroomIdChange={setClassroomId}
            thumbnailMode={thumbnailMode}
            thumbnailUrl={thumbnailUrl}
            onThumbnailChange={({ mode, url }) => {
              setThumbnailMode(mode);
              setThumbnailUrl(url);
            }}
            anonymousAuthor={anonymousAuthor}
            onAnonymousAuthorChange={setAnonymousAuthor}
            initialShareMode={shareMode}
            initialShareToken={shareToken}
            initialShareShortCode={shareShortCode}
            boardTheme={boardTheme}
            onThemeChange={setBoardTheme}
            streamTitlePrompt={streamTitlePrompt}
            streamContentPrompt={streamContentPrompt}
            onStreamTitlePromptChange={setStreamTitlePrompt}
            onStreamContentPromptChange={setStreamContentPrompt}
            streamSectionsEnabled={streamSectionsEnabled}
            onStreamSectionsEnabledChange={setStreamSectionsEnabled}
          />
        </div>
      )}

      {tab === "breakout" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-breakout`}
          aria-labelledby={`${tablistId}-tab-breakout`}
        >
          <BreakoutTab
            boardId={boardId}
            title={title}
            layout={layout}
            classrooms={classrooms}
            classroomId={classroomId}
            sections={sections}
            streamSectionsEnabled={streamSectionsEnabled}
            streamTitlePrompt={streamTitlePrompt}
            streamContentPrompt={streamContentPrompt}
            onTokenChange={handleSectionTokenChange}
          />
        </div>
      )}

      {tab === "canva" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-canva`}
          aria-labelledby={`${tablistId}-tab-canva`}
        >
          <div className="board-settings-placeholder">
            <span className="board-settings-placeholder-mark" aria-hidden="true">
              Canva
            </span>
            <p>
              준비 중이에요. 곧 이곳에서 보드 단위 Canva 연동 설정을
              관리할 수 있어요.
            </p>
          </div>
        </div>
      )}
    </SidePanel>
  );
}

function BasicTab({
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

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="board-settings-section" aria-labelledby={`settings-${title}`}>
      <h3 id={`settings-${title}`} className="board-settings-section-title">
        {title}
      </h3>
      {children}
    </section>
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

function BreakoutTab({
  boardId,
  title,
  layout,
  classrooms,
  classroomId,
  sections,
  streamSectionsEnabled,
  streamTitlePrompt,
  streamContentPrompt,
  onTokenChange,
}: {
  boardId: string;
  title: string;
  layout: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  sections: BoardSection[];
  streamSectionsEnabled: boolean;
  streamTitlePrompt: string;
  streamContentPrompt: string;
  onTokenChange: (sectionId: string, token: string | null) => void;
}) {
  if (layout === "stream") {
    return (
      <StreamBreakoutCreator
        boardId={boardId}
        title={title}
        classrooms={classrooms}
        classroomId={classroomId}
        sections={sections}
        streamSectionsEnabled={streamSectionsEnabled}
        streamTitlePrompt={streamTitlePrompt}
        streamContentPrompt={streamContentPrompt}
      />
    );
  }

  if (layout !== "columns") {
    return (
      <div className="board-settings-empty">
        <p>
          이 레이아웃에는 섹션이 없어요.
          <br />
          주제별 보드에서만 브레이크아웃 링크를 만들 수 있어요.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="board-settings-empty">
        <p>
          섹션을 먼저 추가해 주세요.
          <br />
          보드의 <strong>+ 섹션 추가</strong> 버튼으로 만들 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="board-settings-list">
        {sections.map((section) => (
          <BreakoutSectionRow
            key={section.id}
            boardId={boardId}
            section={section}
            onTokenChange={onTokenChange}
          />
        ))}
      </div>
      <div className="board-settings-archive-link">
        <a href={`/board/${boardId}/archive`}>지난 세션 아카이브 보기</a>
      </div>
    </>
  );
}

function BreakoutSectionRow({
  boardId,
  section,
  onTokenChange,
}: {
  boardId: string;
  section: BoardSection;
  onTokenChange: (sectionId: string, token: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const inputId = useId();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const token = section.accessToken;
  const sharePath = token
    ? `/board/${boardId}/s/${section.id}?token=${encodeURIComponent(token)}`
    : "";
  const absolute = sharePath ? (origin ? `${origin}${sharePath}` : sharePath) : "";

  async function mutate(confirmMessage: string | null) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/sections/${section.id}/share`, {
        method: "POST",
      });
      if (!res.ok) {
        setStatus("생성 실패");
        return;
      }
      const data = await res.json();
      const next = data.section?.accessToken ?? null;
      onTokenChange(section.id, next);
      setStatus("링크가 생성되었어요.");
    } catch {
      setStatus("생성 실패");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!absolute) return;
    try {
      await navigator.clipboard.writeText(absolute);
      setStatus("복사했어요.");
      window.setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("복사에 실패했어요. 수동으로 복사해 주세요.");
    }
  }

  return (
    <article className="board-settings-row">
      <header className="board-settings-row-title">
        <span className="board-settings-row-name">{section.title}</span>
        <span
          className={`board-settings-row-badge ${token ? "on" : "off"}`}
          aria-label={token ? "공유 링크 있음" : "공유 링크 없음"}
        >
          {token ? "링크 있음" : "링크 없음"}
        </span>
      </header>
      {token ? (
        <div className="share-actions">
          <input
            id={inputId}
            className="share-url-input"
            type="text"
            readOnly
            value={absolute}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`${section.title} 공유 URL`}
          />
          <button
            type="button"
            className="column-add-btn"
            onClick={copy}
            disabled={busy}
          >
            복사
          </button>
          <button
            type="button"
            className="column-inline-add"
            onClick={() =>
              mutate("새 링크를 만들면 이전 링크는 즉시 무효화돼요. 진행할까요?")
            }
            disabled={busy}
          >
            새로 발급
          </button>
        </div>
      ) : (
        <div className="share-actions">
          <button
            type="button"
            className="column-add-btn"
            onClick={() => mutate(null)}
            disabled={busy}
          >
            {busy ? "생성 중..." : "공유 링크 생성"}
          </button>
        </div>
      )}
      <p className="share-status" aria-live="polite">
        {status}
      </p>
    </article>
  );
}

function StreamBreakoutCreator({
  boardId,
  title,
  classrooms,
  classroomId,
  sections,
  streamSectionsEnabled,
  streamTitlePrompt,
  streamContentPrompt,
}: {
  boardId: string;
  title: string;
  classrooms: Array<{ id: string; name: string; studentCount: number }>;
  classroomId: string | null;
  sections: BoardSection[];
  streamSectionsEnabled: boolean;
  streamTitlePrompt: string;
  streamContentPrompt: string;
}) {
  const router = useRouter();
  const [groupCount, setGroupCount] = useState(4);
  const [groupCapacity, setGroupCapacity] = useState(6);
  const [visibility, setVisibility] = useState<"own-only" | "peek-others">(
    "own-only",
  );
  const [targetClassroomId, setTargetClassroomId] = useState(classroomId ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const sectionCount = streamSectionsEnabled && sections.length > 0 ? sections.length : 1;
  const hasPrompt = Boolean(streamTitlePrompt.trim() || streamContentPrompt.trim());

  async function createBreakout() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/boards/${boardId}/breakout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupCount,
          groupCapacity,
          visibilityOverride: visibility,
          classroomId: targetClassroomId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`생성 실패: ${data.error ?? res.status}`);
        return;
      }
      const data = (await res.json()) as { board?: { slug?: string; id?: string } };
      const next = data.board?.id ?? data.board?.slug;
      if (next) router.push(`/board/${encodeURIComponent(next)}`);
    } catch {
      setStatus("생성 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board-settings-control-stack">
      <div className="board-settings-row">
        <div className="board-settings-row-title">
          <span className="board-settings-row-name">
            {title || "제목 없음"} 브레이크아웃
          </span>
          <span className="board-settings-row-badge on">
            {groupCount}모둠
          </span>
        </div>
        <p className="board-settings-row-note">
          현재 스트림 양식의 섹션 {sectionCount}개와 글쓰기 안내
          {hasPrompt ? "" : " 없이"}를 모둠별로 복제합니다.
        </p>
      </div>

      <label className="modal-field-label" htmlFor={`breakout-group-count-${boardId}`}>
        모둠 수
      </label>
      <input
        id={`breakout-group-count-${boardId}`}
        type="number"
        min={1}
        max={10}
        className="modal-input"
        value={groupCount}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) setGroupCount(Math.max(1, Math.min(10, value)));
        }}
        disabled={busy}
      />

      <label className="modal-field-label" htmlFor={`breakout-capacity-${boardId}`}>
        모둠 정원
      </label>
      <input
        id={`breakout-capacity-${boardId}`}
        type="number"
        min={1}
        max={6}
        className="modal-input"
        value={groupCapacity}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) setGroupCapacity(Math.max(1, Math.min(6, value)));
        }}
        disabled={busy}
      />

      <label className="modal-field-label" htmlFor={`breakout-visibility-${boardId}`}>
        열람 방식
      </label>
      <select
        id={`breakout-visibility-${boardId}`}
        className="modal-select"
        value={visibility}
        onChange={(event) =>
          setVisibility(event.target.value as "own-only" | "peek-others")
        }
        disabled={busy}
      >
        <option value="own-only">자기 모둠만</option>
        <option value="peek-others">다른 모둠도 보기</option>
      </select>

      {classrooms.length > 0 && (
        <>
          <label className="modal-field-label" htmlFor={`breakout-classroom-${boardId}`}>
            학급 연결
          </label>
          <select
            id={`breakout-classroom-${boardId}`}
            className="modal-select"
            value={targetClassroomId}
            onChange={(event) => setTargetClassroomId(event.target.value)}
            disabled={busy}
          >
            <option value="">학급 연결 없음</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name} (학생 {classroom.studentCount}명)
              </option>
            ))}
          </select>
        </>
      )}

      <div className="stream-guidance-actions">
        <button
          type="button"
          className="stream-guidance-save"
          onClick={() => void createBreakout()}
          disabled={busy}
        >
          {busy ? "만드는 중..." : "브레이크아웃 만들기"}
        </button>
        {status && (
          <span className="stream-guidance-error" aria-live="polite">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

function normalizeThumbnailMode(value: string | null | undefined): ThumbnailMode {
  if (value === "custom") return value;
  return "default";
}
