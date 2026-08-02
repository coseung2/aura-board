"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";
import { formatBpsPercent } from "@/lib/pets/math";
import type {
  SlimeColor,
  SlimeEffectKey,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import type {
  StudentAssignmentTodo,
  StudentHomeBoard as BoardItem,
  StudentHomeBreakout as StudentBreakout,
} from "@/lib/student-home-types";
import { isStudentAssignmentReminded } from "@/lib/student-home-types";
import {
  parseStudentBoardCategory,
  STUDENT_BOARD_CATEGORIES,
  type StudentBoardCategory,
} from "@/components/student/student-board-navigation";
import { GameHubCatalog } from "@/components/game-platform/GameHubCatalog";
import { GameRecordsPanel } from "@/components/game-platform/GameRecordsPanel";
import { GAME_HUB_ORDER } from "@/lib/game-platform/catalog";
import {
  isGameRecordRange,
  isOfficialGameKind,
  type GameRecordRange,
  type OfficialGameKind,
} from "@/lib/game-platform/contracts";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
const STUDENT_ASSIGNMENT_VISIBLE_LIMIT = 4;

const PLAY_TABS = [
  { id: "games", label: "게임" },
  { id: "records", label: "나의 전적" },
] as const;
type PlayTab = (typeof PLAY_TABS)[number]["id"];

type BreakoutGroup = {
  groupIndex: number;
  entrySectionId: string;
  totalCount: number;
  sections: Array<{ id: string; title: string; count: number }>;
};

type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

type WalletSummary = {
  classroomId: string;
  balance: number;
  currency: { unitLabel: string; monthlyInterestRate: number | null };
  activeFDs: Array<{
    id: string;
    principal: number;
    monthlyRate: number;
    maturityDate: string;
  }>;
};

type StudentSlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  equippedColors?: SlimeColor[];
  representativeColor?: SlimeColor | null;
  catalog: SlimeDefinition[];
  equippedItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  shopCatalog?: SlimeShopItem[];
  effects?: {
    totals?: Partial<Record<SlimeEffectKey, number>>;
  };
};

type Props = {
  studentName: string;
  classroomName: string;
  classroomId: string;
  boards: BoardItem[];
  duties: Duty[];
  assignments?: StudentAssignmentTodo[];
};

const SLIME_COLOR_LABELS: Record<SlimeColor, string> = {
  blue: "파랑",
  green: "초록",
  yellow: "노랑",
  purple: "보라",
  red: "빨강",
};

const SLIME_EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

export function StudentDashboard({
  studentName,
  classroomName,
  classroomId,
  boards,
  assignments = [],
}: Props) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState(false);
  const walletLoadGeneration = useRef(0);
  const [slimeHome, setSlimeHome] = useState<StudentSlimeHome | null>(null);
  const [slimeLoading, setSlimeLoading] = useState(true);
  const [slimeError, setSlimeError] = useState(false);
  const slimeLoadGeneration = useRef(0);
  const [cancellingFD, setCancellingFD] = useState<string | null>(null);
  const [fdError, setFdError] = useState<string | null>(null);
  const loadWallet = useCallback(async () => {
    const generation = ++walletLoadGeneration.current;
    setWalletLoading(true);
    setWalletError(false);
    try {
      const res = await fetch("/api/my/wallet", { cache: "no-store" });
      if (!res.ok) throw new Error("wallet_load_failed");
      const payload = (await res.json()) as WalletSummary;
      if (generation === walletLoadGeneration.current) setWallet(payload);
    } catch {
      if (generation === walletLoadGeneration.current) setWalletError(true);
    } finally {
      if (generation === walletLoadGeneration.current) setWalletLoading(false);
    }
  }, []);

  const loadSlimeHome = useCallback(async () => {
    const generation = ++slimeLoadGeneration.current;
    setSlimeLoading(true);
    setSlimeError(false);
    try {
      const res = await fetch("/api/student/slimes", { cache: "no-store" });
      if (!res.ok) throw new Error("slime_home_load_failed");
      const payload = (await res.json()) as StudentSlimeHome;
      if (generation === slimeLoadGeneration.current) setSlimeHome(payload);
    } catch {
      if (generation === slimeLoadGeneration.current) setSlimeError(true);
    } finally {
      if (generation === slimeLoadGeneration.current) setSlimeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWallet();
    void loadSlimeHome();
    return () => {
      walletLoadGeneration.current += 1;
      slimeLoadGeneration.current += 1;
    };
  }, [loadSlimeHome, loadWallet]);

  async function handleCancelFD(fdId: string) {
    if (!window.confirm("이 적금을 중도해지할까요? (이자 없이 원금만 반환)")) {
      return;
    }
    setCancellingFD(fdId);
    setFdError(null);
    try {
      const res = await fetch(
        `/api/classrooms/${classroomId}/bank/fixed-deposits/${fdId}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        setFdError(typeof msg === "string" ? msg : "해지에 실패했어요");
        return;
      }
      // Refetch wallet summary so the chip disappears. On failure we keep
      // the current wallet state - the cancelled FD chip will remain briefly
      // stale, but a full router.refresh() would wipe the in-page error
      // message above and is overkill for a transient fetch blip.
      const fresh = await fetch("/api/my/wallet", { cache: "no-store" });
      if (fresh.ok) {
        const payload = (await fresh.json()) as WalletSummary;
        setWallet(payload);
      }
    } finally {
      setCancellingFD(null);
    }
  }

  return (
    <>
      <header className="student-page-header">
        <p className="student-page-eyebrow">
          {classroomName} · {studentName}님
        </p>
        <h1 className="student-page-title">홈</h1>
      </header>

      <StudentSlimeCard
        snapshot={slimeHome}
        loading={slimeLoading}
        error={slimeError}
        onRetry={loadSlimeHome}
      />

      <div className="student-overview-row">
        <section
          className="student-utilities"
          aria-label="은행"
          aria-busy={walletLoading}
        >
          <div className="student-wallet-card">
            <div className="student-wallet-header">
              <div>
                <h2 className="student-wallet-title">은행</h2>
              </div>
              <Link href="/my/wallet" className="student-wallet-link">
                자세히
              </Link>
            </div>

            {wallet ? (
              <>
                <div className="student-wallet-balance-row">
                  <span className="student-wallet-balance-label">현재 잔고</span>
                  <strong className="student-wallet-balance-value">
                    {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
                  </strong>
                </div>

                <div className="student-wallet-fd-strip">
                  {wallet.activeFDs.length > 0 ? (
                    wallet.activeFDs.slice(0, 3).map((fd) => {
                      const daysLeft = Math.max(
                        0,
                        Math.ceil(
                          (new Date(fd.maturityDate).getTime() - Date.now()) /
                            86400000,
                        ),
                      );
                      const isCancelling = cancellingFD === fd.id;
                      return (
                        <div key={fd.id} className="student-wallet-fd-chip">
                          <span className="student-wallet-fd-label">적금</span>
                          <strong>
                            {fd.principal.toLocaleString()}{" "}
                            {wallet.currency.unitLabel}
                          </strong>
                          <span>D-{daysLeft}</span>
                          <button
                            type="button"
                            className="student-wallet-fd-cancel"
                            onClick={() => handleCancelFD(fd.id)}
                            disabled={isCancelling || cancellingFD !== null}
                          >
                            {isCancelling ? "해지 중…" : "해지"}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="student-wallet-empty">
                      아직 진행 중인 적금이 없어요.
                    </div>
                  )}
                  {fdError && (
                    <p className="student-wallet-fd-error" role="alert">
                      {fdError}
                    </p>
                  )}
                </div>
              </>
            ) : walletError ? (
              <div className="student-wallet-error" role="alert">
                <p>통장 정보를 불러오지 못했어요.</p>
                <button type="button" onClick={() => void loadWallet()}>
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="student-wallet-empty" role={walletLoading ? "status" : undefined}>
                {walletLoading ? "통장 정보를 불러오는 중이에요." : "통장 정보가 없어요."}
              </div>
            )}
          </div>
        </section>

        <StudentAssignmentTodos assignments={assignments} />
      </div>

      <StudentBoardHighlights boards={boards} />
    </>
  );
}

function StudentSlimeCard({
  snapshot,
  loading,
  error,
  onRetry,
}: {
  snapshot: StudentSlimeHome | null;
  loading: boolean;
  error: boolean;
  onRetry: () => Promise<void>;
}) {
  const representativeColor =
    snapshot?.representativeColor ?? snapshot?.equippedColors?.[0] ?? snapshot?.ownedColors?.[0] ?? null;
  const slime = snapshot?.catalog.find((candidate) => candidate.color === representativeColor) ?? null;
  const assignedItems = slime
    ? (snapshot?.equippedItemsByColor?.[slime.color] ?? [])
        .map((itemKey) => snapshot?.shopCatalog?.find((item) => item.key === itemKey))
        .filter((item): item is SlimeShopItem => Boolean(item))
    : [];
  const hasSlimeScene = assignedItems.some(
    (item) =>
      Boolean(item.floor) ||
      item.category === "background" ||
      item.category === "vehicle" ||
      item.category === "ride",
  );
  const slimeSceneBackground = assignedItems.reduce<SlimeShopItem | null>(
    (background, item) =>
      item.category === "background" && item.floor === null ? item : background,
    null,
  );
  const activeBuffBps = slime
    ? snapshot?.effects?.totals?.[slime.effectKey] ?? slime.baseBuffBps
    : 0;

  return (
    <section
      className="student-slime-card"
      data-testid="student-slime-card"
      aria-labelledby="student-pet-title"
      aria-busy={loading}
    >
      <div className="student-slime-header">
        <div>
          <h2 id="student-pet-title" className="student-slime-title">내 대표 펫</h2>
        </div>
        <Link href="/student/aura-pet" className="student-slime-link">
          펫 관리하기
        </Link>
      </div>

      {loading ? (
        <p className="student-slime-status" role="status">슬라임 정보를 불러오는 중이에요.</p>
      ) : error ? (
        <div className="student-slime-status" role="alert">
          <p>슬라임 정보를 불러오지 못했어요.</p>
          <button type="button" onClick={() => void onRetry()}>다시 시도</button>
        </div>
      ) : !snapshot || !slime ? (
        <div className="student-slime-empty">
          <p>아직 대표 슬라임이 없어요.</p>
          <span>내 펫에서 대표 슬라임을 지정해 보세요.</span>
        </div>
      ) : (
        <div
          className={`student-slime-body ${hasSlimeScene ? "student-slime-body-scene" : ""}`.trim()}
        >
          <div
            className={`student-slime-sprite ${hasSlimeScene ? "student-slime-sprite-scene" : ""}`.trim()}
            style={slimeSceneBackground
              ? { backgroundImage: `url("${slimeSceneBackground.spritePath}")` }
              : undefined}
          >
            <SlimeCharacterSprite slime={slime} items={assignedItems} />
          </div>
          <div className="student-slime-copy">
            <strong className="student-slime-name">{slime.nameKo}</strong>
            <span className="student-slime-color">{SLIME_COLOR_LABELS[slime.color]} 슬라임</span>
            <span className="student-slime-buff">
              활성 보상 버프 · {SLIME_EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(activeBuffBps)}
            </span>
            <span className="student-slime-balance">
              잔액 {snapshot.balance.toLocaleString()} {snapshot.currency.unitLabel}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function StudentAssignmentTodos({
  assignments,
}: {
  assignments: StudentAssignmentTodo[];
}) {
  const missingCount = assignments.filter((item) => !item.submitted).length;
  const completedCount = assignments.length - missingCount;
  const [filter, setFilter] = useState<"missing" | "completed">(
    missingCount > 0 ? "missing" : "completed",
  );
  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = filtered.slice(0, STUDENT_ASSIGNMENT_VISIBLE_LIMIT);
  const emptyMessage =
    filter === "missing"
      ? "미제출 과제가 없어요."
      : "완료한 과제가 없어요.";

  return (
    <section className="student-assignment-panel" aria-label="과제 목록">
      <div className="student-assignment-header">
        <div>
          <h2 className="student-assignment-title">
            {filter === "missing" ? "해야 할 과제" : "완료한 과제"}
          </h2>
        </div>
        <div className="student-assignment-summary" aria-label="과제 제출 현황">
          <button
            type="button"
            className={`student-assignment-summary-chip is-missing ${
              filter === "missing" ? "is-active" : ""
            }`}
            onClick={() => setFilter("missing")}
            aria-pressed={filter === "missing"}
          >
            미제출 {missingCount}
          </button>
          <button
            type="button"
            className={`student-assignment-summary-chip ${
              filter === "completed" ? "is-active" : ""
            }`}
            onClick={() => setFilter("completed")}
            aria-pressed={filter === "completed"}
          >
            완료 {completedCount}
          </button>
        </div>
      </div>

      <div className="student-assignment-list">
        {filtered.length === 0 ? (
          <p className="student-assignment-empty">{emptyMessage}</p>
        ) : visibleItems.map((item) => {
          const submitted = item.submitted;
          const href = item.href;
          const className = `student-assignment-item ${
            submitted ? "is-submitted" : "is-missing"
          }`;
          const reminded = isStudentAssignmentReminded(item);
          const content = (
            <>
              <span className="student-assignment-check" aria-hidden="true">
                {submitted ? "✓" : ""}
              </span>
              <span className="student-assignment-main">
                <strong>{item.sectionTitle}</strong>
                <span>{item.boardTitle}</span>
              </span>
              <span className="student-assignment-meta">
                <span
                  className={`student-assignment-status ${
                    submitted ? "is-submitted" : "is-missing"
                  }`}
                >
                  {submitted ? "제출 완료" : "미제출"}
                </span>
                <small>
                  {submitted && item.submittedAt
                  ? `제출 ${formatAssignmentDate(item.submittedAt)}`
                  : submitted
                    ? "제출 완료"
                    : item.dueAt
                      ? `마감 ${formatAssignmentDate(item.dueAt)}`
                      : reminded
                    ? `알림 ${formatAssignmentDate(item.reminderSentAt)}`
                    : item.assignedAt
                      ? `배부 ${formatAssignmentDate(item.assignedAt)}`
                      : "과제 배부됨"}
                </small>
              </span>
            </>
          );
          return href ? (
            <Link key={item.id} href={href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={item.id} className={`${className} is-static`}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatAssignmentDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

type StudentBoardHubProps = {
  boards: BoardItem[];
};

function boardListState(board: BoardItem) {
  if (board.layout === "quiz") {
    const status = board.quizzes?.[0]?.status;
    return status === "active"
      ? { label: "진행 중", live: true }
      : status === "finished"
        ? { label: "종료", live: false }
        : { label: "시작 대기", live: false };
  }
  return { label: layoutLabel(board.layout), live: false };
}

function isPriorityBoard(board: BoardItem) {
  return board.breakout !== null || boardListState(board).live;
}

function StudentBoardHighlights({ boards }: { boards: BoardItem[] }) {
  const priorityBoards = boards
    .filter((board) => !isOfficialGameKind(board.layout))
    .filter((board) => isPriorityBoard(board))
    .slice(0, 3);

  return (
    <section className="student-home-boards" aria-labelledby="student-home-boards-title">
      <div className="student-flat-section-heading">
        <h2 id="student-home-boards-title">지금 확인할 보드</h2>
        <Link href="/student/boards?category=priority">전체 보드</Link>
      </div>
      {priorityBoards.length > 0 ? (
        <div className="student-board-highlight-list">
          {priorityBoards.map((board) => {
            const state = boardListState(board);
            return (
              <Link
                key={board.id}
                href="/student/boards?category=priority"
                className="student-board-highlight"
              >
                <span>
                  <strong>{board.title}</strong>
                  <small>
                    {board.breakout && !board.breakout.selectedSectionId
                      ? "모둠 선택 필요"
                      : state.label}
                  </small>
                </span>
                <span className="student-board-highlight-action">확인</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="student-flat-empty">지금 바로 확인할 보드는 없어요.</p>
      )}
    </section>
  );
}

export function StudentBoardHub({ boards }: StudentBoardHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [breakoutModal, setBreakoutModal] = useState<{
    sourceTitle: string;
    breakout: StudentBreakout;
  } | null>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const requestedPlayTab: PlayTab =
    searchParams.get("playTab") === "records" ? "records" : "games";
  const [playTab, setPlayTab] = useState<PlayTab>(requestedPlayTab);
  const requestedRecordKind: OfficialGameKind | "all" = isOfficialGameKind(
    searchParams.get("game"),
  )
    ? (searchParams.get("game") as OfficialGameKind)
    : "all";
  const requestedRecordRange: GameRecordRange = isGameRecordRange(
    searchParams.get("range"),
  )
    ? (searchParams.get("range") as GameRecordRange)
    : "30d";
  const categoryTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const playTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const requestedCategory = parseStudentBoardCategory(searchParams.get("category"));
  const [activeCategory, setActiveCategory] =
    useState<StudentBoardCategory>(requestedCategory);
  const contentBoards = boards.filter(
    (board) => !isOfficialGameKind(board.layout),
  );
  const lessonBoards = contentBoards.filter((b) => b.category === "LESSON");
  const priorityBoards = contentBoards.filter((board) => isPriorityBoard(board));
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const categoryBoards =
    activeCategory === "priority"
      ? priorityBoards
      : activeCategory === "lesson"
        ? lessonBoards
        : activeCategory === "play"
          ? []
          : contentBoards;
  const activeBoards = categoryBoards
    .filter((board) =>
      normalizedQuery
        ? `${board.title} ${layoutLabel(board.layout)}`
            .toLocaleLowerCase("ko")
            .includes(normalizedQuery)
        : true,
    )
    .sort(
      (left, right) =>
        Number(boardListState(right).live) - Number(boardListState(left).live),
    );

  useEffect(() => {
    setActiveCategory(requestedCategory);
  }, [requestedCategory]);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setPlayTab(requestedPlayTab);
  }, [requestedPlayTab]);

  function replaceBoardQuery(updates: Record<string, string | null>) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (!("category" in updates)) {
      nextSearchParams.set("category", activeCategory);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (value) nextSearchParams.set(key, value);
      else nextSearchParams.delete(key);
    }

    const nextCategory = parseStudentBoardCategory(
      nextSearchParams.get("category"),
    );
    nextSearchParams.set("category", nextCategory);
    nextSearchParams.delete("playType");
    if (nextCategory !== "play") {
      nextSearchParams.delete("playTab");
      nextSearchParams.delete("game");
      nextSearchParams.delete("range");
    } else if (nextSearchParams.get("playTab") !== "records") {
      nextSearchParams.delete("playTab");
    }

    router.replace(`/student/boards?${nextSearchParams.toString()}`, { scroll: false });
  }

  function selectCategory(category: StudentBoardCategory) {
    setActiveCategory(category);
    replaceBoardQuery({ category });
  }

  function selectPlayTab(tab: PlayTab) {
    setPlayTab(tab);
    replaceBoardQuery({
      category: "play",
      playTab: tab,
      playType: null,
    });
  }

  function handleRovingKeys(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
    count: number,
    refs: React.RefObject<Array<HTMLButtonElement | null>>,
    select: (index: number) => void,
  ) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % count;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + count) % count;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = count - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    select(nextIndex);
    refs.current[nextIndex]?.focus();
  }

  const boardThumbnail = (board: BoardItem) => {
    if (board.thumbnailMode === "custom" && board.thumbnailUrl) {
      return board.thumbnailUrl;
    }
    return layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL;
  };

  const renderCard = (board: BoardItem) => {
    const thumbnail = boardThumbnail(board);
    const quizCode = board.layout === "quiz" && board.quizzes?.[0]?.roomCode;
    const boardState = boardListState(board);
    const href = quizCode
      ? `/quiz/${quizCode}`
      : `/board/${board.slug}?view=student`;
    const breakout = board.breakout;

    if (breakout) {
      return (
        <button
          key={board.id}
          type="button"
          className={`student-board-card ${boardState.live ? "is-live" : ""}`}
          onClick={() => {
            if (breakout.selectedSectionId) {
              router.push(
                `/board/${breakout.boardSlug}/s/${breakout.selectedSectionId}?view=student`,
              );
              return;
            }
            setBreakoutModal({ sourceTitle: board.title, breakout });
          }}
        >
          <div className="student-board-preview">
            <img
              className="student-board-preview-img"
              src={thumbnail}
              alt={`${layoutLabel(board.layout)} 화면 미리보기`}
            />
          </div>
          <div className="student-board-card-body">
            {boardState.live ? (
              <span className="student-board-live-badge">LIVE</span>
            ) : null}
            <span className="student-board-card-title">{board.title}</span>
            <span className="student-board-card-meta">
              모둠 선택 · {breakout.boardTitle}
            </span>
          </div>
        </button>
      );
    }

    return (
      <Link
        key={board.id}
        href={href}
        className={`student-board-card ${boardState.live ? "is-live" : ""}`}
        aria-label={boardState.live ? `${board.title}, 실시간 진행 중` : undefined}
      >
        <div className="student-board-preview">
          <img
            className="student-board-preview-img"
            src={thumbnail}
            alt={`${layoutLabel(board.layout)} 화면 미리보기`}
          />
        </div>
        <div className="student-board-card-body">
          {boardState.live ? (
            <span className="student-board-live-badge">LIVE</span>
          ) : null}
          <span className="student-board-card-title">{board.title}</span>
          <span className="student-board-card-meta">
            {layoutLabel(board.layout)}
            {quizCode ? " · 참여하기" : ""}
          </span>
        </div>
      </Link>
    );
  };

  const categoryTabs: Array<{
    id: StudentBoardCategory;
    label: string;
    count: number;
  }> = [
    { id: "priority", label: "우선", count: priorityBoards.length },
    { id: "lesson", label: "수업", count: lessonBoards.length },
    { id: "play", label: "놀이", count: GAME_HUB_ORDER.length },
    { id: "all", label: "전체", count: contentBoards.length },
  ];

  return (
    <>
      <div className="student-content-tabs" role="tablist" aria-label="보드 구분">
        {categoryTabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`student-board-tab-${tab.id}`}
            aria-controls="student-board-panel"
            aria-selected={activeCategory === tab.id}
            tabIndex={activeCategory === tab.id ? 0 : -1}
            ref={(element) => {
              categoryTabRefs.current[index] = element;
            }}
            className={activeCategory === tab.id ? "is-active" : ""}
            onClick={() => selectCategory(tab.id)}
            onKeyDown={(event) =>
              handleRovingKeys(
                event,
                index,
                STUDENT_BOARD_CATEGORIES.length,
                categoryTabRefs,
                (nextIndex) => selectCategory(categoryTabs[nextIndex].id),
              )
            }
          >
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>
      <section
        id="student-board-panel"
        className="student-board-panel"
        role="tabpanel"
        aria-labelledby={`student-board-tab-${activeCategory}`}
      >
        {activeCategory === "play" ? (
          <div className="student-board-filters student-play-tabs" role="tablist" aria-label="놀이 보기">
            {PLAY_TABS.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={playTab === tab.id}
                tabIndex={playTab === tab.id ? 0 : -1}
                ref={(element) => {
                  playTabRefs.current[index] = element;
                }}
                className={playTab === tab.id ? "is-active" : ""}
                onClick={() => selectPlayTab(tab.id)}
                onKeyDown={(event) =>
                  handleRovingKeys(
                    event,
                    index,
                    PLAY_TABS.length,
                    playTabRefs,
                    (nextIndex) => selectPlayTab(PLAY_TABS[nextIndex].id),
                  )
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
        {activeCategory === "play" && playTab === "records" ? (
          <GameRecordsPanel
            key={`${requestedRecordKind}:${requestedRecordRange}`}
            initialGameKind={requestedRecordKind}
            initialRange={requestedRecordRange}
          />
        ) : activeCategory === "play" ? (
          <GameHubCatalog />
        ) : (
          <>
        <div className="student-board-tools">
          <label className="student-board-search">
            <span className="sr-only">보드 검색</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                replaceBoardQuery({ q: value.trim() || null });
              }}
              placeholder="보드 검색"
            />
          </label>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          검색 결과 {activeBoards.length}개
        </p>
        {activeBoards.length > 0 ? (
          <div className="student-board-grid">
            {activeBoards.map((board) => renderCard(board))}
          </div>
        ) : (
          <div className="student-board-empty">
            {categoryBoards.length === 0
              ? activeCategory === "priority"
                ? "지금 우선 확인할 보드가 없어요."
                : `${activeCategory === "lesson" ? "수업" : "등록된"} 보드가 아직 없어요.`
              : "검색 조건에 맞는 보드가 없어요."}
          </div>
        )}
          </>
        )}
      </section>
      {breakoutModal && (
        <StudentBreakoutModal
          sourceTitle={breakoutModal.sourceTitle}
          breakout={breakoutModal.breakout}
          onClose={() => setBreakoutModal(null)}
        />
      )}
    </>
  );
}

function StudentBreakoutModal({
  sourceTitle,
  breakout,
  onClose,
}: {
  sourceTitle: string;
  breakout: StudentBreakout;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(group: BreakoutGroup) {
    if (pending !== null || !group.entrySectionId) return;
    setPending(group.groupIndex);
    setError(null);
    try {
      const res = await fetch(
        `/api/breakout/assignments/${breakout.assignmentId}/membership`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sectionId: group.entrySectionId }),
        },
      );
      if (res.ok) {
        router.push(
          `/board/${breakout.boardSlug}/s/${group.entrySectionId}?view=student`,
        );
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.membership?.sectionId) {
        router.push(
          `/board/${breakout.boardSlug}/s/${data.membership.sectionId}?view=student`,
        );
        return;
      }
      if (data.error === "capacity_reached") {
        setError(`모둠 ${group.groupIndex}은 이미 정원이 찼어요.`);
      } else if (data.error === "already_selected") {
        setError("이미 모둠을 선택했어요.");
      } else {
        setError("모둠 선택에 실패했어요.");
      }
    } catch {
      setError("네트워크 오류로 선택하지 못했어요.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div
        className="student-breakout-backdrop"
        onClick={pending === null ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className="student-breakout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-breakout-title"
      >
        <div className="student-breakout-modal-header">
          <div>
            <p className="student-breakout-kicker">{sourceTitle}</p>
            <h2 id="student-breakout-title">모둠 선택</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={pending !== null}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="student-breakout-error" role="alert">
            {error}
          </p>
        )}

        <div className="student-breakout-grid">
          {breakout.groups.map((group) => {
            const isFull = group.totalCount >= breakout.groupCapacity;
            return (
              <button
                key={group.groupIndex}
                type="button"
                className="student-breakout-group"
                disabled={isFull || pending !== null}
                onClick={() => void pick(group)}
              >
                <strong>모둠 {group.groupIndex}</strong>
                <span>
                  {group.totalCount} / {breakout.groupCapacity}명
                </span>
                {pending === group.groupIndex && <small>선택 중...</small>}
                {isFull && <small>정원 마감</small>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
