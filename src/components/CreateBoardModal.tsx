"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateBreakoutBoardModal } from "./CreateBreakoutBoardModal";
import { LAYOUT_META, type LayoutKey } from "@/lib/layout-meta";

// `hidden: true`는 CreateBoardModal의 레이아웃 피커에서만 숨김 — 백엔드
// enum, 기존 보드 렌더, 라우트는 그대로 유지. 나중에 쓸지 결정되면 플래그만
// 지우면 다시 노출. (사용자 결정 2026-04-22)
//
// emoji/label은 LAYOUT_META(single source)에서 가져오고, 설명문·hidden 여부만
// 여기서 관리한다.
type PickerRow = {
  id: LayoutKey;
  desc: string;
  hidden?: true;
};

const PICKER_ROWS: PickerRow[] = [
  { id: "freeform", desc: "캔버스 위에 자유롭게 카드 배치", hidden: true },
  { id: "grid", desc: "깔끔한 격자 형태로 카드 정렬", hidden: true },
  { id: "stream", desc: "위에서 아래로 흐르는 피드형", hidden: true },
  { id: "columns", desc: "주제별로 게시물을 올릴 수 있습니다" },
  { id: "assignment", desc: "학생별 과제 제출 및 확인" },
  { id: "quiz", desc: "카훗 스타일 실시간 퀴즈 게임" },
  { id: "drawing", desc: "Drawpile 기반 공동 그림판 + 라이브러리", hidden: true },
  { id: "breakout", desc: "템플릿 기반 모둠 협력 보드 (KWL · 브레인스토밍 등)", hidden: true },
  { id: "assessment", desc: "교사가 입력해둔 답안 기반 OMR 채점 기능" },
  { id: "dj-queue", desc: "학생이 YouTube 곡을 신청 · DJ가 재생 순서 관리" },
  { id: "vibe-arcade", desc: "생성형 AI를 활용한 바이브 코딩 교실" },
  { id: "vibe-gallery", desc: "승인된 코딩 결과물을 전시 · 체험" },
  { id: "question-board", desc: "교사가 주제를 던지고 학생 응답을 다양한 시각화로 표시" },
  { id: "statistics", desc: "통계활용대회 학급보드 — 11단계 미션 기반 탐구 활동" },
];

const LAYOUTS = PICKER_ROWS.map((r) => ({
  id: r.id,
  emoji: LAYOUT_META[r.id].emoji,
  label: LAYOUT_META[r.id].label,
  desc: r.desc,
  hidden: r.hidden,
}));

const VISIBLE_LAYOUTS = LAYOUTS.filter((l) => !l.hidden);

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

export function CreateBoardModal({ classrooms, userTier = "pro", onClose }: Props) {
  // Default matches backend tier.ts: solo-teacher deployment defaults to Pro
  // unless FREE_USER_IDS env explicitly lists this user. The old "free"
  // default made every breakout template look locked even for Pro users.
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"layout" | "classroom" | "breakout">("layout");
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);

  async function createBoard(layoutId: string, classroomId?: string) {
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
      if (res.ok) {
        const { board } = await res.json();
        router.push(`/board/${board.slug}`);
      } else {
        alert(`보드 생성 실패: ${await res.text()}`);
        setBusy(false);
      }
    } catch (err) {
      console.error(err);
      setBusy(false);
    }
  }

  function handleSelect(layoutId: string) {
    if (layoutId === "breakout") {
      setSelectedLayout(layoutId);
      setStep("breakout");
      return;
    }
    if (
      (layoutId === "columns" ||
        layoutId === "assessment" ||
        layoutId === "dj-queue" ||
        layoutId === "vibe-arcade" ||
        layoutId === "vibe-gallery" ||
        layoutId === "question-board") &&
      classrooms.length > 0
    ) {
      setSelectedLayout(layoutId);
      setStep("classroom");
    } else {
      createBoard(layoutId);
    }
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
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {step === "layout" && (
            <>
              <p className="create-board-hint">보드 유형을 선택하세요</p>
              <div className="layout-grid-picker">
                {VISIBLE_LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="layout-grid-option"
                    onClick={() => handleSelect(l.id)}
                    disabled={busy}
                  >
                    <span className="layout-grid-option-emoji">{l.emoji}</span>
                    <span className="layout-grid-option-label">{l.label}</span>
                    <span className="layout-grid-option-desc">{l.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "classroom" && selectedLayout && (
            <>
              <p className="create-board-hint">
                보드를 어느 학급에 연결할지 선택하세요
              </p>
              <div className="layout-picker">
                <button
                  type="button"
                  className="layout-option"
                  onClick={() => createBoard(selectedLayout)}
                  disabled={busy}
                >
                  <span className="layout-option-emoji">📊</span>
                  <span className="layout-option-label">학급 연결 없이</span>
                  <span className="layout-option-desc">개인 보드로 생성</span>
                </button>
                {classrooms.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="layout-option"
                    onClick={() => createBoard(selectedLayout, c.id)}
                    disabled={busy}
                  >
                    <span className="layout-option-emoji">🏫</span>
                    <span className="layout-option-label">{c.name}</span>
                    <span className="layout-option-desc">
                      학생 {c.studentCount}명 · 빈 보드로 생성
                    </span>
                  </button>
                ))}
              </div>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => { setStep("layout"); setSelectedLayout(null); }}
                  disabled={busy}
                >
                  ← 뒤로
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
