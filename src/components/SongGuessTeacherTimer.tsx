import teacherStyles from "./SongGuessTeacher.module.css";

export function SongGuessTeacherTimer({
  remainingSeconds,
  roundDurationSeconds,
}: {
  remainingSeconds: number | null;
  roundDurationSeconds: number;
}) {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (remainingSeconds ?? 0) / Math.max(1, roundDurationSeconds),
    ),
  );

  return (
    <div className={teacherStyles.timerBox} role="timer" aria-label="남은 응답 시간">
      <span>남은 시간</span>
      <strong className={teacherStyles.timerNumber}>
        {remainingSeconds === null ? "—" : Math.max(0, remainingSeconds)}
      </strong>
      <span className={teacherStyles.timerUnit}>초</span>
      <div className={teacherStyles.timerTrack} aria-hidden="true">
        <div
          className={teacherStyles.timerFill}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
