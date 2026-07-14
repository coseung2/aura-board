"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReadingLogDeleteButton({
  classroomId,
  readingLogId,
  studentLabel,
  title,
}: {
  classroomId: string;
  readingLogId: string;
  studentLabel: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    if (
      !window.confirm(
        `${studentLabel} 학생의 “${title}” 독서 기록을 삭제할까요? 지급된 독서 보상은 함께 환수됩니다.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/reading/${encodeURIComponent(readingLogId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        if (response.status === 409 && body?.error === "insufficient_balance") {
          throw new Error("학생 잔액이 부족해 보상을 환수할 수 없습니다. 기록은 삭제되지 않았습니다.");
        }
        throw new Error("독서 기록을 삭제하지 못했습니다.");
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "독서 기록을 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="classroom-reading-actions" data-label="관리" role="cell">
      <button
        type="button"
        className="classroom-reading-delete"
        onClick={() => void remove()}
        disabled={busy}
        aria-label={`${studentLabel} ${title} 독서 기록 삭제`}
      >
        {busy ? "삭제 중…" : "삭제"}
      </button>
      {error ? <span className="classroom-reading-delete-error" role="alert">{error}</span> : null}
    </div>
  );
}
