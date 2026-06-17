"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateBreakoutBoardModal } from "./CreateBreakoutBoardModal";
import { LAYOUT_META, type LayoutKey } from "@/lib/layout-meta";

type PickerRow = {
  id: LayoutKey;
  desc: string;
  hidden?: true;
};

const PICKER_ROWS: PickerRow[] = [
  { id: "freeform", desc: "칼럼 없이 카드를 차곡차곡 나열" },
  { id: "grid", desc: "격자 형태로 카드를 정렬", hidden: true },
  { id: "stream", desc: "SNS처럼 글과 댓글이 아래로 흐르는 피드" },
  { id: "columns", desc: "주제별로 게시물을 나눠 정리" },
  { id: "assignment", desc: "학생별 과제 제출 및 확인" },
  { id: "quiz", desc: "실시간 퀴즈 게임" },
  { id: "drawing", desc: "공동 그림판과 라이브러리", hidden: true },
  { id: "breakout", desc: "템플릿 기반 모둠 협력 보드", hidden: true },
  { id: "assessment", desc: "교사가 입력한 문항 기반 OMR 채점" },
  { id: "dj-queue", desc: "학생 YouTube 곡 신청 및 재생 순서 관리" },
  { id: "vibe-arcade", desc: "생성형 AI를 활용한 바이브 코딩 교실" },
  { id: "vibe-gallery", desc: "승인된 코딩 결과물 전시와 체험" },
  { id: "question-board", desc: "학생 응답을 다양한 시각화로 표시" },
];

const READY_LAYOUT_IDS = new Set<LayoutKey>([
  "freeform",
  "stream",
  "columns",
  "dj-queue",
]);

const LAYOUTS = PICKER_ROWS.map((row) => ({
  id: row.id,
  emoji: LAYOUT_META[row.id].emoji,
  label: READY_LAYOUT_IDS.has(row.id)
    ? LAYOUT_META[row.id].label
    : `${LAYOUT_META[row.id].label} (개발중)`,
  desc: row.desc,
  hidden: row.hidden,
}));

const VISIBLE_LAYOUTS = LAYOUTS.filter((layout) => !layout.hidden);

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  classrooms: ClassroomItem[];
  userTier?: "free" | "pro";
  onClose: () => void;
};

export function CreateBoardModal({
  classrooms,
  userTier = "pro",
  onClose,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"layout" | "classroom" | "breakout">(
    "layout"
  );
  const [selectedLayout, setSelectedLayout] = useState<LayoutKey | null>(null);

  async function createBoard(layoutId: LayoutKey, classroomId?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "",
          layout: layoutId,
          classroomId,
        }),
      });

      if (!res.ok) {
        alert(`보드 생성 실패: ${await res.text()}`);
        setBusy(false);
        return;
      }

      const { board } = await res.json();
      router.push(`/board/${board.slug}`);
    } catch (err) {
      console.error(err);
      setBusy(false);
    }
  }

  function handleSelect(layoutId: LayoutKey) {
    if (layoutId === "breakout") {
      setSelectedLayout(layoutId);
      setStep("breakout");
      return;
    }

    const needsClassroom =
      layoutId === "columns" ||
      layoutId === "assessment" ||
      layoutId === "dj-queue" ||
      layoutId === "vibe-arcade" ||
      layoutId === "vibe-gallery" ||
      layoutId === "question-board";

    if (needsClassroom && classrooms.length > 0) {
      setSelectedLayout(layoutId);
      setStep("classroom");
      return;
    }

    createBoard(layoutId);
  }

  if (step === "breakout") {
    return (
      <CreateBreakoutBoardModal
        classrooms={classrooms}
        userTier={userTier}
        onClose={onClose}
        onBack={() => {
          setStep("layout");
          setSelectedLayout(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal create-board-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {step === "layout" ? "새 보드 만들기" : "학급 선택"}
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="modal-body">
          {step === "layout" && (
            <>
              <p className="create-board-hint">보드 유형을 선택하세요.</p>
              <div className="layout-grid-picker">
                {VISIBLE_LAYOUTS.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    className="layout-grid-option"
                    onClick={() => handleSelect(layout.id)}
                    disabled={busy}
                  >
                    <span className="layout-grid-option-emoji">
                      {layout.emoji}
                    </span>
                    <span className="layout-grid-option-label">
                      {layout.label}
                    </span>
                    <span className="layout-grid-option-desc">
                      {layout.desc}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "classroom" && selectedLayout && (
            <>
              <p className="create-board-hint">
                보드를 어느 학급에 연결할지 선택하세요.
              </p>
              <div className="layout-picker">
                <button
                  type="button"
                  className="layout-option"
                  onClick={() => createBoard(selectedLayout)}
                  disabled={busy}
                >
                  <span className="layout-option-emoji">□</span>
                  <span className="layout-option-label">학급 연결 없음</span>
                  <span className="layout-option-desc">개인 보드로 생성</span>
                </button>

                {classrooms.map((classroom) => (
                  <button
                    key={classroom.id}
                    type="button"
                    className="layout-option"
                    onClick={() => createBoard(selectedLayout, classroom.id)}
                    disabled={busy}
                  >
                    <span className="layout-option-emoji">▥</span>
                    <span className="layout-option-label">
                      {classroom.name}
                    </span>
                    <span className="layout-option-desc">
                      학생 {classroom.studentCount}명 · 빈 보드로 생성
                    </span>
                  </button>
                ))}
              </div>

              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => {
                    setStep("layout");
                    setSelectedLayout(null);
                  }}
                  disabled={busy}
                >
                  뒤로
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
