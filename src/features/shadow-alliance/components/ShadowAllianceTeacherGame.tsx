"use client";

import { useState } from "react";
import type { ShadowAllianceGame, ShadowAlliancePlayer } from "../types";

const LOBBY_GUIDES = [
  {
    title: "두 개의 그림자",
    body: "입장하면 블랙 연합 또는 화이트 연합에 자동 배정됩니다. 자신의 소속만 알고, 다른 사람의 진영은 알 수 없습니다.",
  },
  {
    title: "정체는 비밀이다",
    body: "자기 팀을 밝혀도, 거짓을 말해도 좋습니다. 모든 진영은 게임이 끝나는 순간까지 공개되지 않습니다.",
  },
  {
    title: "매 라운드, 하나의 지령",
    body: "매 라운드 30~70 사이의 비밀 지령이 내려옵니다. 협상하며 1~100 중 숫자 하나를 제출하고, 시간 안에는 다시 바꿀 수 있습니다.",
  },
  {
    title: "지령에 가까운 자가 지배한다",
    body: "각 연합의 제출 숫자 평균을 지령과 비교합니다. 지령에 더 가까운 연합이 그 라운드를 지배합니다.",
  },
  {
    title: "욕심과 팀, 그리고 최후의 승리",
    body: "승리한 연합은 10,000 세력을 팀 숫자 비율로 나눠 갖습니다. 총 5라운드 후 누적 세력이 가장 많은 공작원이 최종 승리합니다.",
  },
] as const;

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
  const [guideIndex, setGuideIndex] = useState(0);
  const submittedCount = game.players.filter((player) => player.number !== null).length;

  const lobby = game.phase === "lobby";
  const result = game.lastResult;
  const guide = LOBBY_GUIDES[guideIndex];

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
          <section
            className="shadow-alliance-panel shadow-alliance-lobby-guide"
            aria-labelledby="shadow-alliance-guide-title"
          >
            <header className="shadow-alliance-guide-header">
              <div>
                <p className="shadow-alliance-eyebrow">게임 설명</p>
                <p className="shadow-alliance-guide-count">
                  설명 {guideIndex + 1} / {LOBBY_GUIDES.length}
                </p>
              </div>
              <div className="shadow-alliance-guide-pagination" aria-label="게임 설명 선택">
                {LOBBY_GUIDES.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    className={guideIndex === index ? "is-active" : ""}
                    aria-label={`설명 ${index + 1} 보기`}
                    aria-current={guideIndex === index ? "step" : undefined}
                    onClick={() => setGuideIndex(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </header>

            <div className="shadow-alliance-guide-content" aria-live="polite">
              <span className="shadow-alliance-guide-number" aria-hidden="true">
                {String(guideIndex + 1).padStart(2, "0")}
              </span>
              <div className="shadow-alliance-guide-copy">
                <h2 id="shadow-alliance-guide-title">{guide.title}</h2>
                <p>{guide.body}</p>
              </div>
            </div>

            <nav className="shadow-alliance-guide-nav" aria-label="게임 설명 이동">
              <button
                type="button"
                className="shadow-alliance-button secondary"
                disabled={guideIndex === 0}
                onClick={() => setGuideIndex((index) => Math.max(index - 1, 0))}
              >
                ← 이전 설명
              </button>
              <span>
                {guideIndex + 1} / {LOBBY_GUIDES.length}
              </span>
              <button
                type="button"
                className="shadow-alliance-button secondary"
                disabled={guideIndex === LOBBY_GUIDES.length - 1}
                onClick={() => setGuideIndex((index) => Math.min(index + 1, LOBBY_GUIDES.length - 1))}
              >
                다음 설명 →
              </button>
            </nav>
          </section>

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
