import Link from "next/link";
import { GameLobby } from "@/components/game-platform/GameLobby";
import { GameResultPanel } from "@/components/game-platform/GameResultPanel";
import type { SpeedGameWire } from "./types";
import { participantState, type ParticipantAction, type RunAction } from "./speed-game-board-utils";

export function SpeedGameTerminalPanel({
  game, viewerKind, busy, reconnecting, error, currentParticipant, currentGroup,
  onRunAction: mutateRun, onParticipantAction: executeParticipantCommand,
}: {
  game: SpeedGameWire | null;
  viewerKind: "teacher" | "student" | "none";
  busy: boolean;
  reconnecting: boolean;
  error: string | null;
  currentParticipant: SpeedGameWire["participants"][number] | null;
  currentGroup: SpeedGameWire["groups"][number] | null;
  onRunAction: (action: RunAction) => Promise<void>;
  onParticipantAction: (action: ParticipantAction) => Promise<unknown>;
}) {
  if (!game) {
    return (
      <section className="speed-game-empty" role={error ? "alert" : "status"}>
        <h2>{error ? "게임을 불러오지 못했어요" : "스피드게임 준비 중"}</h2>
        {error && <p>{error}</p>}
        <Link href={viewerKind === "teacher" ? "/dashboard?category=play" : "/student/boards?category=play"}>게임 목록</Link>
      </section>
    );
  }

  if (viewerKind === "none") {
    return (
      <section className="speed-game-empty" role="alert">
        <h2>접근할 수 없어요</h2>
        <p>이 게임을 볼 권한이 없습니다.</p>
      </section>
    );
  }

  if (game.status === "waiting") {
    return (
      <>
        <GameLobby
          title="스피드게임 대기실"
          description={viewerKind === "teacher" ? "참가 학생이 준비되면 시작할 수 있어요." : currentGroup ? `${currentGroup.name} · 내 순서를 확인해 주세요.` : "모둠 배정을 기다리는 중이에요."}
          participants={game.participants.map((participant) => ({
            id: participant.studentId,
            name: participant.name,
            representativePet: participant.representativePet ?? null,
            state: participantState(participant),
          }))}
          actions={
            <>
              {viewerKind === "teacher" ? (
                <button
                  type="button"
                  className="speed-game-primary-button"
                  disabled={busy}
                  onClick={() => void mutateRun("start")}
                >
                  게임 시작
                </button>
              ) : null}
              {viewerKind === "student" && currentParticipant?.joinedAt && !currentParticipant.forfeitedAt && !currentParticipant.readyAt ? (
                <button
                  type="button"
                  className="speed-game-primary-button"
                  disabled={busy || Boolean(currentParticipant.readyAt)}
                  onClick={() => void executeParticipantCommand("ready")}
                >
                  준비하기
                </button>
              ) : null}
              {viewerKind === "student" && currentParticipant && !currentParticipant.joinedAt && !currentParticipant.forfeitedAt && error && (
                <button type="button" className="speed-game-primary-button" disabled={busy}
                  onClick={() => void executeParticipantCommand("join")}>다시 입장</button>
              )}
            </>
          }
        />
        {reconnecting ? (
          <p className="speed-game-notice" role="status">
            실시간 연결 복구 중이에요.
          </p>
        ) : null}
        {error ? <p className="speed-game-error" role="alert">{error}</p> : null}
      </>
    );
  }

  if (game.status === "finished") {
    const ownRow = currentGroup
      ? game.leaderboard.find((row) => row.groupId === currentGroup.id)
      : null;
    const ownRank = ownRow
      ? game.leaderboard.findIndex((row) => row.groupId === ownRow.groupId) + 1
      : null;
    return (
      <GameResultPanel
        outcome={
          game.terminalReason === "host_ended"
            ? "host-ended"
            : currentParticipant?.forfeitedAt
              ? "forfeit"
              : "completed"
        }
        score={ownRow?.score ?? null}
        metrics={[
          ...(ownRank == null ? [] : [{ label: "모둠 순위", value: `${ownRank}위` }]),
          { label: "라운드", value: `${game.rounds.length}개` },
        ]}
        message={
          game.terminalReason === "host_ended"
            ? "진행자가 게임을 종료했어요."
            : "게임이 완료되었습니다."
        }
        retryAction={
          viewerKind === "teacher" ? (
            <button
              type="button"
              className="speed-game-primary-button"
              disabled={busy}
              onClick={() => void mutateRun("rematch")}
            >
              다시 하기
            </button>
          ) : null
        }
        gamesAction={
          <Link className="speed-game-secondary-button" href={viewerKind === "teacher" ? "/dashboard?category=play" : "/student/boards?category=play"}>
            게임 목록
          </Link>
        }
        recordsAction={
          viewerKind === "student" ? (
            <Link
              className="speed-game-secondary-button"
              href="/student/boards?category=records&game=speed-game"
            >
              나의 전적
            </Link>
          ) : null
        }
      />
    );
  }


  return null;
}
