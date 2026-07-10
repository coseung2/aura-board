"use client";

import { useEffect, useState } from "react";
import type { ShadowAlliancePlayerSnapshot, ShadowAllianceSnapshot } from "../types";

type Props = {
  connection: string;
  joinPending: boolean;
  player: ShadowAlliancePlayerSnapshot | null;
  snapshot: ShadowAllianceSnapshot;
  onRetryJoin: () => void;
  onSubmitNumber: (number: number) => void;
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ShadowAllianceStudentGame({
  connection,
  joinPending,
  player,
  snapshot,
  onRetryJoin,
  onSubmitNumber,
}: Props) {
  const [number, setNumber] = useState(50);

  useEffect(() => {
    if (snapshot.phase === "playing") setNumber(50);
  }, [snapshot.phase, snapshot.round]);

  if (!player) {
    return (
      <main className="shadow-alliance-game shadow-alliance-student shadow-alliance-centered">
        <p className="shadow-alliance-eyebrow">익명 대기실</p>
        <h1>그림자연합</h1>
        <p>{joinPending ? "익명 공작원으로 합류하는 중입니다." : "교사 본부와 연결하는 중입니다."}</p>
        <span className={`shadow-alliance-connection is-${connection}`}>실시간 연결 상태: {connection}</span>
        {!joinPending && (
          <button type="button" className="shadow-alliance-button secondary" onClick={onRetryJoin}>
            다시 연결
          </button>
        )}
      </main>
    );
  }

  const result = snapshot.lastResult;
  const ownGain = result?.gains[player.id] ?? 0;

  return (
    <main className="shadow-alliance-game shadow-alliance-student shadow-alliance-centered">
      <header className="shadow-alliance-student-header">
        <span className={`shadow-alliance-team shadow-alliance-team-${player.team}`} />
        <div>
          <p className="shadow-alliance-eyebrow">익명 공작원</p>
          <h1>{player.nick}</h1>
        </div>
        <strong>{player.power.toLocaleString()} 점</strong>
      </header>

      {snapshot.phase === "lobby" && (
        <section className="shadow-alliance-panel shadow-alliance-student-card">
          <p className="shadow-alliance-eyebrow">입장 완료</p>
          <h2>교사가 게임을 시작하면 첫 지령이 도착합니다.</h2>
          <p>닉네임과 소속은 게임 안에서만 쓰이며, 실제 이름은 표시되지 않습니다.</p>
        </section>
      )}

      {snapshot.phase === "playing" && (
        <section className="shadow-alliance-panel shadow-alliance-student-card">
          <p className="shadow-alliance-eyebrow">ROUND {snapshot.round} / {snapshot.totalRounds}</p>
          <p className="shadow-alliance-command-label">중앙 지령</p>
          <strong className="shadow-alliance-student-command">{snapshot.command}</strong>
          <p className="shadow-alliance-timer">{formatTime(snapshot.timeLeft)}</p>
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
      )}

      {result && (snapshot.phase === "revealing" || snapshot.phase === "postround") && (
        <section className="shadow-alliance-panel shadow-alliance-student-card">
          <p className="shadow-alliance-eyebrow">라운드 결과</p>
          <h2>
            {result.winner === "tie"
              ? "이번 라운드는 무승부입니다"
              : result.winner === player.team
                ? "우리 연합이 승리했습니다"
                : "상대 연합이 승리했습니다"}
          </h2>
          <p>이번에 얻은 점수 <strong>{ownGain.toLocaleString()} 점</strong></p>
        </section>
      )}

      {snapshot.phase === "final" && (
        <section className="shadow-alliance-panel shadow-alliance-student-card">
          <p className="shadow-alliance-eyebrow">최종 결과</p>
          <h2>수고했습니다, {player.nick} 공작원.</h2>
          <p>최종 점수 <strong>{player.power.toLocaleString()} 점</strong></p>
        </section>
      )}
    </main>
  );
}
