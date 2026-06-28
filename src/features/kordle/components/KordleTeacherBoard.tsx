import { db } from "@/lib/db";
import { GameParticipantsList } from "@/features/games/components/GameParticipantsList";
import { KordleBoard } from "./KordleBoard";
import { KordleLiveToasts } from "./KordleLiveToasts";
import { KordleTeacherControls } from "./KordleTeacherControls";
import { ensureAttempt, getPublicState } from "../server/kordleServer";

type Props = {
  boardId: string;
  teacherUserId: string;
};

function localeLabel(locale: string) {
  return locale === "ko-KR" ? "한글" : "영어";
}

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

function EmptyGrid({ wordLength, maxGuesses }: { wordLength: number; maxGuesses: number }) {
  return (
    <div
      className="kordle-grid"
      role="grid"
      aria-label="꼬들 퍼즐판 미리보기"
      style={
        {
          "--kordle-rows": maxGuesses,
          "--kordle-cols": wordLength,
        } as React.CSSProperties
      }
    >
      {Array.from({ length: maxGuesses }).map((_, rowIndex) => (
        <div className="kordle-row" role="row" key={rowIndex}>
          {Array.from({ length: wordLength }).map((__, colIndex) => (
            <div
              className="kordle-cell kordle-cell--empty"
              role="gridcell"
              aria-label="empty"
              key={colIndex}
            />
          ))}
        </div>
      ))}
    </div>
  );
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
          _count: { select: { attempts: true } },
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
  const attemptCount = puzzle?._count.attempts ?? 0;
  const puzzleSummaryText =
    puzzle?.status === "DRAFT"
      ? "시작 대기 중"
      : puzzle?.status === "CLOSED"
        ? "라운드 종료"
        : puzzle?.startsAt
          ? `시작 ${puzzle.startsAt.toLocaleString("ko-KR")}`
          : "바로 플레이 가능";

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
        <section className="kordle-shell">
          <div className="kordle-teacher-statusbar">
            <span className="kordle-status-pill">{statusLabel(puzzle.status)}</span>
          </div>
          <KordleTeacherControls
            boardId={boardId}
            initialLocale={game.locale}
            puzzleId={puzzle.id}
            puzzleStatus={puzzle.status}
          />
          <KordleBoard
            boardId={boardId}
            attemptId={attemptId}
            initialState={state}
            locale={game.locale}
          />
          <KordleLiveToasts boardId={boardId} />
        </section>
      );
    }
  }

  return (
    <section className="kordle-shell">
      <div className="kordle-teacher-card">
        <div className="kordle-teacher-statusbar">
          <span className="kordle-status-pill">{statusLabel(puzzle?.status)}</span>
        </div>
        <KordleTeacherControls
          boardId={boardId}
          initialLocale={game.locale}
          puzzleId={puzzle?.id ?? null}
          puzzleStatus={puzzle?.status ?? null}
        />

        <div className="kordle-teacher-layout">
          <div>
            <EmptyGrid wordLength={game.wordLength} maxGuesses={game.maxGuesses} />
          </div>
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
              <div>
                <dt>언어</dt>
                <dd>{localeLabel(game.locale)}</dd>
              </div>
              <div>
                <dt>참여</dt>
                <dd>{attemptCount}명</dd>
              </div>
            </dl>

            {puzzle && (
              <GameParticipantsList
                className="kordle-participant-list"
                participants={puzzle.attempts
                  .map((attempt) =>
                    attempt.student
                      ? {
                          id: attempt.student.id,
                          name: attempt.student.name,
                        }
                      : null,
                  )
                  .filter((participant): participant is { id: string; name: string } => Boolean(participant))}
              />
            )}

            {puzzle ? (
              <div className="kordle-puzzle-summary">
                <span>현재 퍼즐</span>
                <strong>{puzzle.solutionWord.text}</strong>
                <small>
                  {puzzleSummaryText}
                </small>
              </div>
            ) : (
              <p className="kordle-teacher-empty">
                아직 발행된 퍼즐이 없어요. 퍼즐이 생기면 학생들은 각자 같은 문제를
                자기 화면에서 풀게 됩니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
