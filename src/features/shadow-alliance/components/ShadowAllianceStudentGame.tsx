"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ShadowAlliancePlayer,
  ShadowAlliancePlayerSnapshot,
  ShadowAllianceSnapshot,
  ShadowAllianceTeam,
} from "../types";

type Props = {
  connection: string;
  joinPending: boolean;
  player: ShadowAlliancePlayerSnapshot | null;
  snapshot: ShadowAllianceSnapshot;
  onRetryJoin: () => void;
  onSubmitNumber: (number: number) => void;
  onContinue?: () => void;
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function connectionLabel(connection: string) {
  if (connection === "connected") return "실시간 연결";
  if (connection === "reconnecting") return "연결 복구 중";
  if (connection === "offline") return "연결 끊김";
  return "연결 중";
}

function teamLabel(team: ShadowAllianceTeam) {
  return team === "black" ? "블랙 연합" : "화이트 연합";
}

function TeamBadge({ team }: { team: ShadowAllianceTeam }) {
  return <span className={`shadow-alliance-team shadow-alliance-team-${team}`} />;
}

function TeamRoster({
  team,
  players,
}: {
  team: ShadowAllianceTeam;
  players: ShadowAlliancePlayer[];
}) {
  const label = teamLabel(team);
  return (
    <section
      className={`shadow-alliance-team-roster shadow-alliance-team-roster-${team}`}
      aria-labelledby={`shadow-alliance-student-${team}-roster-title`}
    >
      <div className="shadow-alliance-team-roster-heading">
        <div className="shadow-alliance-team-roster-label">
          <TeamBadge team={team} />
          <h3 id={`shadow-alliance-student-${team}-roster-title`}>{label}</h3>
        </div>
        <strong>{players.length}명</strong>
      </div>
      {players.length === 0 ? (
        <p className="shadow-alliance-team-empty">아직 배정된 공작원이 없습니다.</p>
      ) : (
        <ul className="shadow-alliance-team-player-list">
          {players.map((entry) => (
            <li key={entry.id}>
              <span>{entry.nick}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreparingStatus() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDotCount((current) => (current % 3) + 1);
    }, 450);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <h2 className="shadow-alliance-preparing" aria-live="polite">
      게임 준비중
      <span className="shadow-alliance-preparing-dots" aria-hidden="true">
        {".".repeat(dotCount)}
      </span>
    </h2>
  );
}

export function ShadowAllianceStudentGame({
  connection,
  joinPending,
  player,
  snapshot,
  onRetryJoin,
  onSubmitNumber,
  onContinue,
}: Props) {
  const [number, setNumber] = useState(50);

  useEffect(() => {
    if (snapshot.phase === "playing") setNumber(50);
  }, [snapshot.phase, snapshot.round]);

  const rosterPlayers = useMemo<ShadowAlliancePlayer[]>(
    () =>
      snapshot.players.map((entry) => ({
        id: entry.id,
        nick: entry.nick,
        team: entry.team,
        power: entry.power,
        number: null,
        lastGain: entry.lastGain,
      })),
    [snapshot.players],
  );

  const playersByTeam = {
    black: rosterPlayers.filter((entry) => entry.team === "black"),
    white: rosterPlayers.filter((entry) => entry.team === "white"),
  };

  if (!player) {
    return (
      <main className="shadow-alliance-game shadow-alliance-student">
        <header className="shadow-alliance-topbar">
          <div>
            <p className="shadow-alliance-eyebrow">익명 대기실</p>
            <h1>그림자연합</h1>
          </div>
          <div className="shadow-alliance-topbar-status">
            <span className={`shadow-alliance-connection is-${connection}`}>
              {connectionLabel(connection)}
            </span>
            {onContinue ? (
              <button
                type="button"
                className="shadow-alliance-button secondary"
                onClick={onContinue}
              >
                다음에 이어하기
              </button>
            ) : null}
          </div>
        </header>
        <section className="shadow-alliance-panel shadow-alliance-student-stage">
          <PreparingStatus />
          {!joinPending ? (
            <button
              type="button"
              className="shadow-alliance-button secondary"
              onClick={onRetryJoin}
            >
              다시 연결
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const result = snapshot.lastResult;
  const ownGain = result?.gains[player.id] ?? player.lastGain ?? 0;

  return (
    <main className="shadow-alliance-game shadow-alliance-student">
      <header className="shadow-alliance-topbar">
        <div className="shadow-alliance-student-identity">
          <span
            className={`shadow-alliance-team shadow-alliance-team-${player.team}`}
            aria-hidden
          />
          <div>
            <p className="shadow-alliance-eyebrow">익명 공작원</p>
            <h1>{player.nick}</h1>
            <p className="shadow-alliance-student-team">{teamLabel(player.team)}</p>
          </div>
        </div>
        <div className="shadow-alliance-topbar-status">
          <span className={`shadow-alliance-connection is-${connection}`}>
            {connectionLabel(connection)}
          </span>
          {onContinue ? (
            <button
              type="button"
              className="shadow-alliance-button secondary"
              onClick={onContinue}
            >
              다음에 이어하기
            </button>
          ) : null}
          <strong className="shadow-alliance-student-power">
            {player.power.toLocaleString()} 점
          </strong>
        </div>
      </header>

      {snapshot.phase === "lobby" ? (
        <section className="shadow-alliance-student-lobby">
          <div className="shadow-alliance-student-preparing-row">
            <PreparingStatus />
          </div>
          <div className="shadow-alliance-team-roster-grid shadow-alliance-student-team-grid">
            <TeamRoster team="black" players={playersByTeam.black} />
            <TeamRoster team="white" players={playersByTeam.white} />
          </div>
        </section>
      ) : null}

      {snapshot.phase === "playing" ? (
        <section className="shadow-alliance-student-play">
          <div className="shadow-alliance-round-focus shadow-alliance-student-focus">
            <p className="shadow-alliance-eyebrow">
              ROUND {snapshot.round} / {snapshot.totalRounds}
            </p>
            <p className="shadow-alliance-command-label">중앙 지령</p>
            <strong className="shadow-alliance-student-command">
              {snapshot.command ?? "-"}
            </strong>
            <p className="shadow-alliance-timer">{formatTime(snapshot.timeLeft)}</p>
          </div>
          <section className="shadow-alliance-panel shadow-alliance-student-stage">
            {player.submitted && !snapshot.editable ? (
              <p className="shadow-alliance-submitted">응답을 전송했습니다.</p>
            ) : (
              <form
                className="shadow-alliance-answer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitNumber(number);
                }}
              >
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={number}
                  onChange={(event) => setNumber(Number(event.target.value))}
                  aria-label="제출 숫자"
                />
                <button type="submit" className="shadow-alliance-button primary">
                  {player.submitted ? "수정 제출" : "숫자 제출"}
                </button>
              </form>
            )}
          </section>
        </section>
      ) : null}

      {result &&
      (snapshot.phase === "revealing" || snapshot.phase === "postround") ? (
        <section className="shadow-alliance-panel shadow-alliance-student-stage">
          <p className="shadow-alliance-eyebrow">라운드 결과</p>
          <h2>
            {result.winner === "tie"
              ? "이번 라운드는 무승부입니다"
              : result.winner === player.team
                ? "우리 연합이 승리했습니다"
                : "상대 연합이 승리했습니다"}
          </h2>
          <p>
            이번에 얻은 점수 <strong>{ownGain.toLocaleString()} 점</strong>
          </p>
        </section>
      ) : null}

      {snapshot.phase === "final" ? (
        <section className="shadow-alliance-panel shadow-alliance-student-stage">
          <p className="shadow-alliance-eyebrow">최종 결과</p>
          <h2>수고했습니다, {player.nick} 공작원.</h2>
          <p>
            최종 점수 <strong>{player.power.toLocaleString()} 점</strong>
          </p>
        </section>
      ) : null}
    </main>
  );
}
