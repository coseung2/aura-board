"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  classroomId: string;
  studentId: string;
  studentName: string;
};

type ActionState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function WalkingStudentDeleteAction({
  classroomId,
  studentId,
  studentName,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  async function handleDelete() {
    if (
      !window.confirm(
        `${studentName} 학생의 걷기 기록 전체(모든 날짜)를 삭제할까요?\n삭제 후 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }

    setState({ status: "busy" });
    try {
      const response = await fetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/walking/${encodeURIComponent(studentId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        deletedCount?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "walking_delete_failed",
        );
      }

      const deletedCount =
        typeof payload?.deletedCount === "number" ? payload.deletedCount : 0;
      setState({
        status: "success",
        message: `걷기 기록 ${deletedCount.toLocaleString("ko-KR")}건을 삭제했습니다.`,
      });
      router.refresh();
    } catch (error) {
      console.error("[WalkingStudentDeleteAction]", error);
      setState({
        status: "error",
        message: "걷기 기록을 삭제하지 못했습니다. 다시 시도해 주세요.",
      });
    }
  }

  return (
    <span className="walking-student-delete-cell" role="cell">
      <button
        type="button"
        className="walking-student-delete"
        onClick={() => void handleDelete()}
        disabled={state.status === "busy"}
        aria-label={`${studentName} 걷기 기록 전체 삭제`}
      >
        {state.status === "busy" ? "삭제 중…" : "전체 삭제"}
      </button>
      {state.status === "success" || state.status === "error" ? (
        <small
          className={`walking-student-delete-status walking-student-delete-status--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </small>
      ) : null}
    </span>
  );
}
