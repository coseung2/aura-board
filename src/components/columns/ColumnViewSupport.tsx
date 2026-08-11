import type { ColumnAssignmentState } from "./ColumnView";
import type { SortMode } from "./sort";
import type { RosterEntry } from "./useColumnRoster";

export function compareRosterEntries(a: RosterEntry, b: RosterEntry) {
  if (a.number == null && b.number == null) {
    return a.name.localeCompare(b.name, "ko");
  }
  if (a.number == null) return 1;
  if (b.number == null) return -1;
  return a.number - b.number;
}

function formatRosterName(student: RosterEntry) {
  return student.number == null
    ? student.name
    : `${student.number}번 ${student.name}`;
}

export function formatAssignmentBadgeTitle(state?: ColumnAssignmentState) {
  if (!state?.distributed) return "아직 배부되지 않은 과제";
  const distributedAt = formatAssignmentDate(state.distributedAt);
  const reminderSentAt = formatAssignmentDate(state.reminderSentAt);
  if (reminderSentAt) return `과제 배부됨 · 최근 알림 ${reminderSentAt}`;
  if (distributedAt) return `과제 배부됨 · ${distributedAt}`;
  return "과제 배부됨";
}

function formatAssignmentDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionStatusModal({
  sectionTitle,
  submitted,
  missing,
  rosterCount,
  fallbackCount,
  onClose,
}: {
  sectionTitle: string;
  submitted: RosterEntry[];
  missing: RosterEntry[];
  rosterCount: number;
  fallbackCount: number;
  onClose: () => void;
}) {
  const hasRoster = rosterCount > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="column-submission-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${sectionTitle} 제출 현황`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="column-submission-eyebrow">{sectionTitle}</p>
            <h2 className="modal-title">제출 현황</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          />
        </div>
        <div className="column-submission-modal-body">
          <div className="column-submission-summary">
            <span className="column-submission-summary-chip">
              제출 {submitted.length}
            </span>
            {hasRoster ? (
              <>
                <span className="column-submission-summary-chip">
                  미제출 {missing.length}
                </span>
                <span className="column-submission-summary-chip">
                  전체 {rosterCount}
                </span>
              </>
            ) : (
              <span className="column-submission-summary-chip">
                카드 {fallbackCount}
              </span>
            )}
          </div>
          {!hasRoster && (
            <p className="column-submission-note">
              학급이 연결되지 않은 보드예요. 학생별 제출자/미제출자 현황 대신 이
              섹션의 카드 수를 표시합니다.
            </p>
          )}

          <SubmissionList
            title="제출자"
            people={submitted}
            empty="제출자 없음"
          />
          {hasRoster && (
            <SubmissionList
              title="미제출자"
              people={missing}
              empty="미제출자 없음"
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SubmissionList({
  title,
  people,
  empty,
}: {
  title: string;
  people: RosterEntry[];
  empty: string;
}) {
  return (
    <section className="column-submission-group">
      <h3 className="column-submission-group-title">{title}</h3>
      {people.length > 0 ? (
        <div className="column-submission-list">
          {people.map((person) => (
            <div className="column-submission-person" key={person.id}>
              {formatRosterName(person)}
            </div>
          ))}
        </div>
      ) : (
        <p className="column-submission-empty">{empty}</p>
      )}
    </section>
  );
}

export function DropIndicator({ sortMode }: { sortMode: SortMode }) {
  return (
    <div className="column-drop-indicator" aria-hidden="true">
      <span className="column-drop-indicator-line" />
      {sortMode !== "manual" && (
        <span className="column-drop-indicator-label">수동 정렬로 전환</span>
      )}
    </div>
  );
}
