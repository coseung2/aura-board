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
  settingsOnly = false,
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
  settingsOnly?: boolean;
}) {
  const cardClass = compact ? controls.sidebarCard : teacherStyles.setupCard;
  const fieldClass = compact ? controls.field : teacherStyles.selectField;
  const modeClass = compact ? controls.answerMode : teacherStyles.answerMode;
  const createClass = compact ? controls.secondaryButton : teacherStyles.prepareButton;

  return (
    <section className={settingsOnly ? undefined : cardClass} aria-label="게임 설정">
      {!settingsOnly && <h2>게임 설정</h2>}
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
      </fieldset>
      {!settingsOnly && showSave && onSave && (
        <button
          type="button"
          className={controls.primaryButton}
          disabled={busy || saveDisabled}
          onClick={onSave}
        >
          {busy ? "저장 중…" : "라운드 팩 저장"}
        </button>
      )}
      {!settingsOnly && <button
        type="button"
        className={createClass}
        disabled={busy || (!showSave && !setup?.rounds.length)}
        onClick={onCreate}
      >
        {busy ? "처리 중…" : "게임 만들기"}
      </button>}
      {!settingsOnly && setup && (
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
