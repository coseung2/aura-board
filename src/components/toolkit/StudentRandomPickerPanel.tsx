import { CloseIcon } from "../icons/UiIcons";
import { useToolkitMovement } from "./useToolkitMovement";

export type ToolkitStudent = {
  id: string;
  name: string;
  number: number | null;
  gender?: "male" | "female" | null;
};

export type ToolkitClassroom = {
  id: string;
  name: string;
  studentCount: number | null;
};

export type PickerGenderFilter = "all" | "male" | "female";

export type StudentRandomPickerPanelProps = {
  classrooms: ToolkitClassroom[];
  classroomsLoaded: boolean;
  classroomsError: string;
  activeClassroomId: string | null;
  students: ToolkitStudent[];
  studentsLoaded: boolean;
  studentsError: string;
  eligibleStudents: ToolkitStudent[];
  pickerFilter: PickerGenderFilter;
  pickerCount: number;
  pickedStudents: ToolkitStudent[];
  highlightedStudentId: string | null;
  drawingStudents: boolean;
  onClose: () => void;
  onChooseClassroom: (classroomId: string) => void;
  onChooseFilter: (filter: PickerGenderFilter) => void;
  onChangePickerCount: (count: number) => void;
  onDraw: () => void;
};

export function StudentRandomPickerPanel({
  classrooms,
  classroomsLoaded,
  classroomsError,
  activeClassroomId,
  students,
  studentsLoaded,
  studentsError,
  eligibleStudents,
  pickerFilter,
  pickerCount,
  pickedStudents,
  highlightedStudentId,
  drawingStudents,
  onClose,
  onChooseClassroom,
  onChooseFilter,
  onChangePickerCount,
  onDraw,
}: StudentRandomPickerPanelProps) {
  const movement = useToolkitMovement();
  const pickedStudentIds = new Set(pickedStudents.map((student) => student.id));
  const highlightedStudent = highlightedStudentId
    ? eligibleStudents.find((student) => student.id === highlightedStudentId) ?? null
    : null;
  const pickerStage = !activeClassroomId
    ? 1
    : drawingStudents || pickedStudents.length > 0
      ? 3
      : 2;
  // The spotlight name changes every 95ms while drawing, so it must not sit in
  // a live region. Announce stable stage text instead.
  const drawAnnouncement = drawingStudents
    ? "학생을 뽑고 있어요."
    : pickedStudents.length > 0
      ? `${pickedStudents
          .map((student) =>
            student.number ? `${student.number}번 ${student.name}` : student.name,
          )
          .join(", ")} 뽑혔어요.`
      : "";

  return (
    <section
      ref={movement.ref}
      style={movement.style}
      className={[
        "board-toolkit-panel",
        "board-student-picker-panel",
        drawingStudents ? "is-drawing" : "",
        pickedStudents.length > 0 ? "has-result" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label="학생 랜덤뽑기"
    >
      <button type="button" className="board-toolkit-move-handle" aria-label="학생 랜덤뽑기 이동" title="드래그 또는 방향키로 이동" {...movement.handleProps}>
        <span aria-hidden="true">⠿</span> 학생 랜덤뽑기
      </button>
      <div className="board-picker-hero">
        <div className="board-picker-hero-copy">
          <span className="board-picker-eyebrow">
            <span aria-hidden="true">✦</span>
            RANDOM PICK
          </span>
          <h2>오늘의 주인공은?</h2>
          <p>학급과 조건을 정한 뒤, 버튼 한 번으로 랜덤하게 뽑아보세요.</p>
        </div>
        <button
          type="button"
          className="board-timer-close board-picker-close"
          onClick={onClose}
          aria-label="학생 랜덤뽑기 닫기"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="board-picker-progress" aria-label={`현재 ${pickerStage}단계`}>
        {[
          { step: 1, label: "학급 선택" },
          { step: 2, label: "조건 설정" },
          { step: 3, label: "랜덤 뽑기" },
        ].map(({ step, label }) => (
          <div
            key={step}
            className={[
              "board-picker-progress-item",
              pickerStage === step ? "is-active" : "",
              pickerStage > step ? "is-complete" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span>{pickerStage > step ? "✓" : step}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>

      <div className="board-picker-content">
        {classroomsError ? (
          <div className="board-picker-message is-error">
            <strong>학급을 불러오지 못했어요.</strong>
            <p>{classroomsError}</p>
          </div>
        ) : !classroomsLoaded ? (
          <div className="board-picker-message">
            <span className="board-picker-loading-dot" aria-hidden="true" />
            <strong>학급 목록을 불러오는 중...</strong>
          </div>
        ) : classrooms.length === 0 ? (
          <div className="board-picker-message">
            <strong>선택할 수 있는 학급이 없어요.</strong>
          </div>
        ) : (
          <label className="board-classroom-picker board-picker-control-card board-picker-classroom-card">
            <span className="board-picker-control-heading">
              <span className="board-picker-control-icon" aria-hidden="true">
                01
              </span>
              <span>
                <strong>학급 선택</strong>
                <small>학생 명단을 가져올 학급을 골라주세요.</small>
              </span>
            </span>
            <select
              value={activeClassroomId ?? ""}
              onChange={(event) => onChooseClassroom(event.target.value)}
            >
              <option value="" disabled>
                학급 선택
              </option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                  {typeof classroom.studentCount === "number"
                    ? ` · ${classroom.studentCount}명`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {!activeClassroomId ? (
          classroomsLoaded && classrooms.length > 0 ? (
            <div className="board-picker-ready-card">
              <div className="board-picker-ready-orbit" aria-hidden="true">
                <span>?</span>
              </div>
              <strong>누가 뽑힐까요?</strong>
              <p>먼저 위에서 학급을 선택하면 게임판이 열립니다.</p>
            </div>
          ) : null
        ) : studentsError ? (
          <div className="board-picker-message is-error">
            <strong>학생 명단을 불러오지 못했어요.</strong>
            <p>{studentsError}</p>
          </div>
        ) : !studentsLoaded ? (
          <div className="board-picker-message">
            <span className="board-picker-loading-dot" aria-hidden="true" />
            <strong>학생 명단을 불러오는 중...</strong>
          </div>
        ) : students.length === 0 ? (
          <div className="board-picker-message">
            <strong>뽑을 학생이 없어요.</strong>
          </div>
        ) : (
          <>
            <div className="board-picker-controls">
              <div className="board-picker-control-card">
                <span className="board-picker-control-heading">
                  <span className="board-picker-control-icon" aria-hidden="true">
                    02
                  </span>
                  <span>
                    <strong>뽑을 인원</strong>
                    <small>{eligibleStudents.length}명 중 선택</small>
                  </span>
                </span>
                <div className="board-picker-stepper">
                  <button
                    type="button"
                    onClick={() => onChangePickerCount(Math.max(1, pickerCount - 1))}
                    disabled={pickerCount <= 1}
                    aria-label="뽑을 인원 줄이기"
                  >
                    −
                  </button>
                  <output aria-live="polite">
                    <strong>{pickerCount}</strong>
                    <span>명</span>
                  </output>
                  <button
                    type="button"
                    onClick={() =>
                      onChangePickerCount(
                        Math.min(eligibleStudents.length, pickerCount + 1),
                      )
                    }
                    disabled={pickerCount >= eligibleStudents.length}
                    aria-label="뽑을 인원 늘리기"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="board-picker-control-card">
                <span className="board-picker-control-heading">
                  <span
                    className="board-picker-control-icon is-alt"
                    aria-hidden="true"
                  >
                    03
                  </span>
                  <span>
                    <strong>뽑기 대상</strong>
                    <small>필요한 그룹만 골라요.</small>
                  </span>
                </span>
                <div
                  className="board-picker-segments"
                  role="group"
                  aria-label="뽑기 대상"
                >
                  {(
                    [
                      ["all", "전체"],
                      ["female", "여학생"],
                      ["male", "남학생"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={pickerFilter === value ? "is-selected" : ""}
                      onClick={() => onChooseFilter(value)}
                      aria-pressed={pickerFilter === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {eligibleStudents.length === 0 ? (
              <div className="board-picker-message">
                <strong>조건에 맞는 학생이 없어요.</strong>
                <p>다른 대상을 선택해 주세요.</p>
              </div>
            ) : (
              <>
                <div className="board-picker-arena">
                  <div className="board-picker-spotlight">
                    <span
                      className="board-picker-spark board-picker-spark-one"
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                    <span
                      className="board-picker-spark board-picker-spark-two"
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                    <span
                      className="board-picker-spark board-picker-spark-three"
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                    {drawingStudents && highlightedStudent ? (
                      <>
                        <span className="board-picker-spotlight-label">
                          두구두구...
                        </span>
                        <strong>{highlightedStudent.name}</strong>
                        <small>
                          {highlightedStudent.number
                            ? `${highlightedStudent.number}번`
                            : "번호 없음"}
                        </small>
                      </>
                    ) : pickedStudents.length > 0 ? (
                      <>
                        <span className="board-picker-spotlight-label is-result">
                          PICKED!
                        </span>
                        <strong>
                          {pickedStudents.length === 1
                            ? pickedStudents[0].name
                            : `${pickedStudents.length}명 선택 완료`}
                        </strong>
                        <small>결과가 확정됐어요.</small>
                      </>
                    ) : (
                      <>
                        <span className="board-picker-spotlight-label">READY</span>
                        <strong>준비 완료!</strong>
                        <small>아래 버튼을 눌러 시작하세요.</small>
                      </>
                    )}
                  </div>

                  <div
                    className="board-picker-roster"
                    aria-label="추첨 대상 학생"
                  >
                    {eligibleStudents.map((student) => {
                      const isPicked = pickedStudentIds.has(student.id);
                      const isHighlighted = highlightedStudentId === student.id;
                      return (
                        <div
                          key={student.id}
                          className={[
                            "board-picker-student-card",
                            isPicked ? "is-picked" : "",
                            isHighlighted ? "is-highlighted" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span>{student.number ?? "-"}</span>
                          <strong>{student.name}</strong>
                          {isPicked ? <em aria-label="선택됨">✓</em> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  className="board-picker-draw"
                  onClick={onDraw}
                  disabled={drawingStudents}
                >
                  <span aria-hidden="true">✦</span>
                  {drawingStudents
                    ? "두구두구... 뽑는 중"
                    : pickedStudents.length > 0
                      ? "한 번 더 뽑기"
                      : `${pickerCount}명 랜덤 뽑기`}
                  <span aria-hidden="true">✦</span>
                </button>

                <p className="sr-only" role="status" aria-live="polite">
                  {drawAnnouncement}
                </p>

                {pickedStudents.length > 0 ? (
                  <div className="board-picker-summary">
                    <span>선택 결과</span>
                    <div>
                      {pickedStudents.map((student) => (
                        <strong key={student.id}>
                          {student.number ? `${student.number}번 ` : ""}
                          {student.name}
                        </strong>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="board-picker-hint">
                    모든 학생에게 같은 확률이 적용됩니다.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
