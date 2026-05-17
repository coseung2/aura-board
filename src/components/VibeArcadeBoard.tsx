"use client";

// Vibe-arcade board root (Seed 13 + handoff 재설계 2026-04-21).
// Layout-level entry rendered from src/app/board/[id]/page.tsx when
// Board.layout === "vibe-arcade".
//
// 탭:
//   - 슬롯 (기본) : 학급 roster × 학생별 최신 VibeProject status 그리드
//   - 카탈로그   : 승인된 프로젝트 신작/인기 탭
//   - 평가 미작성 : 승인된 프로젝트 중 viewer가 리뷰 안 쓴 것
//
// Studio 진입(학생 슬롯 클릭) → VibeStudio 모달. 교사 슬롯 클릭(검토) →
// (Phase 3) TeacherModerationPanel 모달. 지금은 Studio만 연결.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StarRating } from "./vibe-arcade/StarRating";
import { StudentSlotCard } from "./vibe-arcade/StudentSlotCard";
import { VibeStudio } from "./vibe-arcade/VibeStudio";
import { VibePlayModal } from "./vibe-arcade/VibePlayModal";
import { TeacherModerationPanel } from "./vibe-arcade/TeacherModerationPanel";
import { VibeSettingsPanel } from "./vibe-arcade/SettingsPanel";
import type { VibeSlotDTO } from "@/app/api/vibe/slots/route";

type ViewerKind = "teacher" | "student" | "none";

export type VibeArcadeBoardProps = {
  boardId: string;
  classroomId: string;
  viewerKind: ViewerKind;
  studentId: string | null;
};

type VibeArcadeConfig = {
  boardId: string;
  enabled: boolean;
  moderationPolicy: string;
  perStudentDailyTokenCap: number | null;
  classroomDailyTokenPool: number;
  crossClassroomVisible: boolean;
  reviewAuthorDisplay: string;
  reviewRatingSystem: string;
  allowRemix: boolean;
};

type CatalogItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  tags: string;
  playCount: number;
  reviewCount: number;
  ratingAvg: number | null;
  authorStudentId: string;
  createdAt: string;
};

const TABS = [
  { key: "slots",   label: "🧑‍🎓 슬롯" },
  { key: "new",     label: "신작" },
  { key: "popular", label: "인기" },
  { key: "to-review", label: "🎯 평가 미작성" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function VibeArcadeBoard(props: VibeArcadeBoardProps) {
  const [config, setConfig] = useState<VibeArcadeConfig | null>(null);
  const [tab, setTab] = useState<TabKey>("slots");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [slots, setSlots] = useState<VibeSlotDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studioSlot, setStudioSlot] = useState<VibeSlotDTO | null>(null);
  const [playing, setPlaying] = useState<{ id: string; title: string } | null>(null);
  const [showModeration, setShowModeration] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const canPlay = props.viewerKind === "student";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/vibe/config?boardId=${props.boardId}`);
        if (!res.ok) throw new Error(`config ${res.status}`);
        const cfg = (await res.json()) as VibeArcadeConfig;
        if (!cancelled) setConfig(cfg);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.boardId]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibe/slots?boardId=${props.boardId}`);
      if (!res.ok) throw new Error(`slots ${res.status}`);
      const data = (await res.json()) as { slots: VibeSlotDTO[] };
      setSlots(data.slots);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [props.boardId]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/vibe/projects?boardId=${props.boardId}&tab=${tab}&take=30`,
      );
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const data = (await res.json()) as { items: CatalogItem[] };
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [props.boardId, tab]);

  useEffect(() => {
    if (!config?.enabled) return;
    if (tab === "slots") void loadSlots();
    else void loadCatalog();
  }, [config?.enabled, tab, loadSlots, loadCatalog]);

  if (!config) {
    if (error) {
      return (
        <div className="va-error" role="alert">
          코딩 교실을 불러오지 못했어요: {error}
          <button
            type="button"
            onClick={() => {
              setError(null);
              // config fetch 다시 시도 — useEffect에 종속된 boardId로 강제 재호출.
              void (async () => {
                try {
                  const res = await fetch(`/api/vibe/config?boardId=${props.boardId}`);
                  if (!res.ok) throw new Error(`config ${res.status}`);
                  const cfg = (await res.json()) as VibeArcadeConfig;
                  setConfig(cfg);
                } catch (e) {
                  setError((e as Error).message);
                }
              })();
            }}
          >
            재시도
          </button>
        </div>
      );
    }
    return <div className="va-loading">불러오는 중…</div>;
  }

  if (!config.enabled) {
    const isTeacherGate = props.viewerKind === "teacher";
    return (
      <section className="va-gate-off" role="status">
        <div className="va-gate-off-inner">
          <span className="va-gate-off-icon" aria-hidden>
            🔒
          </span>
          <h2>코딩 교실가 아직 열리지 않았어요</h2>
          {isTeacherGate ? (
            <>
              <p>
                지금 열면 학생들이 Claude/ChatGPT/Gemini로 카드·게임을 만들고 공유할 수
                있어요. 저장된 AI Key와 학급 쿼터는{" "}
                <a href="/docs/ai-setup" className="va-gate-off-link">
                  AI 연결 페이지
                </a>
                에서 조정할 수 있어요.
              </p>
              <EnableButton
                boardId={props.boardId}
                onEnabled={(next) => setConfig(next)}
              />
            </>
          ) : (
            <p>
              선생님이 보드 설정에서 <strong>코딩 교실</strong>를 켜면 여기에서 친구들의 작품을
              만들고 플레이할 수 있어요.
            </p>
          )}
        </div>
      </section>
    );
  }

  const isTeacher = props.viewerKind === "teacher";

  // 학생 뷰: 다른 친구들 작품·탭 숨김. 중앙 "입장하기" 버튼만 노출 →
  // /board/[id]/vibe-arcade/studio 로 이동해 풀페이지 챗·프리뷰 편집.
  if (props.viewerKind === "student") {
    return (
      <section className="va-root va-student-landing">
        <div className="va-student-landing-inner">
          <h1 className="va-title">💻 코딩 교실</h1>
          <p className="va-subtitle">
            Claude 와 대화하며 나만의 작품을 만들어 보세요.
          </p>
          <div className="va-student-actions">
            <Link
              href={`/board/${props.boardId}/vibe-arcade/studio`}
              className="va-student-enter"
            >
              🚀 코딩 스튜디오
            </Link>
            <Link
              href={`/board/${props.boardId}/agent`}
              className="va-student-enter va-student-enter-secondary"
            >
              🤖 AI 도우미
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="va-root">
      <header className="va-header">
        <div>
          <h1 className="va-title">💻 코딩 교실</h1>
          <p className="va-subtitle">
            {isTeacher
              ? "학급 학생들의 진행 상황과 승인 대기를 한 화면에 모아봤어요."
              : "나와 반 친구들이 만든 작품을 한자리에서 볼 수 있어요."}
          </p>
        </div>
        {isTeacher && (
          <div className="va-header-actions">
            <button
              type="button"
              className="va-header-btn"
              onClick={() => setShowModeration(true)}
              title="승인 대기 검토"
            >
              📝 모더레이션
            </button>
            <button
              type="button"
              className="va-header-btn"
              onClick={() => setShowSettings(true)}
              title="코딩 교실 설정"
              aria-label="코딩 교실 설정"
            >
              ⚙
            </button>
          </div>
        )}
      </header>

      <nav className="va-tabs" role="tablist" aria-label="카탈로그 탭">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`va-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="va-error" role="alert">
          불러오기 실패: {error}
          <button
            type="button"
            onClick={() => (tab === "slots" ? void loadSlots() : void loadCatalog())}
          >
            재시도
          </button>
        </div>
      ) : loading ? (
        <ul className="va-grid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="va-card va-card-skeleton" aria-hidden />
          ))}
        </ul>
      ) : tab === "slots" ? (
        <SlotsView
          slots={slots}
          selfStudentId={props.studentId}
          isTeacher={isTeacher}
          onOpenSlot={setStudioSlot}
        />
      ) : items.length === 0 ? (
        <div className="va-empty">
          <p>아직 전시된 작품이 없어요.</p>
        </div>
      ) : (
        <ul className="va-grid">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="va-card vg-card-btn"
                onClick={canPlay ? () => setPlaying({ id: item.id, title: item.title }) : undefined}
                disabled={!canPlay}
                aria-label={`${item.title}${canPlay ? " 재생" : ""}`}
              >
                <div className="va-card-thumb">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt={`${item.title} 썸네일`}
                      loading="lazy"
                      width={160}
                      height={120}
                    />
                  ) : (
                    <div className="va-card-thumb-fallback" aria-hidden />
                  )}
                </div>
                <div className="va-card-meta">
                  <h3 className="va-card-title">{item.title}</h3>
                  <div className="va-card-stats">
                    <StarRating value={item.ratingAvg ?? 0} size="sm" readonly />
                    <span className="va-card-plays">▶ {item.playCount}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {studioSlot && (
        <VibeStudio
          boardId={props.boardId}
          classroomId={props.classroomId}
          slot={studioSlot}
          viewerKind={props.viewerKind}
          selfStudentId={props.studentId}
          onClose={() => {
            setStudioSlot(null);
            // 저장 후 상태 반영
            if (tab === "slots") void loadSlots();
          }}
        />
      )}

      {playing && (
        <VibePlayModal
          projectId={playing.id}
          title={playing.title}
          onClose={() => setPlaying(null)}
        />
      )}

      {showModeration && (
        <TeacherModerationPanel
          boardId={props.boardId}
          onClose={() => setShowModeration(false)}
          onChange={() => {
            // 모더레이션 상태 바뀌면 카탈로그 refetch.
            if (tab !== "slots") void loadCatalog();
          }}
        />
      )}

      {showSettings && (
        <VibeSettingsPanel
          boardId={props.boardId}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => {
            setConfig(next);
          }}
        />
      )}
    </section>
  );
}

function EnableButton({
  boardId,
  onEnabled,
}: {
  boardId: string;
  onEnabled: (config: VibeArcadeConfig) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/vibe/config?boardId=${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
      }
      const cfg = (await res.json()) as VibeArcadeConfig;
      onEnabled(cfg);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="va-gate-off-actions">
      <button
        type="button"
        className="va-gate-off-enable"
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? "여는 중…" : "코딩 교실 열기"}
      </button>
      {err && <p className="va-gate-off-error">열기 실패: {err}</p>}
    </div>
  );
}

function SlotsView({
  slots,
  selfStudentId,
  isTeacher,
  onOpenSlot,
}: {
  slots: VibeSlotDTO[];
  selfStudentId: string | null;
  isTeacher: boolean;
  onOpenSlot: (slot: VibeSlotDTO) => void;
}) {
  if (slots.length === 0) {
    return (
      <div className="va-empty">
        <p>학급에 학생이 등록되어 있지 않아요.</p>
      </div>
    );
  }
  return (
    <ul className="vs-grid">
      {slots.map((s) => (
        <li key={s.studentId}>
          <StudentSlotCard
            slot={s}
            isSelf={s.studentId === selfStudentId}
            isTeacher={isTeacher}
            onOpen={onOpenSlot}
          />
        </li>
      ))}
    </ul>
  );
}
