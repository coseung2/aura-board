"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type {
  ShadowAllianceGame,
  ShadowAlliancePlayer,
  ShadowAllianceResult,
  ShadowAllianceTeam,
} from "../types";
import { playShadowAllianceGuideTick } from "../sound";
import { PlayBoardContinueButton } from "@/components/PlayBoardContinueButton";

type GuideBlock =
  | { kind: "paragraph"; content: ReactNode }
  | { kind: "formula"; content: string }
  | { kind: "example"; content: ReactNode[] };

const LOBBY_GUIDES: Array<{ title: string; blocks: GuideBlock[] }> = [
  {
    title: "두 개의 그림자",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
          세상은 두 비밀 조직 <strong className="shadow-alliance-guide-black">⚫ 블랙 연합</strong>과
            <strong className="shadow-alliance-guide-white"> ⚪ 화이트 연합</strong>에 의해 은밀히 움직입니다.
            <br />당신은 그 조직의 <strong>공작원</strong>입니다.
            <br />입장하면 둘 중 한 곳에 자동 배정되며,
            <strong>당신만</strong> 자신의 소속을 알 수 있습니다.
          </>
        ),
      },
    ],
  },
  {
    title: "정체는 비밀이다",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            자기 팀을 밝혀도, 거짓을 말해도 좋습니다.
            <br />“나 블랙이야”라는 말이 진실인지 <strong>확인할 방법은 없습니다.</strong>
            <br />모든 진영은 게임이 끝나는 순간에만 드러납니다.
          </>
        ),
      },
    ],
  },
  {
    title: "매 라운드, 하나의 지령",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            본부는 매 라운드 <strong>30 ~ 70 사이의 비밀 지령(숫자)</strong>을 내립니다.
            <br />협상 시간 동안 교실을 자유롭게 돌아다니며 설득·정보 교환·블러핑·배신, 무엇이든 하세요.
            <br />시간 안에 <strong>1 ~ 100 중 숫자 하나</strong>를 제출합니다.
          </>
        ),
      },
      {
        kind: "paragraph",
        content: (
          <>
            모두가 제출해도 <strong>협상 시간(예: 5분)은 끝까지 흐릅니다.</strong>
            <br />시간이 끝나기 전이라면 제출한 숫자를 <strong>몇 번이든 바꿀 수 있습니다.</strong>
            <br />단, 모든 공작원이 협상을 마쳤다면 프로젝터(교사)가 시간을 <strong className="shadow-alliance-guide-keep">일찍 끝낼 수 있습니다.</strong>
          </>
        ),
      },
    ],
  },
  {
    title: "지령에 가까운 자가 지배한다",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            각 연합의 <strong>제출 숫자 평균</strong>을 냅니다.
            <br />지령에 더 <strong>가까운</strong> 연합이 그 라운드를 지배하고 <strong>10,000 세력</strong>을 차지합니다.
            <br />패배 연합은 0, 동점이면 양측 모두 변동 없습니다.
          </>
        ),
      },
    ],
  },
  {
    title: "욕심 vs 팀",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            승리한 연합은 <strong>10,000 세력</strong>을 받아, <strong>우리 편이 낸 숫자 크기만큼</strong> 나눠 갖습니다.
          </>
        ),
      },
      { kind: "formula", content: "10,000 × ( 내 숫자 ÷ 우리 팀 숫자 총합 )" },
      {
        kind: "example",
        content: [
          <p key="intro"><strong>쉽게 말하면:</strong> 우리 팀 3명이 각각 <strong>20, 30, 50</strong>을 냈다면 합은 <strong>100</strong>. 그러면</p>,
          <p key="scores">· 50 낸 친구 → 절반인 <strong>5,000</strong><br />· 30 낸 친구 → <strong>3,000</strong><br />· 20 낸 친구 → <strong>2,000</strong></p>,
          <p key="warning"><strong>큰 숫자를 낼수록 더 많이</strong> 가져갑니다.<br />하지만 모두가 욕심내 큰 숫자만 내면 팀 평균이 지령에서 멀어져 <strong>아예 져 버립니다!</strong></p>,
        ],
      },
    ],
  },
  {
    title: "최후의 공작원",
    blocks: [
      {
        kind: "paragraph",
        content: (
          <>
            총 5라운드.
            <br />누적 세력이 가장 많은 공작원이 최종 승리합니다.
            <br />게임이 끝나면 모든 이의 진영이 공개됩니다.
            <br />“와, 너 우리 팀이었어?”
          </>
        ),
      },
    ],
  },
] as const;

const REVEAL_STATUS_LINES = [
  "본부, 전 공작원의 보고를 수신하는 중…",
  "암호를 해독하는 중…",
  "⚫ 블랙 연합의 세력을 규합하는 중…",
  "⚪ 화이트 연합의 세력을 규합하는 중…",
  "지령과의 오차를 계산하는 중…",
] as const;

type RevealStage = "idle" | "loading" | "black" | "white" | "winner" | "gain" | "ready";

const REVEAL_STAGE_ORDER: Record<RevealStage, number> = {
  idle: 0,
  loading: 1,
  black: 2,
  white: 3,
  winner: 4,
  gain: 5,
  ready: 6,
};

type Props = {
  game: ShadowAllianceGame;
  connection: string;
  rankings: ShadowAlliancePlayer[];
  onAddPlayer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onRebalanceTeams: () => void;
  onSetSettings: (settings: { editable?: boolean; timerSec?: number }) => void;
  onStartGame: () => void;
  onResetGame: () => void;
  onNextRound: () => void;
  onRevealRound: () => void;
  onShowPostround: () => void;
  onSetTimerRunning: (running: boolean) => void;
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function revealStageReached(current: RevealStage, target: RevealStage) {
  return REVEAL_STAGE_ORDER[current] >= REVEAL_STAGE_ORDER[target];
}

function TeamBadge({ team }: { team: "black" | "white" }) {
  return <span className={`shadow-alliance-team shadow-alliance-team-${team}`} />;
}

function RevealTeamPanel({
  team,
  visible,
  winner,
  loser,
  average,
  difference,
}: {
  team: "black" | "white";
  visible: boolean;
  winner: boolean;
  loser: boolean;
  average: number | null;
  difference: number | null;
}) {
  const teamLabel = team === "black" ? "블랙 연합" : "화이트 연합";

  return (
    <article
      className={[
        "shadow-alliance-reveal-team",
        `shadow-alliance-reveal-team-${team}`,
        visible ? "is-visible" : "",
        winner ? "is-winner" : "",
        loser ? "is-loser" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <TeamBadge team={team} />
      <h3>{teamLabel}</h3>
      <strong>{visible ? average ?? "없음" : "···"}</strong>
      <p>
        {visible ? (
          <>
            지령과의 차이 <b>{difference ?? "없음"}</b>
          </>
        ) : (
          "평균을 공개하는 중…"
        )}
      </p>
    </article>
  );
}

function ShadowAllianceRevealPage({
  result,
  round,
  onContinue,
}: {
  result: ShadowAllianceResult;
  round: number;
  onContinue: () => void;
}) {
  const [revealStage, setRevealStage] = useState<RevealStage>("idle");
  const [revealStatusIndex, setRevealStatusIndex] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const schedule = (delay: number, callback: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) callback();
        }, delay),
      );
    };

    setRevealStage("loading");
    setRevealStatusIndex(0);

    REVEAL_STATUS_LINES.forEach((_, index) => {
      if (index === 0) return;
      schedule(index * 850, () => setRevealStatusIndex(index));
    });

    const messageSequenceEnd = REVEAL_STATUS_LINES.length * 850 + 800;
    schedule(messageSequenceEnd, () => setRevealStage("black"));
    schedule(messageSequenceEnd + 3000, () => setRevealStage("white"));
    schedule(messageSequenceEnd + 6200, () => setRevealStage("winner"));
    schedule(messageSequenceEnd + 7200, () => setRevealStage("gain"));
    schedule(messageSequenceEnd + 8200, () => setRevealStage("ready"));

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [result, round]);

  return (
    <section className="shadow-alliance-reveal-page" aria-labelledby="shadow-alliance-reveal-title">
      <div className="shadow-alliance-reveal-heading">
        <div>
          <p className="shadow-alliance-eyebrow">ROUND {round} · 결과 공개</p>
          <h2 id="shadow-alliance-reveal-title">중앙 지령 {result.command}</h2>
        </div>
        <span className="shadow-alliance-reveal-round-mark">기밀 해제 중</span>
      </div>

      <div className={`shadow-alliance-reveal-status is-${revealStage}`} aria-live="polite">
        {revealStage === "loading" ? (
          <div className="shadow-alliance-reveal-log">
            {REVEAL_STATUS_LINES.slice(0, revealStatusIndex + 1).map((line, index) => (
              <p key={line} className={index === revealStatusIndex ? "is-current" : ""}>
                <span>⟡</span>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="shadow-alliance-reveal-current">
            <span>⟡</span>
            {revealStage === "black"
              ? "블랙 연합의 평균을 공개하는 중…"
              : revealStage === "white"
                ? "화이트 연합의 평균을 공개하는 중…"
                : revealStage === "winner"
                  ? "지령과의 오차를 비교하는 중…"
                  : revealStage === "gain"
                    ? "개인 세력을 배분하는 중…"
                    : "계산 완료. 개인 세력이 공개되었습니다."}
          </p>
        )}
      </div>

      <div className="shadow-alliance-reveal-team-grid">
        <RevealTeamPanel
          team="black"
          visible={revealStageReached(revealStage, "black")}
          winner={revealStageReached(revealStage, "winner") && result.winner === "black"}
          loser={revealStageReached(revealStage, "winner") && result.winner === "white"}
          average={result.blackAvg}
          difference={result.blackDiff}
        />
        <RevealTeamPanel
          team="white"
          visible={revealStageReached(revealStage, "white")}
          winner={revealStageReached(revealStage, "winner") && result.winner === "white"}
          loser={revealStageReached(revealStage, "winner") && result.winner === "black"}
          average={result.whiteAvg}
          difference={result.whiteDiff}
        />
      </div>

      {revealStageReached(revealStage, "winner") && (
        <div className={`shadow-alliance-reveal-winner ${result.winner === "tie" ? "is-tie" : ""}`}>
          {result.winner === "tie"
            ? "⟡ 무 승 부 ⟡"
            : result.winner === "black"
              ? "⚫ 블랙 연합 승리"
              : "⚪ 화이트 연합 승리"}
          {result.winner === "tie" && <small>세력 변동 없음</small>}
        </div>
      )}

      {revealStageReached(revealStage, "gain") && (
        <p className="shadow-alliance-reveal-note">
          개인 세력이 각 공작원 화면에 공개되었습니다. 제출 숫자가 높을수록 더 많이 획득합니다.
        </p>
      )}

      {revealStage === "ready" && (
        <button type="button" className="shadow-alliance-button primary" onClick={onContinue}>
          순위 확인
        </button>
      )}
    </section>
  );
}

function ShadowAlliancePostroundPage({
  round,
  totalRounds,
  result,
  rankings,
  onNextRound,
}: {
  round: number;
  totalRounds: number;
  result: ShadowAllianceResult;
  rankings: ShadowAlliancePlayer[];
  onNextRound: () => void;
}) {
  const winningPlayers = result.winner === "black" ? result.black : result.white;
  const lastRound = round >= totalRounds;

  return (
    <section className="shadow-alliance-postround-page" aria-labelledby="shadow-alliance-postround-title">
      <div className="shadow-alliance-postround-summary">
        <p className="shadow-alliance-eyebrow">ROUND {round} 종료</p>
        <h2 id="shadow-alliance-postround-title">
          {result.winner === "tie"
            ? "무승부"
            : result.winner === "black"
              ? "⚫ 블랙 연합 지배"
              : "⚪ 화이트 연합 지배"}
        </h2>
      </div>

      {result.winner !== "tie" && (
        <section className="shadow-alliance-postround-card">
          <p className="shadow-alliance-eyebrow">승리 연합의 제출 숫자 · 익명 공개</p>
          <div className="shadow-alliance-numbers-strip">
            {winningPlayers.map((player) => (
              <span key={player.id}>{player.number ?? "미제출"}</span>
            ))}
          </div>
          <p className="shadow-alliance-postround-note">패배 연합의 숫자는 공개되지 않습니다.</p>
        </section>
      )}

      <section className="shadow-alliance-postround-card">
        <p className="shadow-alliance-eyebrow">현재 세력 순위 · TOP 5</p>
        <ol className="shadow-alliance-postround-ranking">
          {rankings.slice(0, 5).map((player, index) => {
            const rank = index + 1;
            const secret = rank === 1;

            return (
              <li key={player.id} className={secret ? "is-secret" : ""}>
                <span className="shadow-alliance-postround-rank">{rank}</span>
                <span className="shadow-alliance-postround-name">
                  {secret ? "???" : player.nick}
                  {secret && <small>선두는 비밀에 부쳐집니다</small>}
                </span>
                <strong>{player.power.toLocaleString()}</strong>
              </li>
            );
          })}
        </ol>
      </section>

      <button type="button" className="shadow-alliance-button primary" onClick={onNextRound}>
        {lastRound ? "최종 결과 보기" : `다음 라운드 (${round + 1}/${totalRounds})`}
      </button>
    </section>
  );
}

function TeamRoster({
  team,
  players,
  onRemovePlayer,
}: {
  team: ShadowAllianceTeam;
  players: ShadowAlliancePlayer[];
  onRemovePlayer: (playerId: string) => void;
}) {
  const teamLabel = team === "black" ? "블랙 연합" : "화이트 연합";

  return (
    <section
      className={`shadow-alliance-team-roster shadow-alliance-team-roster-${team}`}
      aria-labelledby={`shadow-alliance-${team}-roster-title`}
    >
      <div className="shadow-alliance-team-roster-heading">
        <div className="shadow-alliance-team-roster-label">
          <TeamBadge team={team} />
          <h3 id={`shadow-alliance-${team}-roster-title`}>{teamLabel}</h3>
        </div>
        <strong>{players.length}명</strong>
      </div>
      {players.length === 0 ? (
        <p className="shadow-alliance-team-empty">아직 배정된 공작원이 없습니다.</p>
      ) : (
        <ul className="shadow-alliance-team-player-list">
          {players.map((player) => (
            <li key={player.id}>
              <span>{player.nick}</span>
              <button
                type="button"
                className="shadow-alliance-icon-button"
                aria-label={`${player.nick} ${teamLabel}에서 제외`}
                onClick={() => onRemovePlayer(player.id)}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
  onResetGame,
  onNextRound,
  onRevealRound,
  onShowPostround,
  onSetTimerRunning,
}: Props) {
  const router = useRouter();
  const [guideIndex, setGuideIndex] = useState(0);
  const submittedCount = game.players.filter((player) => player.number !== null).length;

  const lobby = game.phase === "lobby";
  const result = game.lastResult;
  const guide = LOBBY_GUIDES[guideIndex];
  const playersByTeam = {
    black: game.players.filter((player) => player.team === "black"),
    white: game.players.filter((player) => player.team === "white"),
  };
  const changeGuide = (nextIndex: number) => {
    if (nextIndex === guideIndex) return;
    playShadowAllianceGuideTick();
    setGuideIndex(nextIndex);
  };

  if (game.phase === "postround" && result) {
    return (
      <main className="shadow-alliance-game shadow-alliance-teacher shadow-alliance-postround-shell">
        <header className="shadow-alliance-topbar shadow-alliance-postround-topbar">
          <div className="shadow-alliance-topbar-status">
            <span className={`shadow-alliance-connection is-${connection}`}>
              {connection === "connected" ? "실시간 연결" : "연결 복구 중"}
            </span>
            <PlayBoardContinueButton href="/dashboard" />
            <button
              type="button"
              className="shadow-alliance-button shadow-alliance-connection shadow-alliance-end-game-button"
              onClick={() => {
                if (window.confirm("게임을 종료하고 보드 대시보드로 이동할까요?")) {
                  onResetGame();
                  window.setTimeout(() => router.push("/dashboard"), 0);
                }
              }}
            >
              게임 종료
            </button>
          </div>
        </header>
        <ShadowAlliancePostroundPage
          round={game.round}
          totalRounds={game.totalRounds}
          result={result}
          rankings={rankings}
          onNextRound={onNextRound}
        />
      </main>
    );
  }

  return (
    <main className="shadow-alliance-game shadow-alliance-teacher">
      <header className="shadow-alliance-topbar">
        <div>
          <p className="shadow-alliance-eyebrow">교사 본부</p>
          <h1>그림자연합</h1>
        </div>
        <div className="shadow-alliance-topbar-status">
          <span className={`shadow-alliance-connection is-${connection}`}>
            {connection === "connected" ? "실시간 연결" : "연결 복구 중"}
          </span>
          <PlayBoardContinueButton href="/dashboard" />
          {(
            <button
              type="button"
              className="shadow-alliance-button shadow-alliance-connection shadow-alliance-end-game-button"
              onClick={() => {
                if (window.confirm("게임을 종료하고 보드 대시보드로 이동할까요?")) {
                  onResetGame();
                  window.setTimeout(() => router.push("/dashboard"), 0);
                }
              }}
            >
              게임 종료
            </button>
          )}
        </div>
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
                    onClick={() => changeGuide(index)}
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
                <div className="shadow-alliance-guide-body">
                  {guide.blocks.map((block, index) => {
                    if (block.kind === "paragraph") {
                      return <p key={`${guide.title}-paragraph-${index}`}>{block.content}</p>;
                    }
                    if (block.kind === "formula") {
                      return (
                        <div className="shadow-alliance-guide-formula" key={`${guide.title}-formula-${index}`}>
                          {block.content}
                        </div>
                      );
                    }
                    return (
                      <div className="shadow-alliance-guide-example" key={`${guide.title}-example-${index}`}>
                        {block.content}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <nav className="shadow-alliance-guide-nav" aria-label="게임 설명 이동">
              <button
                type="button"
                className="shadow-alliance-button secondary"
                disabled={guideIndex === 0}
                onClick={() => changeGuide(Math.max(guideIndex - 1, 0))}
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
                onClick={() => changeGuide(Math.min(guideIndex + 1, LOBBY_GUIDES.length - 1))}
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
            <div className="shadow-alliance-team-roster-grid">
              <TeamRoster
                team="black"
                players={playersByTeam.black}
                onRemovePlayer={onRemovePlayer}
              />
              <TeamRoster
                team="white"
                players={playersByTeam.white}
                onRemovePlayer={onRemovePlayer}
              />
            </div>
            <div className="shadow-alliance-action-row">
              <button type="button" className="shadow-alliance-button secondary" onClick={onAddPlayer}>
                연습 공작원 추가
              </button>
              <button type="button" className="shadow-alliance-button secondary" onClick={onRebalanceTeams}>
                블랙·화이트 다시 배정
              </button>
            </div>
          </div>
          <div className="shadow-alliance-panel shadow-alliance-settings">
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

      {!lobby && game.phase !== "revealing" && (
        <section className="shadow-alliance-round-layout">
          <div className="shadow-alliance-round-focus">
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

      {game.phase === "revealing" && result && (
        <ShadowAllianceRevealPage
          result={result}
          round={game.round}
          onContinue={onShowPostround}
        />
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
          <button
            type="button"
            className="shadow-alliance-button secondary shadow-alliance-new-game"
            onClick={() => {
              if (window.confirm("현재 결과를 닫고 새 게임을 준비할까요?")) onResetGame();
            }}
          >
            새 게임 준비
          </button>
        </section>
      )}
    </main>
  );
}
