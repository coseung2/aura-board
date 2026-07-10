"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";
import { CharacterAvatar } from "@/components/avatar/CharacterAvatar";
import type { AvatarMeResponse } from "@/components/avatar/types";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { SHADOW_ALLIANCE_STATUS_LABELS } from "@/features/shadow-alliance/types";
import type {
  ShadowAllianceBoardStatus,
  ShadowAllianceSnapshot,
} from "@/features/shadow-alliance/types";
import type {
  StudentAssignmentTodo,
  StudentHomeBoard as BoardItem,
  StudentHomeBreakout as StudentBreakout,
} from "@/lib/student-home-types";
import { isStudentAssignmentReminded } from "@/lib/student-home-types";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";
const STUDENT_ASSIGNMENT_VISIBLE_LIMIT = 4;

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

type Props = {
  studentName: string;
  classroomName: string;
  classroomId: string;
  boards: BoardItem[];
  duties: Duty[];
  assignments?: StudentAssignmentTodo[];
  showDevFeatures?: boolean;
};

export function StudentDashboard({
  studentName,
  classroomName,
  classroomId,
  boards,
  assignments = [],
  showDevFeatures = false,
}: Props) {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [avatar, setAvatar] = useState<AvatarMeResponse | null>(null);
  const [cancellingFD, setCancellingFD] = useState<string | null>(null);
  const [fdError, setFdError] = useState<string | null>(null);
  const [breakoutModal, setBreakoutModal] = useState<{
    sourceTitle: string;
    breakout: StudentBreakout;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      try {
        const res = await fetch("/api/my/wallet", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as WalletSummary;
        if (!cancelled) setWallet(payload);
      } catch {
        // Ignore wallet summary load failures on the dashboard.
      }
    }

    async function loadAvatar() {
      try {
        const res = await fetch("/api/avatar/me", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as AvatarMeResponse;
        if (!cancelled) setAvatar(payload);
      } catch {
        // Ignore avatar load failures on the dashboard.
      }
    }

    loadWallet();
    if (showDevFeatures) {
      loadAvatar();
    }
    return () => {
      cancelled = true;
    };
  }, [showDevFeatures]);

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
      <div className="student-greeting-row">
        <h1 className="student-greeting">{studentName}님, 안녕하세요</h1>
        <span className="student-classroom-badge">{classroomName}</span>
      </div>

      <div className="student-overview-row">
        <section className="student-utilities" aria-label="바로가기">
          <div className="student-wallet-card">
            <div className="student-wallet-header">
              <div>
                <p className="student-wallet-eyebrow">개인 금융</p>
                <h2 className="student-wallet-title">내 통장과 적금</h2>
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
            ) : (
              <div className="student-wallet-empty">
                통장 정보를 불러오는 중이에요.
              </div>
            )}
          </div>

          {showDevFeatures && avatar && (
            <div className="student-avatar-card">
              <div className="student-avatar-header">
                <div>
                  <p className="student-avatar-eyebrow">나만의 캐릭터</p>
                  <h2 className="student-avatar-title">내 캐릭터</h2>
                </div>
                <div className="student-avatar-links">
                  <Link href="/student/character-room" className="student-wallet-link">
                    피팅룸
                  </Link>
                  <Link href="/student/character-shop" className="student-wallet-link">
                    상점
                  </Link>
                </div>
              </div>
              <div className="student-avatar-body">
                <CharacterAvatar
                  items={avatar.items}
                  equipped={avatar.equipped}
                  size={88}
                  ariaLabel="내 캐릭터 미리보기"
                />
                <div className="student-avatar-balance">
                  <span className="student-avatar-balance-label">보유 화폐</span>
                  <strong className="student-avatar-balance-value">
                    {avatar.balance.toLocaleString()} {avatar.currency.unitLabel}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </section>

        <StudentAssignmentTodos assignments={assignments} />
      </div>

      {boards.length === 0 ? (
        <div className="student-empty">
          <p>아직 보드가 없어요.</p>
        </div>
      ) : (
        <StudentBoardSections
          boards={boards}
          onOpenBreakout={setBreakoutModal}
        />
      )}

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
          <p className="student-assignment-eyebrow">과제 목록</p>
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

// BC-1: render the student's boards split into lesson vs play sections.
// The breakout modal state lives on the parent so we still need setBreakoutModal
// threaded in via props.
type StudentBoardSectionsProps = {
  boards: BoardItem[];
  onOpenBreakout: (
    modal: { sourceTitle: string; breakout: StudentBreakout } | null,
  ) => void;
};

function StudentBoardSections({
  boards,
  onOpenBreakout,
}: StudentBoardSectionsProps) {
  const router = useRouter();
  const [shadowAllianceStatuses, setShadowAllianceStatuses] = useState<
    Record<string, ShadowAllianceBoardStatus>
  >({});
  const [activeCategory, setActiveCategory] = useState<"LESSON" | "PLAY">(() =>
    boards.some((b) => b.category === "LESSON") ? "LESSON" : "PLAY",
  );
  const lessonBoards = boards.filter((b) => b.category === "LESSON");
  const playBoards = boards.filter((b) => b.category === "PLAY");
  const activeBoards = activeCategory === "LESSON" ? lessonBoards : playBoards;

  useEffect(() => {
    const shadowAllianceBoards = boards.filter(
      (board) => board.layout === "shadow-alliance",
    );
    if (shadowAllianceBoards.length === 0) return;

    let disposed = false;
    const client = createPublicSupabaseClient();
    const channels: RealtimeChannel[] = [];
    const statusFromPhase = (
      phase: ShadowAllianceSnapshot["phase"],
    ): ShadowAllianceBoardStatus =>
      phase === "lobby" ? "waiting" : phase === "final" ? "ended" : "active";

    for (const board of shadowAllianceBoards) {
      const channel = client.channel(`shadow-alliance-board-${board.id}`, {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
        const snapshot = (payload as { snapshot?: ShadowAllianceSnapshot }).snapshot;
        if (!snapshot || disposed) return;
        setShadowAllianceStatuses((current) => ({
          ...current,
          [board.id]: statusFromPhase(snapshot.phase),
        }));
      });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.send({ type: "broadcast", event: "hello", payload: {} });
        }
      });
      channels.push(channel);
    }

    return () => {
      disposed = true;
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [boards]);

  const boardThumbnail = (board: BoardItem) => {
    if (board.thumbnailMode === "custom" && board.thumbnailUrl) {
      return board.thumbnailUrl;
    }
    return layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL;
  };

  const renderCard = (board: BoardItem) => {
    const thumbnail = boardThumbnail(board);
    const quizCode = board.layout === "quiz" && board.quizzes?.[0]?.roomCode;
    const kordleMeta =
      board.layout === "kordle"
        ? board.kordleStatus === "LIVE"
          ? "진행 중"
          : board.kordleStatus === "DRAFT"
            ? "시작 대기"
            : "게임 없음"
        : null;
    const gameMeta =
      kordleMeta ??
      (board.layout === "speed-game"
        ? board.speedGameStatus === "running"
          ? "진행 중"
          : board.speedGameStatus === "finished"
            ? "종료"
            : "시작 대기"
        : board.layout === "shadow-alliance"
          ? SHADOW_ALLIANCE_STATUS_LABELS[
              shadowAllianceStatuses[board.id] ?? "waiting"
            ]
          : null);
    const href = quizCode
      ? `/quiz/${quizCode}`
      : board.layout === "kordle"
        ? `/board/${board.slug}/play/kordle`
        : `/board/${board.slug}`;
    const breakout = board.breakout;
    if (breakout) {
      return (
        <button
          key={board.id}
          type="button"
          className="student-board-card"
          onClick={() => {
            if (breakout.selectedSectionId) {
              router.push(
                `/board/${breakout.boardSlug}/s/${breakout.selectedSectionId}`,
              );
              return;
            }
            onOpenBreakout({ sourceTitle: board.title, breakout });
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
            <span className="student-board-card-title">{board.title}</span>
            <span className="student-board-card-meta">
              모둠 선택 · {breakout.boardTitle}
            </span>
          </div>
        </button>
      );
    }
    return (
      <Link key={board.id} href={href} className="student-board-card">
        <div className="student-board-preview">
          <img
            className="student-board-preview-img"
            src={thumbnail}
            alt={`${layoutLabel(board.layout)} 화면 미리보기`}
          />
        </div>
        <div className="student-board-card-body">
          <span className="student-board-card-title">{board.title}</span>
          <span className="student-board-card-meta">
            {gameMeta ?? layoutLabel(board.layout)}
            {quizCode && " · 참여하기"}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <>
      <div className="board-section-tabs" role="tablist" aria-label="보드 구분">
        <div className="board-section-tabs-list">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "LESSON"}
            className={`board-section-tab ${activeCategory === "LESSON" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("LESSON")}
          >
            수업
            <span className="board-section-tab-count">
              {lessonBoards.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "PLAY"}
            className={`board-section-tab ${activeCategory === "PLAY" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("PLAY")}
          >
            놀이
            <span className="board-section-tab-count">{playBoards.length}</span>
          </button>
        </div>
      </div>
      <div className="student-board-grid">
        {activeBoards.map((board) => renderCard(board))}
      </div>
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
        router.push(`/board/${breakout.boardSlug}/s/${group.entrySectionId}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.membership?.sectionId) {
        router.push(
          `/board/${breakout.boardSlug}/s/${data.membership.sectionId}`,
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
