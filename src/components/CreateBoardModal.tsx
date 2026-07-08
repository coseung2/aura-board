"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateBreakoutBoardModal } from "./CreateBreakoutBoardModal";
import { CreateSpeedGameBoardModal } from "./CreateSpeedGameBoardModal";
import { BoardThumbnailPicker, type ThumbnailMode } from "./BoardThumbnailPicker";
import { LAYOUT_META, layoutThumbnail, type LayoutKey } from "@/lib/layout-meta";

type PickerRow = {
  id: LayoutKey;
  desc: string;
  hidden?: true;
};

const PICKER_ROWS: PickerRow[] = [
  { id: "freeform", desc: "담벼락처럼 카드를 모아 보기" },
  { id: "grid", desc: "격자 형태로 카드를 정렬", hidden: true },
  { id: "stream", desc: "SNS처럼 글과 댓글이 아래로 흐르는 피드" },
  { id: "columns", desc: "주제별로 게시물을 나눠 정리" },
  { id: "assignment", desc: "학생별 과제 제출 및 확인" },
  { id: "quiz", desc: "실시간 퀴즈 게임" },
  { id: "drawing", desc: "공동 그림판과 라이브러리", hidden: true },
  { id: "breakout", desc: "템플릿 기반 모둠 협력 보드", hidden: true },
  { id: "assessment", desc: "교사가 입력한 문항 기반 OMR 채점" },
  { id: "dj-queue", desc: "학생 YouTube 곡 신청 및 재생 순서 관리" },
  { id: "plant-roadmap", desc: "성장 단계별 관찰 사진과 기록 관리" },
  { id: "vibe-arcade", desc: "생성형 AI를 활용한 바이브 코딩 교실" },
  { id: "vibe-gallery", desc: "승인된 코딩 결과물 전시와 체험" },
  { id: "kordle", desc: "학생들이 매일 푸는 단어 추리 게임" },
  { id: "speed-game", desc: "모둠별 실시간 단어 설명 맞추기 게임" },
  { id: "question-board", desc: "학생 응답을 다양한 시각화로 표시" },
];

const READY_LAYOUT_IDS = new Set<LayoutKey>([
  "freeform",
  "columns",
  "dj-queue",
  "plant-roadmap",
  "kordle",
  "speed-game",
]);

const UNLOCKED_DEV_LAYOUT_IDS = new Set<LayoutKey>(["stream"]);

const LAYOUTS = PICKER_ROWS.map((row) => ({
  id: row.id,
  emoji: LAYOUT_META[row.id].emoji,
  label: READY_LAYOUT_IDS.has(row.id)
    ? LAYOUT_META[row.id].label
    : `${LAYOUT_META[row.id].label} (개발중)`,
  desc: row.desc,
  ready: READY_LAYOUT_IDS.has(row.id),
  selectable: READY_LAYOUT_IDS.has(row.id) || UNLOCKED_DEV_LAYOUT_IDS.has(row.id),
  thumbnail: layoutThumbnail(row.id),
  hidden: row.hidden,
}));

const VISIBLE_LAYOUTS = LAYOUTS.filter((layout) => !layout.hidden).sort(
  (a, b) => Number(b.selectable) - Number(a.selectable)
);
const PLAY_LAYOUT_IDS = new Set<LayoutKey>(["kordle", "speed-game"]);

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  classrooms: ClassroomItem[];
  userTier?: "free" | "pro";
  isAdmin?: boolean;
  onClose: () => void;
};

export function CreateBoardModal({
  classrooms,
  userTier = "pro",
  isAdmin = false,
  onClose,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"layout" | "classroom" | "breakout" | "speed-game">(
    "layout",
  );
  const [selectedLayout, setSelectedLayout] = useState<LayoutKey | null>(null);
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>("default");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<"LESSON" | "PLAY">("LESSON");

  async function createBoard(layoutId: LayoutKey, classroomId?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "",
          layout: layoutId,
          category,
          classroomId,
          thumbnailMode:
            thumbnailMode === "custom" && thumbnailUrl
              ? "custom"
              : "default",
          thumbnailUrl:
            thumbnailMode === "custom" && thumbnailUrl ? thumbnailUrl : null,
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
    if (
      !READY_LAYOUT_IDS.has(layoutId) &&
      !UNLOCKED_DEV_LAYOUT_IDS.has(layoutId)
    ) {
      return;
    }

    if (layoutId === "breakout") {
      setSelectedLayout(layoutId);
      setThumbnailMode("default");
      setThumbnailUrl(null);
      setStep("breakout");
      return;
    }

    if (layoutId === "speed-game") {
      setSelectedLayout(layoutId);
      setThumbnailMode("default");
      setThumbnailUrl(null);
      setStep("speed-game");
      return;
    }

    setCategory(PLAY_LAYOUT_IDS.has(layoutId) ? "PLAY" : "LESSON");
    setSelectedLayout(layoutId);
    setThumbnailMode("default");
    setThumbnailUrl(null);
    setStep("classroom");
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
          setThumbnailMode("default");
        }}
      />
    );
  }

  if (step === "speed-game") {
    return (
      <CreateSpeedGameBoardModal
        classrooms={classrooms}
        userTier={userTier}
        onClose={onClose}
        onBack={() => {
          setStep("layout");
          setSelectedLayout(null);
          setThumbnailMode("default");
          setThumbnailUrl(null);
        }}
      />
    );
  }

  const selectedLayoutMeta = selectedLayout
    ? LAYOUTS.find((layout) => layout.id === selectedLayout)
    : null;
  const requiresClassroom = selectedLayout === "dj-queue" || selectedLayout === "kordle";
  const visibleLayoutsForCategory = VISIBLE_LAYOUTS.filter((layout) =>
    (layout.ready || isAdmin) &&
    (category === "PLAY"
      ? PLAY_LAYOUT_IDS.has(layout.id)
      : !PLAY_LAYOUT_IDS.has(layout.id)),
  );

  const renderLayoutGrid = (layouts: typeof VISIBLE_LAYOUTS) => (
    <div className="layout-grid-picker">
      {layouts.map((layout) => (
        <button
          key={layout.id}
          type="button"
          className={`layout-grid-option${
            layout.ready ? "" : " layout-grid-option-dev"
          }`}
          onClick={() => handleSelect(layout.id)}
          disabled={busy || !layout.selectable}
        >
          <span className="layout-grid-option-preview">
            {layout.thumbnail ? (
              <img
                className="layout-grid-option-thumb"
                src={layout.thumbnail}
                alt={`${layout.label} 화면 미리보기`}
              />
            ) : (
              <span className="layout-grid-option-placeholder">
                <span className="layout-grid-option-emoji">
                  {layout.emoji}
                </span>
                <span className="layout-grid-option-status">
                  개발중
                </span>
              </span>
            )}
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
  );

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
              <fieldset className="create-board-category">
                <legend>보드 분류</legend>
                <label className="create-board-category-option">
                  <input
                    type="radio"
                    name="board-category"
                    value="LESSON"
                    checked={category === "LESSON"}
                    onChange={() => setCategory("LESSON")}
                  />
                  <span>수업</span>
                </label>
                <label className="create-board-category-option">
                  <input
                    type="radio"
                    name="board-category"
                    value="PLAY"
                    checked={category === "PLAY"}
                    onChange={() => setCategory("PLAY")}
                  />
                  <span>놀이</span>
                </label>
              </fieldset>
              <p className="create-board-hint">보드 유형을 선택하세요.</p>
              {renderLayoutGrid(visibleLayoutsForCategory)}
            </>
          )}

          {step === "classroom" && selectedLayout && (
            <>
              {selectedLayoutMeta && (
                <div className="create-board-thumbnail-panel create-board-thumbnail-panel--vertical">
                  <p className="create-board-hint">대시보드 썸네일</p>
                  <BoardThumbnailPicker
                    layout={selectedLayout}
                    mode={thumbnailMode}
                    url={thumbnailUrl}
                    onChange={({ mode, url }) => {
                      setThumbnailMode(mode);
                      setThumbnailUrl(url);
                    }}
                    disabled={busy}
                  />
                </div>
              )}
              <p className="create-board-hint">
                보드를 어느 학급에 연결할지 선택하세요.
              </p>
              <div className="layout-picker">
                <button
                  type="button"
                  className="layout-option"
                  onClick={() => createBoard(selectedLayout)}
                  disabled={busy || requiresClassroom}
                >
                  <span className="layout-option-emoji">□</span>
                  <span className="layout-option-label">학급 연결 없음</span>
                  <span className="layout-option-desc">
                    {requiresClassroom
                      ? "이 보드는 학급 선택이 필요합니다"
                      : "개인 보드로 생성"}
                  </span>
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
                    setThumbnailMode("default");
                    setThumbnailUrl(null);
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
