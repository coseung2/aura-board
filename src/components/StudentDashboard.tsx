"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, CircleCheck, MessageCircle } from "lucide-react";
import { formatBpsPercent } from "@/lib/pets/math";
import { studentHomeHeroRendererScale } from "@/lib/pets/slime-sprite-geometry";
import type {
  SlimeColor,
  SlimeEffectKey,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import type {
  StudentAssignmentTodo,
  StudentDailyRewardProgress,
  StudentHomeBoard as BoardItem,
} from "@/lib/student-home-types";
import { isStudentAssignmentReminded } from "@/lib/student-home-types";
const STUDENT_ASSIGNMENT_VISIBLE_LIMIT = 4;

function formatAssignmentDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

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
  dailyRewards?: { comment: StudentDailyRewardProgress };
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
  assignments = [],
  dailyRewards,
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
      <div className="student-daily-game-panel">
        <div className="student-daily-game-header">
          <h2>대표 펫</h2>
          <h2>오늘 보상</h2>
        </div>
        <div className="student-daily-game-body">
          <StudentSlimeCard
            snapshot={slimeHome}
            loading={slimeLoading}
            error={slimeError}
            onRetry={loadSlimeHome}
          />
          <StudentDailyRewardPanel dailyRewards={dailyRewards} />
        </div>
      </div>

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
                <ChevronRight size={16} aria-hidden="true" strokeWidth={1.6} />
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

    </>
  );
}

function StudentDailyRewardPanel({
  dailyRewards,
}: {
  dailyRewards?: { comment: StudentDailyRewardProgress };
}) {
  const comment = dailyRewards?.comment;
  const status = !comment
    ? "확인 중"
    : !comment.enabled
      ? "보상 없음"
      : comment.complete
        ? "오늘 완료"
        : `${comment.earnedCount}/${comment.dailyCap} 받음`;

  return (
    <section className="student-daily-reward-panel" aria-label="오늘 보상">
      <Link href="/student/boards" className="student-daily-reward-row">
        <MessageCircle size={18} aria-hidden="true" className="student-daily-reward-icon" />
        <span className="student-daily-reward-label">댓글</span>
        <span className={`student-daily-reward-status${comment?.complete ? " is-complete" : ""}`}>
          {status}
        </span>
        {comment?.complete ? (
          <CircleCheck size={18} aria-hidden="true" className="student-daily-reward-complete" />
        ) : (
          <ChevronRight size={18} aria-hidden="true" className="student-daily-reward-chevron" />
        )}
      </Link>
    </section>
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
            data-renderer-scale={studentHomeHeroRendererScale(hasSlimeScene)}
          >
            <SlimeCharacterSprite
              slime={slime}
              items={assignedItems}
              scale={studentHomeHeroRendererScale(hasSlimeScene)}
              hostBackground
            />
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
  const [showAll, setShowAll] = useState(false);
  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = showAll
    ? filtered
    : filtered.slice(0, STUDENT_ASSIGNMENT_VISIBLE_LIMIT);
  const hiddenCount = Math.max(filtered.length - visibleItems.length, 0);
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
      {filtered.length > STUDENT_ASSIGNMENT_VISIBLE_LIMIT ? (
        <button
          type="button"
          className="student-assignment-expand"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
        >
          {showAll
            ? "접기 ↑"
            : `${filter === "missing" ? "미제출" : "완료"} 과제 ${hiddenCount}개 더 보기 ↓`}
        </button>
      ) : null}
    </section>
  );
}


export { StudentBoardHub } from "@/app/student/_components/StudentBoardHub";
