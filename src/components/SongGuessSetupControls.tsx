"use client";

import {
  SONG_GUESS_ANSWER_TARGET_LABELS,
  type SongGuessAnswerTarget,
  type SongGuessTeacherSetup,
} from "@/lib/song-guess/contracts";
import controls from "./SongGuessBoard.module.css";
import teacherStyles from "./SongGuessTeacher.module.css";

type AnswerMode = "text" | "multiple-choice";

export function SongGuessSetupControls({
  boardId,
  setup,
  busy,
  answerMode,
  answerTarget,
  compact = false,
  showSave = false,
  saveDisabled = false,
  onAnswerModeChange,
  onAnswerTargetChange,
  onSave,
  onCreate,
  onRemove,
}: {
  boardId: string;
  setup: SongGuessTeacherSetup | null;
  busy: boolean;
  answerMode: AnswerMode;
  answerTarget: SongGuessAnswerTarget;
  compact?: boolean;
  showSave?: boolean;
  saveDisabled?: boolean;
  onAnswerModeChange: (mode: AnswerMode) => void;
  onAnswerTargetChange: (target: SongGuessAnswerTarget) => void;
  onSave?: () => void;
  onCreate: () => void;
  onRemove: () => void;
}) {
  const cardClass = compact ? controls.sidebarCard : teacherStyles.setupCard;
  const fieldClass = compact ? controls.field : teacherStyles.selectField;
  const modeClass = compact ? controls.answerMode : teacherStyles.answerMode;
  const createClass = compact ? controls.secondaryButton : teacherStyles.prepareButton;

  return (
    <section className={cardClass} aria-label="게임 설정">
      <h2>저장 및 시작</h2>
      {setup && <p>{setup.rounds.length}문제 준비됨</p>}
      <label className={fieldClass}>
        <span>출제 모드</span>
        <select
          value={answerTarget}
          disabled={busy}
          onChange={(event) =>
            onAnswerTargetChange(event.target.value as SongGuessAnswerTarget)
          }
        >
          {Object.entries(SONG_GUESS_ANSWER_TARGET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={busy} className={modeClass}>
        <legend>답변 방식</legend>
        <label>
          <input
            type="radio"
            name={`answer-mode-${boardId}`}
            value="text"
            checked={answerMode === "text"}
            onChange={() => onAnswerModeChange("text")}
          />
          서술형
        </label>
        <label>
          <input
            type="radio"
            name={`answer-mode-${boardId}`}
            value="multiple-choice"
            checked={answerMode === "multiple-choice"}
            onChange={() => onAnswerModeChange("multiple-choice")}
          />
          객관식 (4지선다)
        </label>
        <p>
          {answerMode === "text"
            ? "선택한 정답 대상을 직접 입력해요. 등록된 별칭도 정답으로 인정돼요."
            : "선택한 정답 대상과 오답 보기 3개를 자동으로 채워요. 문제마다 한 번만 제출할 수 있어요."}
        </p>
      </fieldset>
      {showSave && onSave && (
        <button
          type="button"
          className={controls.primaryButton}
          disabled={busy || saveDisabled}
          onClick={onSave}
        >
          {busy ? "저장 중…" : "라운드 팩 저장"}
        </button>
      )}
      <button
        type="button"
        className={createClass}
        disabled={busy || !setup?.rounds.length}
        onClick={onCreate}
      >
        {busy ? "처리 중…" : "게임 만들기"}
      </button>
      {setup && (
        <button
          type="button"
          className={compact ? controls.dangerButton : teacherStyles.removeButton}
          disabled={busy}
          onClick={onRemove}
        >
          저장 구성 삭제
        </button>
      )}
    </section>
  );
}
