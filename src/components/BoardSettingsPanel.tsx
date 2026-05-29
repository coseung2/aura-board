"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { SidePanel } from "./ui/SidePanel";
import { ShareTab } from "./share/ShareTab";

export type BoardSection = {
  id: string;
  title: string;
  accessToken: string | null;
};

type Tab = "breakout" | "engagement" | "share" | "canva" | "theme";

const TAB_LABELS: Record<Tab, string> = {
  breakout: "브레이크아웃",
  engagement: "참여",
  share: "공유",
  canva: "Canva 연동",
  theme: "테마",
};

const PLACEHOLDER_COPY: Record<Exclude<Tab, "breakout" | "engagement" | "share">, string> = {
  canva: "도메인 단위 Canva 연동 설정",
  theme: "보드 배경과 기본 레이아웃",
};

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  layout: string;
  initialSections: BoardSection[];
  /** card-comments-likes (2026-04-26): 참여 탭의 익명 토글 초기값. */
  initialAnonymousAuthor?: boolean;
  /** board-share (2026-05-29): 공유 탭 초기값. */
  initialShareMode?: string;
  initialShareToken?: string | null;
  initialShareShortCode?: string | null;
};

export function BoardSettingsPanel({
  open,
  onClose,
  boardId,
  layout,
  initialSections,
  initialAnonymousAuthor = false,
  initialShareMode = "private",
  initialShareToken = null,
  initialShareShortCode = null,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("breakout");
  const [sections, setSections] = useState<BoardSection[]>(initialSections);
  const [anonymousAuthor, setAnonymousAuthor] = useState(initialAnonymousAuthor);
  const [shareMode, setShareMode] = useState(initialShareMode);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [shareShortCode, setShareShortCode] = useState<string | null>(initialShareShortCode);
  const tablistId = useId();

  // Re-sync when caller re-opens panel with fresh props.
  useEffect(() => {
    if (open) {
      setSections(initialSections);
      setAnonymousAuthor(initialAnonymousAuthor);
    }
  }, [open, initialSections, initialAnonymousAuthor]);

  function handleSectionTokenChange(sectionId: string, nextToken: string | null) {
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, accessToken: nextToken } : s))
    );
    // Refresh server components so other entry points see the latest token.
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
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => {
          const isPlaceholder = key !== "breakout" && key !== "engagement" && key !== "share";
          return (
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
              {isPlaceholder && (
                <span className="board-settings-tab-meta"> (준비 중)</span>
              )}
            </button>
          );
        })}
      </div>

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

      {tab === "engagement" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-engagement`}
          aria-labelledby={`${tablistId}-tab-engagement`}
        >
          <EngagementTab
            boardId={boardId}
            anonymousAuthor={anonymousAuthor}
            onChange={setAnonymousAuthor}
          />
        </div>
      )}

      {tab === "share" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-share`}
          aria-labelledby={`${tablistId}-tab-share`}
        >
          <ShareTab
            boardId={boardId}
            initialShareMode={shareMode}
            initialShareToken={shareToken}
            initialShareShortCode={shareShortCode}
          />
        </div>
      )}

      {tab !== "breakout" && tab !== "engagement" && tab !== "share" && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-${tab}`}
          aria-labelledby={`${tablistId}-tab-${tab}`}
        >
          <div className="board-settings-placeholder">
            <span aria-hidden="true" style={{ fontSize: 28 }}>🚧</span>
            <p>
              준비 중이에요. 곧 이곳에서{" "}
              <strong>{PLACEHOLDER_COPY[tab as keyof typeof PLACEHOLDER_COPY]}</strong>을 관리할 수 있어요.
            </p>
          </div>
        </div>
      )}
    </SidePanel>
  );
}

/* ── Engagement tab (card-comments-likes 2026-04-26) ──── */

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

  const toggle = async () => {
    const next = !anonymousAuthor;
    setBusy(true);
    setErr(null);
    // optimistic
    onChange(next);
    try {
      const r = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonymousAuthor: next }),
      });
      if (!r.ok) {
        onChange(!next);
        setErr("저장에 실패했어요");
      }
    } catch {
      onChange(!next);
      setErr("저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="section-panel-notice" style={{ marginTop: 0 }}>
        보드 안의 카드와 댓글 작성자 표시 방식을 조절해요.
      </p>
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: 14,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={anonymousAuthor}
          onChange={toggle}
          disabled={busy}
          style={{ marginTop: 2 }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>작성자 익명</span>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            카드 작성자와 댓글 작성자 이름을 모두 "익명" 으로 가려요.
            좋아요 카운트는 영향을 받지 않아요.
          </span>
        </span>
      </label>
      {err && (
        <p style={{ color: "var(--color-danger)", fontSize: 12, margin: 0 }}>{err}</p>
      )}
    </div>
  );
}

/* ── Breakout tab ──────────────────────────────────────── */

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
        <span aria-hidden="true" style={{ fontSize: 28 }}>🗂</span>
        <p>
          이 레이아웃에는 섹션이 없어요.
          <br />
          columns 레이아웃에서만 브레이크아웃 링크를 만들 수 있어요.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="board-settings-empty">
        <span aria-hidden="true" style={{ fontSize: 28 }}>📋</span>
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
        각 섹션별 모둠 모드 링크를 관리해요. 링크를 공유하면 해당 섹션만 열 수 있어요.
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
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
        <a
          href={`/board/${boardId}/archive`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--color-accent)",
            textDecoration: "none",
          }}
        >
          🗄 지난 세션 아카이브 보기 →
        </a>
      </div>
    </>
  );
}

/* ── Single section row ───────────────────────────────── */

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
    if (typeof window !== "undefined") setOrigin(window.location.origin);
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
      setStatus("새 링크가 생성되었어요");
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
      setStatus("복사됨 ✓");
      window.setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("복사 실패 — 수동으로 복사해 주세요");
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
            재발급
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
            {busy ? "생성 중…" : "공유 링크 생성"}
          </button>
        </div>
      )}
      <p className="share-status" aria-live="polite">
        {status}
      </p>
    </article>
  );
}
