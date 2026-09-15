import { db } from "@/lib/db";
import { KordleBoard } from "./KordleBoard";
import { KordleLiveToasts } from "./KordleLiveToasts";
import { KordleTeacherControls } from "./KordleTeacherControls";
import { KordleTeacherParticipants } from "./KordleTeacherParticipants";
import { KordleLobbyParticipants } from "./KordleLobbyParticipants";
import { ensureAttempt, getPublicState } from "../server/kordleServer";

type Props = {
  boardId: string;
  teacherUserId: string;
};

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "DRAFT":
      return "시작 대기";
    case "LIVE":
      return "진행 중";
    case "SCHEDULED":
      return "예약됨";
    case "CLOSED":
      return "종료";
    case "ARCHIVED":
      return "보관됨";
    default:
      return "퍼즐 없음";
  }
}

export async function KordleTeacherBoard({ boardId, teacherUserId }: Props) {
  const game = await db.kordleGame.findUnique({
    where: { boardId },
    select: {
      id: true,
      title: true,
      wordLength: true,
      maxGuesses: true,
      locale: true,
      puzzles: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          version: true,
          startsAt: true,
          endsAt: true,
          solutionWord: { select: { text: true } },
          attempts: {
            where: { studentId: { not: null } },
            orderBy: { startedAt: "asc" },
            select: {
              id: true,
              student: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!game) {
    return (
      <section className="kordle-shell">
        <div className="kordle-teacher-card">
          <h2>게임 설정이 필요합니다</h2>
          <p>이 보드에 연결된 꼬들 게임 정보를 찾지 못했어요.</p>
        </div>
      </section>
    );
  }

  const puzzle = game.puzzles[0] ?? null;
  const participants = puzzle
    ? puzzle.attempts
        .map((attempt) =>
          attempt.student
            ? {
                id: attempt.student.id,
                name: attempt.student.name,
              }
            : null,
        )
        .filter((participant): participant is { id: string; name: string } => Boolean(participant))
    : [];
  const puzzleSummaryText =
    puzzle?.status === "DRAFT"
      ? "시작 대기 중"
      : puzzle?.status === "CLOSED"
        ? "라운드 종료"
        : puzzle?.startsAt
          ? `시작 ${puzzle.startsAt.toLocaleString("ko-KR")}`
          : "바로 플레이 가능";
  const setupTitle = puzzle
    ? puzzle.status === "CLOSED"
      ? "다음 라운드를 준비하세요"
      : puzzle.status === "DRAFT"
        ? "문제를 확인하고 시작하세요"
        : "예약된 문제를 확인하세요"
    : "첫 문제를 출제하세요";
  if (puzzle?.status === "LIVE") {
    const attemptId = await ensureAttempt({
      puzzleId: puzzle.id,
      studentId: null,
      vibePlaySessionId: null,
      teacherUserId,
    });
    const state = await getPublicState({
      attemptId,
      studentId: null,
      vibePlaySessionId: null,
      teacherUserId,
    });
    if (state) {
      return (
        <section className="kordle-shell kordle-shell--teacher-live">
          <div className="kordle-teacher-statusbar">
            <span className="kordle-status-pill">{statusLabel(puzzle.status)}</span>
          </div>
          <KordleTeacherControls
            boardId={boardId}
            initialLocale={game.locale}
            puzzleId={puzzle.id}
            puzzleStatus={puzzle.status}
            puzzleVersion={Number(puzzle.version)}
          />
          <div className="kordle-teacher-live-layout">
            <KordleBoard
              boardId={boardId}
              attemptId={attemptId}
              initialState={state}
              locale={game.locale}
              viewer="teacher"
            />
            <aside className="kordle-teacher-live-panel" aria-label="라운드별 제출 현황">
              <KordleTeacherParticipants
                boardId={boardId}
                puzzleId={puzzle.id}
                initialStatus={puzzle.status}
                initialVersion={Number(puzzle.version)}
                initialParticipants={participants}
                maxGuesses={game.maxGuesses}
              />
            </aside>
          </div>
          <KordleLiveToasts boardId={boardId} />
        </section>
      );
    }
  }

  return (
    <section className="kordle-shell kordle-shell--teacher-setup">
      <div className="kordle-teacher-card kordle-teacher-card--setup">
        <div className="kordle-teacher-statusbar">
          <span className="kordle-status-pill">{statusLabel(puzzle?.status)}</span>
        </div>
        <div className="kordle-teacher-hero">
          <h2>{setupTitle}</h2>
        </div>
        <KordleTeacherControls
          boardId={boardId}
          initialLocale={game.locale}
          puzzleId={puzzle?.id ?? null}
          puzzleStatus={puzzle?.status ?? null}
          puzzleVersion={puzzle ? Number(puzzle.version) : 0}
        />

        <div className="kordle-teacher-layout">
          <div className="kordle-teacher-panel">
            <dl>
              <div>
                <dt>단어 길이</dt>
                <dd>{game.wordLength}</dd>
              </div>
              <div>
                <dt>시도 횟수</dt>
                <dd>{game.maxGuesses}</dd>
              </div>
            </dl>

            <KordleLobbyParticipants boardId={boardId} />

            {puzzle ? (
              <div className="kordle-puzzle-summary">
                <span>현재 퍼즐</span>
                <strong>{puzzle.solutionWord.text}</strong>
                <small>
                  {puzzleSummaryText}
                </small>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
