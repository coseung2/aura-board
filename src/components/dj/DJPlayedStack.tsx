"use client";

import type { CardData } from "../DraggableCard";
import {
  DJ_PLAYED_DRAG_TYPE,
  resolveDJQueueAuthorName,
} from "./dj-queue-state";

type Props = {
  cards: CardData[];
  canControl: boolean;
  /** 드로어 열림 상태 — 부모(DJBoard)의 `재생 완료` 토글과 연결. */
  open: boolean;
  onClose: () => void;
  /** Called when the user drags a played card back into the main queue.
   *  DJBoard maps that to: queueStatus = "approved" + reinsert at the end. */
  onRestore: (cardId: string) => void;
  onMarkPlayed: (cardId: string) => void;
  /** Called when the user taps the delete button on a played card.
   *  DJBoard maps that to DELETE /api/boards/:id/queue/:cardId. */
  onDelete: (cardId: string) => void;
};

/**
 * 재생 완료 드로어 — 왼쪽에서 슬라이드.
 * 핸드오프 디자인(DJBoardPage.jsx)의 `ab-dj-played-drawer.ab-dj-played-left` 형태.
 * 3-column 고정 레일을 대체.
 */
export function DJPlayedStack({
  cards,
  canControl,
  open,
  onClose,
  onRestore,
  onMarkPlayed,
  onDelete,
}: Props) {
  function handleDragStart(e: React.DragEvent<HTMLLIElement>, cardId: string) {
    if (!canControl) return;
    e.dataTransfer.effectAllowed = "move";
    // 쪽 구분용 MIME — queue 가 외부 드롭인지 내부 재정렬인지 구분.
    e.dataTransfer.setData(DJ_PLAYED_DRAG_TYPE, cardId);
    e.dataTransfer.setData("text/plain", cardId);
  }

  return (
    <>
      <div
        className={`dj-played-backdrop${open ? " is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`dj-played-stack${open ? " is-open" : ""}`}
        aria-label="재생 완료된 곡"
        aria-hidden={!open}
        onDragOver={(e) => {
          const queueItemDrag =
            e.dataTransfer.types.includes("text/plain") &&
            !e.dataTransfer.types.includes(DJ_PLAYED_DRAG_TYPE);
          if (canControl && queueItemDrag) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          const queueItemDrag =
            e.dataTransfer.types.includes("text/plain") &&
            !e.dataTransfer.types.includes(DJ_PLAYED_DRAG_TYPE);
          if (!canControl || !queueItemDrag) return;
          e.preventDefault();
          const cardId = e.dataTransfer.getData("text/plain");
          if (cardId) onMarkPlayed(cardId);
        }}
      >
        <header className="dj-played-head">
          <div>
            <div className="dj-played-title">재생 완료</div>
            <div className="dj-played-subtitle">
              드래그로 대기열에 복귀시킬 수 있습니다
            </div>
          </div>
          <button
            type="button"
            className="dj-played-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {cards.length === 0 ? (
          <div className="dj-empty" style={{ padding: "24px 16px" }}>
            재생 완료된 곡이 없습니다.
          </div>
        ) : (
          <ul className="dj-played-list">
            {cards.map((card) => (
              <li
                key={card.id}
                className="dj-played-item"
                draggable={canControl}
                onDragStart={(e) => handleDragStart(e, card.id)}
                onDoubleClick={() => canControl && onRestore(card.id)}
                title={
                  canControl
                    ? "끌어서 큐로 되돌리기 · 더블클릭으로 복귀"
                    : card.title
                }
              >
                {card.linkImage ? (
                  <img
                    className="dj-played-thumb"
                    src={card.linkImage}
                    width={44}
                    height={34}
                    alt=""
                  />
                ) : (
                  <div className="dj-played-thumb" aria-hidden="true">
                    ♪
                  </div>
                )}
                <div className="dj-info">
                  <div className="dj-track">{card.title}</div>
                  <div className="dj-sub">
                    {card.linkDesc ? <>{card.linkDesc} · </> : null}
                    {resolveDJQueueAuthorName(card)}
                  </div>
                </div>
                {canControl ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="dj-ctrl restore"
                      draggable={false}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore(card.id);
                      }}
                      title="대기열로 복귀"
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      className="dj-played-delete"
                      aria-label="재생 완료 곡 삭제"
                      title="삭제"
                      draggable={false}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(card.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <footer className="dj-played-foot">총 {cards.length}곡 재생됨</footer>
      </aside>
    </>
  );
}
