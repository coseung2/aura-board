"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareTab } from "./share/ShareTab";
import { SidePanel } from "./ui/SidePanel";

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
  boardId: string;
  layout: string;
  initialSections: BoardSection[];
  initialAnonymousAuthor?: boolean;
  initialBoardTheme?: BoardTheme;
  initialShareMode?: string;
  initialShareToken?: string | null;
  initialShareShortCode?: string | null;
};

const TAB_LABELS: Record<Tab, string> = {
  basic: "기본",
  breakout: "브레이크아웃",
  canva: "Canva 연동",
};

const BOARD_THEME_OPTIONS: Array<{
  value: BoardTheme;
  label: string;
  tone: string;
  swatch: string;
}> = [
  {
    value: "pastel-peach",
    label: "복숭아",
    tone: "핑크 코랄",
    swatch: "linear-gradient(135deg, #fff4ef 0%, #ffe1dc 100%)",
  },
  {
    value: "pastel-mint",
    label: "민트",
    tone: "민트 그린",
    swatch: "linear-gradient(135deg, #f2fff8 0%, #d9f6ea 100%)",
  },
  {
    value: "pastel-sky",
    label: "하늘",
    tone: "소프트 블루",
    swatch: "linear-gradient(135deg, #f2f8ff 0%, #dcecff 100%)",
  },
  {
    value: "pastel-lilac",
    label: "라일락",
    tone: "연보라",
    swatch: "linear-gradient(135deg, #f8f4ff 0%, #eadfff 100%)",
  },
  {
    value: "pastel-lemon",
    label: "레몬",
    tone: "옐로",
    swatch: "linear-gradient(135deg, #fffdf1 0%, #fff1c9 100%)",
  },
];

export function BoardSettingsPanel({
  open,
  onClose,
  boardId,
  layout,
  initialSections,
  initialAnonymousAuthor = false,
  initialBoardTheme = "pastel-sky",
  initialShareMode = "private",
  initialShareToken = null,
  initialShareShortCode = null,
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
  }, [
    open,
    initialSections,
    initialAnonymousAuthor,
    initialBoardTheme,
    initialShareMode,
    initialShareToken,
    initialShareShortCode,
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
            anonymousAuthor={anonymousAuthor}
            onAnonymousAuthorChange={setAnonymousAuthor}
            initialShareMode={shareMode}
            initialShareToken={shareToken}
            initialShareShortCode={shareShortCode}
            boardTheme={boardTheme}
            onThemeChange={setBoardTheme}
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
            layout={layout}
            sections={sections}
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
  anonymousAuthor,
  onAnonymousAuthorChange,
  initialShareMode,
  initialShareToken,
  initialShareShortCode,
  boardTheme,
  onThemeChange,
}: {
  boardId: string;
  anonymousAuthor: boolean;
  onAnonymousAuthorChange: (next: boolean) => void;
  initialShareMode: string;
  initialShareToken: string | null;
  initialShareShortCode: string | null;
  boardTheme: BoardTheme;
  onThemeChange: (next: BoardTheme) => void;
}) {
  return (
    <div className="board-settings-basic">
      <SettingsSection title="참여">
        <EngagementTab
          boardId={boardId}
          anonymousAuthor={anonymousAuthor}
          onChange={onAnonymousAuthorChange}
        />
      </SettingsSection>
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
      <p className="section-panel-notice" style={{ marginTop: 0 }}>
        보드 안의 카드와 댓글 작성자 표시 방식을 조절해요.
      </p>
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
      <p className="section-panel-notice" style={{ marginTop: 0 }}>
        보드 배경에 어울리는 파스텔 테마를 골라요.
      </p>
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
                <span className="board-theme-tone">{option.tone}</span>
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
  layout,
  sections,
  onTokenChange,
}: {
  boardId: string;
  layout: string;
  sections: BoardSection[];
  onTokenChange: (sectionId: string, token: string | null) => void;
}) {
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
      <p className="section-panel-notice" style={{ marginTop: 0 }}>
        각 섹션별 모둠 모드 링크를 관리해요. 링크를 공유하면 해당 섹션만 볼 수
        있어요.
      </p>
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
