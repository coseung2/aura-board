import type { CardData } from "../DraggableCard";
import { resolveDJQueueAuthorName } from "./dj-queue-state";

/**
 * 핸드오프 DJBoardPage.jsx 의 `.ab-dj-item` 그리드 구조를 그대로 포팅:
 *   [rank 24px] [tinythumb 56px] [info 1fr] [controls auto]
 * pending 상태일 때는 큐 아이템 전체에 연한 warn 틴트 + pending pill.
 */
type Props = {
  card: CardData;
  rank: number;
  canControl: boolean;
  isOwnPending: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
  onApprove: () => void;
  onReject: () => void;
  onMarkPlayed: () => void;
  onDelete: () => void;
};

export function DJQueueItem({
  card,
  rank,
  canControl,
  isOwnPending,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onApprove,
  onReject,
  onMarkPlayed,
  onDelete,
}: Props) {
  const submitter = resolveDJQueueAuthorName(card);
  const status = card.queueStatus ?? "pending";
  const isPending = status === "pending";

  return (
    <li
      className={[
        "dj-queue-item",
        `dj-status-${status}`,
        isPending && "is-pending",
        isDragging && "is-dragging",
        isDragOver && "is-drag-over",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={canControl}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="dj-rank">{rank}</div>

      {card.linkImage ? (
        <img
          className="dj-tinythumb"
          src={card.linkImage}
          width={56}
          height={42}
          alt=""
        />
      ) : (
        <div className="dj-tinythumb" aria-hidden="true">
          ♪
        </div>
      )}

      <div className="dj-info">
        <div className="dj-track">{card.title}</div>
        <div className="dj-sub">
          {card.linkDesc ? <>{card.linkDesc}</> : null}
          {submitter ? (
            <>
              {card.linkDesc ? " · " : ""}
              {submitter}
            </>
          ) : null}
          {isPending ? (
            <span className="dj-pending-pill">
              <span className="dj-dot" />
              대기
            </span>
          ) : null}
        </div>
      </div>

      <div className="dj-controls">
        {canControl ? (
          <>
            {isPending ? (
              <button
                type="button"
                className="dj-ctrl approve"
                onClick={onApprove}
                aria-label="승인"
              >
                승인
              </button>
            ) : null}
            <button
              type="button"
              className="dj-ctrl"
              onClick={onMarkPlayed}
              title="재생 완료로 이동"
              aria-label="재생 완료"
            >
              ✓
            </button>
            <button
              type="button"
              className="dj-ctrl reject"
              onClick={isPending ? onReject : onDelete}
              aria-label={isPending ? "거부" : "제거"}
            >
              {isPending ? "거부" : "제거"}
            </button>
          </>
        ) : isOwnPending ? (
          <button
            type="button"
            className="dj-ctrl reject"
            onClick={onDelete}
            aria-label="내 신청 취소"
          >
            취소
          </button>
        ) : null}
      </div>
    </li>
  );
}
