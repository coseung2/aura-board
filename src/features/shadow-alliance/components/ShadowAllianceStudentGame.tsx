"use client";

import { type ReactNode, useEffect, useState } from "react";
import type {
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

type RevealKey = "nick" | "team" | "power";

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

function teamRevealLabel(team: ShadowAllianceTeam) {
  return team === "black" ? "⚫ 블랙 연합" : "⚪ 화이트 연합";
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
  const [numberDraft, setNumberDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [submittedNumber, setSubmittedNumber] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<RevealKey | null>(null);

  useEffect(() => {
    if (snapshot.phase !== "playing") return;
    setNumberDraft("");
    setEditing(false);
    setSubmittedNumber(null);
  }, [snapshot.phase, snapshot.round]);

  useEffect(() => {
    setRevealed(null);
  }, [player?.id, snapshot.phase]);

  if (!player) {
    return (
      <main className="shadow-alliance-game shadow-alliance-student">
        <div className="shadow-alliance-student-shell shadow-alliance-join-shell">
          <div className="shadow-alliance-join-mark" aria-hidden="true">
            ⟡
          </div>
          <div className="shadow-alliance-join-title">그림자 연합</div>
          <p className="shadow-alliance-student-notice">
            {joinPending
              ? "본부에 익명 공작원 합류 요청을 보내는 중입니다."
              : "본부와 연결이 끊겼습니다. 다시 연결해 주세요."}
          </p>
          {!joinPending ? (
            <button
              type="button"
              className="shadow-alliance-button primary"
              onClick={onRetryJoin}
            >
              ⟡ 다시 연결
            </button>
          ) : null}
          {onContinue ? (
            <button
              type="button"
              className="shadow-alliance-button ghost shadow-alliance-student-exit"
              onClick={onContinue}
            >
              게임 목록
            </button>
          ) : null}
          <p
            className={`shadow-alliance-student-connection-state is-${connection}`}
            aria-live="polite"
          >
            {connectionLabel(connection)}
          </p>
        </div>
      </main>
    );
  }

  const result = snapshot.lastResult;
  const ownGain = result?.gains[player.id] ?? player.lastGain ?? 0;
  const ranks = [...snapshot.players].sort(
    (left, right) =>
      right.power - left.power || left.nick.localeCompare(right.nick, "ko-KR"),
  );
  const ownRank = Math.max(1, ranks.findIndex((entry) => entry.id === player.id) + 1);
  const revealItems: Array<{ key: RevealKey; label: string; value: string }> = [
    { key: "nick", label: "👁 내 닉네임", value: player.nick },
    { key: "team", label: "👁 내 팀", value: teamRevealLabel(player.team) },
    {
      key: "power",
      label: "👁 내 세력",
      value: `${player.power.toLocaleString()} 세력`,
    },
  ];

  const submitNumber = () => {
    const number = Number(numberDraft);
    if (!Number.isInteger(number) || number < 1 || number > 100) return;
    setSubmittedNumber(number);
    setEditing(false);
    onSubmitNumber(number);
  };

  let phaseContent: ReactNode;

  if (snapshot.phase === "lobby") {
    phaseContent = (
      <div className="shadow-alliance-student-command-panel is-lobby">
        <p className="shadow-alliance-eyebrow">대기 중</p>
        <p className="shadow-alliance-student-notice">
          본부의 지령을 기다리는 중입니다.
          <br />곧 첫 라운드가 시작됩니다.
        </p>
      </div>
    );
  } else if (snapshot.phase === "playing") {
    const showSubmitted = player.submitted && !editing;
    phaseContent = (
      <>
        <div className="shadow-alliance-student-command-panel">
          <p className="shadow-alliance-eyebrow">중앙 지령</p>
          <strong className="shadow-alliance-student-command">
            {snapshot.command ?? "-"}
          </strong>
          <p className="shadow-alliance-student-notice shadow-alliance-student-timer">
            남은 협상 시간 · {formatTime(snapshot.timeLeft)}
          </p>
        </div>
        <div className="shadow-alliance-student-input-area">
          {showSubmitted ? (
            <>
              <div className="shadow-alliance-student-submitted-panel">
                <div className="shadow-alliance-student-submitted-big">✓ 제출 완료</div>
                <p className="shadow-alliance-student-notice">
                  내 숫자 ·{" "}
                  <b>{submittedNumber?.toLocaleString() ?? "?"}</b>
                </p>
              </div>
              {snapshot.editable ? (
                <button
                  type="button"
                  className="shadow-alliance-button ghost shadow-alliance-wide-button"
                  onClick={() => {
                    setEditing(true);
                    if (submittedNumber != null) {
                      setNumberDraft(String(submittedNumber));
                    }
                  }}
                >
                  숫자 수정하기
                </button>
              ) : (
                <p className="shadow-alliance-student-notice is-centered">
                  교사 설정: 제출 후 수정 불가
                </p>
              )}
            </>
          ) : (
            <form
              className="shadow-alliance-answer-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitNumber();
              }}
            >
              <label className="shadow-alliance-student-input-label" htmlFor="shadow-number">
                1 ~ 100 사이 숫자를 직접 입력하세요
              </label>
              <input
                id="shadow-number"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={numberDraft}
                placeholder="00"
                autoComplete="off"
                onChange={(event) =>
                  setNumberDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                }
                aria-label="제출 숫자"
              />
              <button
                type="submit"
                className="shadow-alliance-button primary shadow-alliance-wide-button"
                disabled={
                  connection === "offline" ||
                  snapshot.timeLeft <= 0 ||
                  Number(numberDraft) < 1 ||
                  Number(numberDraft) > 100
                }
              >
                ⟡ 제출
              </button>
              <p className="shadow-alliance-student-notice is-centered">
                높을수록 더 많은 세력 — 단, 팀 평균이 무너지면 패배합니다.
              </p>
            </form>
          )}
        </div>
      </>
    );
  } else if (snapshot.phase === "revealing") {
    phaseContent = (
      <div className="shadow-alliance-student-command-panel is-revealing">
        <p className="shadow-alliance-eyebrow">결과 공개 중</p>
        <strong className="shadow-alliance-student-command is-small">
          {snapshot.command ?? result?.command ?? "-"}
        </strong>
        <p className="shadow-alliance-student-notice">교실 화면을 주목하세요…</p>
      </div>
    );
  } else if (snapshot.phase === "postround") {
    phaseContent = (
      <div className="shadow-alliance-student-result-panel">
        <p className="shadow-alliance-eyebrow">이번 라운드 획득</p>
        <div className="shadow-alliance-gain-pop">
          {ownGain > 0 ? `+${ownGain.toLocaleString()}` : "±0"}
        </div>
        <p className="shadow-alliance-student-notice">세력</p>
        <p className="shadow-alliance-student-notice shadow-alliance-student-result-note">
          다음 지령을 기다리세요.
        </p>
      </div>
    );
  } else {
    phaseContent = (
      <div className="shadow-alliance-student-result-panel">
        <p className="shadow-alliance-eyebrow">게임 종료</p>
        <div className="shadow-alliance-gain-pop is-rank">{ownRank}위</div>
        <p className="shadow-alliance-student-notice">전체 {ranks.length}명 중</p>
        <div className="shadow-alliance-student-rule" />
        <p className="shadow-alliance-eyebrow">내 진영</p>
        <div className="shadow-alliance-student-final-team-value">
          {teamRevealLabel(player.team)}
        </div>
      </div>
    );
  }

  return (
    <main className="shadow-alliance-game shadow-alliance-student">
      <div className="shadow-alliance-student-shell">
        <div className="shadow-alliance-student-reveal-row">
          {revealItems.map((item) => {
            const isRevealed = revealed === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`shadow-alliance-student-peek${isRevealed ? " is-on" : ""}`}
                aria-label={`${item.label.replace("👁 ", "")}, 누르고 있는 동안 공개`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setRevealed(item.key);
                }}
                onPointerUp={() => setRevealed(null)}
                onPointerLeave={() => setRevealed(null)}
                onPointerCancel={() => setRevealed(null)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    setRevealed(item.key);
                  }
                }}
                onKeyUp={() => setRevealed(null)}
                onBlur={() => setRevealed(null)}
                onContextMenu={(event) => event.preventDefault()}
              >
                {isRevealed ? item.value : item.label}
              </button>
            );
          })}
        </div>

        <section className="shadow-alliance-student-card">{phaseContent}</section>

        {connection !== "connected" ? (
          <p
            className={`shadow-alliance-student-connection-state is-${connection}`}
            aria-live="polite"
          >
            {connectionLabel(connection)}
          </p>
        ) : null}

        {onContinue ? (
          <button
            type="button"
            className="shadow-alliance-button ghost shadow-alliance-student-exit"
            onClick={onContinue}
          >
            게임 목록
          </button>
        ) : null}
      </div>
    </main>
  );
}
