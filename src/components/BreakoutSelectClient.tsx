"use client";

/**
 * BreakoutSelectClient — student group chooser (BR-5 self-select).
 * Picks the group's entry section, POSTs to membership API, then navigates.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Group = {
  groupIndex: number;
  entrySectionId: string;
  totalCount: number;
  sections: Array<{ id: string; title: string; count: number }>;
};

type Props = {
  assignmentId: string;
  boardSlug: string;
  groups: Group[];
  groupCapacity: number;
  studentName: string;
};

export function BreakoutSelectClient({
  assignmentId,
  boardSlug,
  groups,
  groupCapacity,
  studentName,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(group: Group) {
    if (pending !== null) return;
    setPending(group.groupIndex);
    setError(null);
    try {
      const res = await fetch(
        `/api/breakout/assignments/${assignmentId}/membership`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sectionId: group.entrySectionId }),
        }
      );
      if (res.ok) {
        router.push(`/board/${boardSlug}/s/${group.entrySectionId}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError("이미 모둠을 선택했어요. 변경은 교사 승인이 필요해요.");
      } else if (data.error === "capacity_reached") {
        setError(`모둠 ${group.groupIndex}은 이미 정원이 찼어요. 다른 모둠을 골라주세요.`);
      } else {
        setError(`선택 실패: ${data.error ?? res.statusText}`);
      }
    } catch (e) {
      console.error(e);
      setError("네트워크 오류로 선택하지 못했어요.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="student-breakout-backdrop" aria-hidden="true" />
      <section
        className="student-breakout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-breakout-title"
      >
        <div className="student-breakout-modal-header">
          <div>
            <p className="student-breakout-kicker">{studentName}</p>
            <h2 id="student-breakout-title">모둠 선택</h2>
          </div>
          <span className="student-breakout-capacity">정원 {groupCapacity}명</span>
        </div>
        {error && (
          <div role="alert" className="student-breakout-error">
            {error}
          </div>
        )}
        <div className="student-breakout-grid">
          {groups.map((g) => {
            const isFull = g.totalCount >= groupCapacity * g.sections.length;
            return (
              <button
                key={g.groupIndex}
                type="button"
                disabled={isFull || pending !== null}
                onClick={() => pick(g)}
                className="student-breakout-group"
                aria-label={`모둠 ${g.groupIndex} 선택`}
              >
                <strong>모둠 {g.groupIndex}</strong>
                <span>
                  현재 {g.totalCount} / {groupCapacity * g.sections.length}명
                </span>
                {isFull && <small>정원 초과</small>}
                {pending === g.groupIndex && <small>선택 중…</small>}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
