"use client";

import type { ShadowAllianceGame, ShadowAlliancePlayer } from "../types";

type Props = {
  game: ShadowAllianceGame;
  connection: string;
  rankings: ShadowAlliancePlayer[];
  onAddPlayer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onRebalanceTeams: () => void;
  onSetSettings: (settings: { editable?: boolean; timerSec?: number }) => void;
  onStartGame: () => void;
  onNextRound: () => void;
  onRevealRound: () => void;
  onShowPostround: () => void;
  onSetTimerRunning: (running: boolean) => void;
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function TeamBadge({ team }: { team: "black" | "white" }) {
  return <span className={`shadow-alliance-team shadow-alliance-team-${team}`} />;
}

export function ShadowAllianceTeacherGame({
  game,
  connection,
  rankings,
  onAddPlayer,
  onRemovePlayer,
  onRebalanceTeams,
  onSetSettings,
  onStartGame,
  onNextRound,
  onRevealRound,
  onShowPostround,
  onSetTimerRunning,
}: Props) {
  const submittedCount = game.players.filter((player) => player.number !== null).length;

  const lobby = game.phase === "lobby";
  const result = game.lastResult;

  return (
    <main className="shadow-alliance-game shadow-alliance-teacher">
      <header className="shadow-alliance-topbar">
        <div>
          <p className="shadow-alliance-eyebrow">교사 본부</p>
          <h1>그림자연합</h1>
        </div>
        <span className={`shadow-alliance-connection is-${connection}`}>
          {connection === "connected" ? "실시간 연결" : "연결 복구 중"}
        </span>
      </header>

      {lobby && (
        <section className="shadow-alliance-teacher-grid">
          <div className="shadow-alliance-panel shadow-alliance-lobby-note">
            <p className="shadow-alliance-eyebrow">학생 입장 대기</p>
            <h2>학생은 이 보드를 열면 익명 공작원으로 자동 합류합니다.</h2>
            <p>QR 코드, 링크, 방 코드는 필요하지 않습니다.</p>
          </div>
          <div className="shadow-alliance-panel">
            <div className="shadow-alliance-panel-heading">
              <h2>게임 설정</h2>
            </div>
            <label className="shadow-alliance-field">
              <span>응답 시간</span>
              <select
                value={game.timerSec}
                onChange={(event) => onSetSettings({ timerSec: Number(event.target.value) })}
              >
                <option value={180}>3분</option>
                <option value={300}>5분</option>
                <option value={420}>7분</option>
                <option value={600}>10분</option>
              </select>
            </label>
            <label className="shadow-alliance-check">
              <input
                type="checkbox"
                checked={game.editable}
                onChange={(event) => onSetSettings({ editable: event.target.checked })}
              />
              제출 뒤 숫자 수정 허용
            </label>
          </div>
          <div className="shadow-alliance-panel shadow-alliance-roster">
            <div className="shadow-alliance-panel-heading">
              <h2>익명 공작원</h2>
              <strong>{game.players.length}명</strong>
            </div>
            {game.players.length === 0 ? (
              <p className="shadow-alliance-empty">학생 입장을 기다리는 중입니다.</p>
            ) : (
              <ul className="shadow-alliance-player-list">
                {game.players.map((player) => (
                  <li key={player.id}>
                    <TeamBadge team={player.team} />
                    <span>{player.nick}</span>
                    <button
                      type="button"
                      className="shadow-alliance-icon-button"
                      aria-label={`${player.nick} 제외`}
                      onClick={() => onRemovePlayer(player.id)}
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="shadow-alliance-action-row">
              <button type="button" className="shadow-alliance-button secondary" onClick={onAddPlayer}>
                연습 공작원 추가
              </button>
              <button type="button" className="shadow-alliance-button secondary" onClick={onRebalanceTeams}>
                팀 다시 배정
              </button>
            </div>
          </div>
          <button
            type="button"
            className="shadow-alliance-button primary shadow-alliance-start"
            disabled={game.players.length < 2}
            onClick={onStartGame}
          >
            게임 시작
          </button>
        </section>
      )}

      {!lobby && (
        <section className="shadow-alliance-round-layout">
          <div className="shadow-alliance-command-panel">
            <p className="shadow-alliance-eyebrow">ROUND {game.round} / {game.totalRounds}</p>
            <p className="shadow-alliance-command-label">중앙 지령</p>
            <strong>{game.command ?? "-"}</strong>
            <p className="shadow-alliance-timer">{formatTime(game.timeLeft)}</p>
          </div>
          <div className="shadow-alliance-panel shadow-alliance-round-controls">
            <div className="shadow-alliance-panel-heading">
              <h2>응답 현황</h2>
              <strong>{submittedCount}/{game.players.length}</strong>
            </div>
            <ul className="shadow-alliance-player-list compact">
              {game.players.map((player) => (
                <li key={player.id}>
                  <TeamBadge team={player.team} />
                  <span>{player.nick}</span>
                  <b>{player.number ?? "미제출"}</b>
                </li>
              ))}
            </ul>
            {game.phase === "playing" && (
              <div className="shadow-alliance-action-row">
                <button
                  type="button"
                  className="shadow-alliance-button secondary"
                  onClick={() => onSetTimerRunning(!game.timerRunning)}
                >
                  {game.timerRunning ? "타이머 일시정지" : "타이머 재개"}
                </button>
                <button type="button" className="shadow-alliance-button primary" onClick={onRevealRound}>
                  결과 공개
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {result && game.phase !== "playing" && (
        <section className="shadow-alliance-panel shadow-alliance-result-panel">
          <p className="shadow-alliance-eyebrow">라운드 결과</p>
          <h2>
            {result.winner === "tie"
              ? "무승부"
              : result.winner === "black"
                ? "흑색 연합 승리"
                : "백색 연합 승리"}
          </h2>
          <div className="shadow-alliance-result-grid">
            <span>흑색 평균 <b>{result.blackAvg ?? "-"}</b></span>
            <span>백색 평균 <b>{result.whiteAvg ?? "-"}</b></span>
            <span>흑색 차이 <b>{result.blackDiff ?? "-"}</b></span>
            <span>백색 차이 <b>{result.whiteDiff ?? "-"}</b></span>
          </div>
          {game.phase === "revealing" && (
            <button type="button" className="shadow-alliance-button primary" onClick={onShowPostround}>
              순위 확인
            </button>
          )}
          {game.phase === "postround" && (
            <button type="button" className="shadow-alliance-button primary" onClick={onNextRound}>
              {game.round >= game.totalRounds ? "최종 결과" : "다음 라운드"}
            </button>
          )}
        </section>
      )}

      {game.phase === "final" && (
        <section className="shadow-alliance-panel shadow-alliance-ranking-panel">
          <p className="shadow-alliance-eyebrow">최종 순위</p>
          <h2>오늘의 그림자 연합</h2>
          <ol>
            {rankings.map((player, index) => (
              <li key={player.id}>
                <span>{index + 1}</span>
                <TeamBadge team={player.team} />
                <b>{player.nick}</b>
                <strong>{player.power.toLocaleString()} 점</strong>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
