"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";
import type { StudentHomeBoard as BoardItem, StudentHomeBreakout as StudentBreakout } from "@/lib/student-home-types";
import { parseStudentBoardCategory, STUDENT_BOARD_CATEGORIES, type StudentBoardCategory } from "@/components/student/student-board-navigation";
import { GameHubCatalog } from "@/components/game-platform/GameHubCatalog";
import { GameRecordsPanel } from "@/components/game-platform/GameRecordsPanel";
import { GAME_HUB_ORDER } from "@/lib/game-platform/catalog";
import { isGameRecordRange, isOfficialGameKind, type GameRecordRange, type OfficialGameKind } from "@/lib/game-platform/contracts";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

type BreakoutGroup = {
  groupIndex: number;
  entrySectionId: string;
  totalCount: number;
  sections: Array<{ id: string; title: string; count: number }>;
};

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

export function StudentBoardHub({ boards }: StudentBoardHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [breakoutModal, setBreakoutModal] = useState<{
    sourceTitle: string;
    breakout: StudentBreakout;
  } | null>(null);
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
  const requestedCategory =
    searchParams.get("category") === "play" &&
    searchParams.get("playTab") === "records"
      ? "records"
      : parseStudentBoardCategory(searchParams.get("category"));
  const [activeCategory, setActiveCategory] =
    useState<StudentBoardCategory>(requestedCategory);
  const lessonBoards = boards
    .filter((board) => !isOfficialGameKind(board.layout))
    .filter((board) => board.category === "LESSON");
  const activeBoards = lessonBoards
    .slice()
    .sort(
      (left, right) =>
        Number(boardListState(right).live) - Number(boardListState(left).live),
    );

  useEffect(() => {
    setActiveCategory(requestedCategory);
  }, [requestedCategory]);

  function replaceBoardQuery(category: StudentBoardCategory) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set("category", category);
    nextSearchParams.delete("q");
    nextSearchParams.delete("playTab");
    nextSearchParams.delete("playType");
    if (category !== "records") {
      nextSearchParams.delete("game");
      nextSearchParams.delete("range");
    }

    router.replace(`/student/boards?${nextSearchParams.toString()}`, { scroll: false });
  }

  function selectCategory(category: StudentBoardCategory) {
    setActiveCategory(category);
    replaceBoardQuery(category);
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
    count?: number;
  }> = [
    { id: "lesson", label: "수업", count: lessonBoards.length },
    { id: "play", label: "놀이", count: GAME_HUB_ORDER.length + 1 },
    { id: "records", label: "전적" },
  ];

  return (
    <>
      <div className="board-section-tabs" role="tablist" aria-label="보드 구분">
        <div className="board-section-tabs-list">
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
              className={`board-section-tab ${
                activeCategory === tab.id ? "is-active" : ""
              }`}
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
              {tab.count !== undefined ? (
                <span className="board-section-tab-count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <section
        id="student-board-panel"
        className="student-board-panel"
        role="tabpanel"
        aria-labelledby={`student-board-tab-${activeCategory}`}
      >
        {activeCategory === "records" ? (
          <GameRecordsPanel
            key={`${requestedRecordKind}:${requestedRecordRange}`}
            initialGameKind={requestedRecordKind}
            initialRange={requestedRecordRange}
          />
        ) : activeCategory === "play" ? (
          <GameHubCatalog />
        ) : (
          <>
            <p className="sr-only" role="status" aria-live="polite">
              수업 보드 {activeBoards.length}개
            </p>
            {activeBoards.length > 0 ? (
              <div className="student-board-grid">
                {activeBoards.map((board) => renderCard(board))}
              </div>
            ) : (
              <div className="student-board-empty">수업 보드가 아직 없어요.</div>
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
