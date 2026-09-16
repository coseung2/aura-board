"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, School, Unlink } from "lucide-react";
import { CreateBreakoutBoardModal } from "./CreateBreakoutBoardModal";
import { BoardThumbnailPicker, type ThumbnailMode } from "./BoardThumbnailPicker";
import { LAYOUT_META, layoutThumbnail, type LayoutKey } from "@/lib/layout-meta";
import { deriveBoardCategory } from "@/lib/game-platform/catalog";
import { canCreateLayout, canReadLayout, layoutRelease } from "@/lib/product-release";

type PickerRow = {
  id: LayoutKey;
  desc: string;
};

const PICKER_ROWS: PickerRow[] = [
  { id: "freeform", desc: "담벼락처럼 카드를 모아 보기" },
  { id: "grid", desc: "격자 형태로 카드를 정렬" },
  { id: "stream", desc: "SNS처럼 글과 댓글이 아래로 흐르는 피드" },
  { id: "columns", desc: "주제별로 게시물을 나눠 정리" },
  { id: "assignment", desc: "학생별 과제 제출 및 확인" },
  { id: "quiz", desc: "실시간 퀴즈 게임" },
  { id: "breakout", desc: "템플릿 기반 모둠 협력 보드" },
  { id: "assessment", desc: "교사가 입력한 문항 기반 OMR 채점" },
  { id: "dj-queue", desc: "학생 YouTube 곡 신청 및 재생 순서 관리" },
  { id: "plant-roadmap", desc: "성장 단계별 관찰 사진과 기록 관리" },
  { id: "vibe-arcade", desc: "생성형 AI를 활용한 바이브 코딩 교실" },
  { id: "vibe-gallery", desc: "승인된 코딩 결과물 전시와 체험" },
  { id: "question-board", desc: "학생 응답을 다양한 시각화로 표시" },
];

const LAYOUTS = PICKER_ROWS.map((row) => ({
  id: row.id,
  emoji: LAYOUT_META[row.id].emoji,
  label: layoutRelease(row.id)?.stage === "development"
    ? `${LAYOUT_META[row.id].label} (개발중)`
    : LAYOUT_META[row.id].label,
  desc: row.desc,
  ready: layoutRelease(row.id)?.stage === "stable",
  selectable: layoutRelease(row.id)?.picker === "enabled",
  thumbnail: layoutThumbnail(row.id),
  hidden: layoutRelease(row.id)?.picker === "hidden",
}));

const VISIBLE_LAYOUTS = LAYOUTS.filter((layout) => !layout.hidden).sort(
  (a, b) => Number(b.selectable) - Number(a.selectable)
);
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
  initialLayout?: string | null;
  preferredClassroomId?: string | null;
  fixedClassroomId?: string | null;
};

export function CreateBoardModal({
  classrooms,
  userTier = "pro",
  isAdmin = false,
  onClose,
  initialLayout = null,
  preferredClassroomId = null,
  fixedClassroomId = null,
}: Props) {
  const router = useRouter();
  const requestedInitialLayout = initialLayout && initialLayout in LAYOUT_META
    ? (initialLayout as LayoutKey)
    : null;
  const safeInitialLayout =
    requestedInitialLayout &&
    canCreateLayout(requestedInitialLayout, { isAdmin }) &&
    layoutRelease(requestedInitialLayout)?.picker === "enabled"
      ? requestedInitialLayout
      : null;
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [step, setStep] = useState<"layout" | "classroom" | "breakout">(
    safeInitialLayout === "breakout"
      ? "breakout"
      : safeInitialLayout
        ? "classroom"
        : "layout",
  );
  const [selectedLayout, setSelectedLayout] = useState<LayoutKey | null>(safeInitialLayout);
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>("default");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  async function createBoard(layoutId: LayoutKey, classroomId?: string) {
    if (busy) return;
    setBusy(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "",
          layout: layoutId,
          category: deriveBoardCategory(layoutId),
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
        throw new Error("board_create_failed");
      }

      const { board } = await res.json();
      router.push(`/board/${board.slug}`);
    } catch (err) {
      console.error(err);
      setCreateError("보드 생성 결과를 확인하지 못했습니다. 대시보드를 확인한 뒤 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  function handleSelect(layoutId: LayoutKey) {
    if (
      !canCreateLayout(layoutId, { isAdmin }) ||
      layoutRelease(layoutId)?.picker !== "enabled"
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

  const selectedLayoutMeta = selectedLayout
    ? LAYOUTS.find((layout) => layout.id === selectedLayout)
    : null;
  const requiresClassroom = selectedLayout === "dj-queue" || Boolean(fixedClassroomId);
  const visibleClassrooms = fixedClassroomId
    ? classrooms.filter((classroom) => classroom.id === fixedClassroomId)
    : classrooms;
  const orderedClassrooms = preferredClassroomId
    ? [...visibleClassrooms].sort((a, b) =>
        a.id === preferredClassroomId ? -1 : b.id === preferredClassroomId ? 1 : 0,
      )
    : visibleClassrooms;
  const visibleLayoutsForCategory = VISIBLE_LAYOUTS.filter(
    (layout) => canReadLayout(layout.id, { isAdmin }),
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
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div className="add-card-modal create-board-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {step === "layout" ? "새 보드 만들기" : "학급 선택"}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>

        <div className="modal-body">
          {createError && <p role="alert">{createError}</p>}
          {step === "layout" && (
            <>
              <p className="create-board-hint">
                수업 보드 유형을 선택하세요.
                {isAdmin && " 개발중 게임은 관리자와 테스트 학급의 놀이 탭에서 확인할 수 있습니다."}
              </p>
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
              <div className="classroom-choice-grid">
                {!fixedClassroomId && (
                  <button
                    type="button"
                    className="classroom-choice-card"
                    onClick={() => createBoard(selectedLayout)}
                    disabled={busy || requiresClassroom}
                  >
                    <span className="classroom-choice-head">
                      <Unlink
                        className="classroom-choice-icon"
                        size={15}
                        aria-hidden="true"
                      />
                      <span className="classroom-choice-label">학급 연결 없음</span>
                    </span>
                    <span className="classroom-choice-desc">
                      {requiresClassroom
                        ? "이 보드는 학급 선택이 필요합니다"
                        : "개인 보드로 생성"}
                    </span>
                  </button>
                )}

                {!fixedClassroomId && classrooms.length === 0 && (
                  <a
                    className="classroom-choice-create"
                    href={`/classroom?create=1&resumeLayout=${encodeURIComponent(selectedLayout)}`}
                  >
                    <span className="classroom-choice-head">
                      <Plus
                        className="classroom-choice-icon"
                        size={15}
                        aria-hidden="true"
                      />
                      <span className="classroom-choice-label">학급 만들기</span>
                    </span>
                  </a>
                )}

                {orderedClassrooms.map((classroom) => (
                  <button
                    key={classroom.id}
                    type="button"
                    className="classroom-choice-card"
                    onClick={() => createBoard(selectedLayout, classroom.id)}
                    disabled={busy}
                  >
                    <span className="classroom-choice-head">
                      <School
                        className="classroom-choice-icon"
                        size={15}
                        aria-hidden="true"
                      />
                      <span className="classroom-choice-label">
                        {classroom.name}
                      </span>
                    </span>
                    <span className="classroom-choice-desc">
                      학생 {classroom.studentCount}명 · 빈 보드로 생성
                      {classroom.id === preferredClassroomId ? " · 방금 만든 학급" : ""}
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
