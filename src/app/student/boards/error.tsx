"use client";

export default function StudentBoardsError({ reset }: { reset: () => void }) {
  return (
    <main className="student-page student-boards-page">
      <div className="student-board-error" role="alert">
        <h1>보드를 불러오지 못했어요.</h1>
        <button type="button" onClick={reset}>
          다시 시도
        </button>
      </div>
    </main>
  );
}
