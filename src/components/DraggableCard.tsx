"use client";

import { useRef } from "react";
import Draggable, {
  type DraggableData,
  type DraggableEvent,
} from "react-draggable";
import { CardBody } from "./cards/CardBody";

export type CardData = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl?: string | null;
  thumbUrl?: string | null;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDesc?: string | null;
  linkImage?: string | null;
  videoUrl?: string | null;
  /** card-file-attachment — 레거시 단일 파일 첨부 (1개). multi-attachment
   *  시점 이후로는 신규 쓰기에 사용되지 않지만, 기존 카드의 렌더 fallback
   *  경로를 위해 읽기 타입으로 유지. */
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  /** multi-attachment (2026-04-20): 정규화된 다중 첨부. 비어있으면
   *  레거시 imageUrl/videoUrl/fileUrl이 fallback으로 렌더된다. */
  attachments?: Array<{
    id: string;
    kind: string;
    url: string;
    previewUrl?: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  sectionId?: string | null;
  authorId: string | null;
  studentAuthorId?: string | null;
  createdAt?: string;
  externalAuthorName?: string | null;
  studentAuthorName?: string | null;
  authorName?: string | null;
  /** DJ queue status. null on non-dj-queue boards. */
  queueStatus?: string | null;
  /** CardAuthor join rows. When empty, CardAuthorFooter falls back to the
   *  legacy pickAuthorName(external, student, author) chain. Sorted
   *  ascending by .order — primary is index 0. */
  authors?: Array<{
    id: string;
    studentId: string | null;
    displayName: string;
    order: number;
  }>;
  /** card-comments-likes (2026-04-26): 보드 단위 익명 토글 (Board.anonymousAuthor).
   *  CardBody → CardAuthorFooter 가 author 라벨을 "익명" 으로 마스킹. 보드 RSC
   *  에서 모든 카드에 동일한 board.anonymousAuthor 값을 denorm 한다. */
  anonymousAuthor?: boolean;
  /** card-anonymous (2026-06-17): 카드 단위 익명 게시 의도.
   *  true = 작성자가 이 카드를 익명으로 게시함.
   *  서버의 cardProps 매핑에서 effectiveRole과 조합해 anonymousAuthor를 최종
   *  결정한다. */
  isAnonymous?: boolean;
};

type Props = {
  card: CardData;
  canEdit: boolean;
  canDelete: boolean;
  onPositionChange: (x: number, y: number) => void;
  onDelete: () => void;
  onOpen: () => void;
};

export function DraggableCard({
  card,
  canEdit,
  canDelete,
  onPositionChange,
  onDelete,
  onOpen,
}: Props) {
  const nodeRef = useRef<HTMLElement>(null);

  // Static render for viewers — no react-draggable wrapper
  if (!canEdit) {
    return (
      <article
        ref={nodeRef}
        className="padlet-card is-static is-clickable"
        style={{
          position: "absolute",
          left: card.x,
          top: card.y,
          width: card.width,
          minHeight: card.height,
          backgroundColor: card.color ?? undefined,
        }}
        aria-label={card.title}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        tabIndex={0}
        role="button"
      >
        <CardBody card={card} />
      </article>
    );
  }

  return (
    <Draggable
      nodeRef={nodeRef as React.RefObject<HTMLElement>}
      position={{ x: card.x, y: card.y }}
      onStop={(_e: DraggableEvent, data: DraggableData) => {
        // Drag — commit the new position. No drag (data.x/y unchanged) =
        // click; open the detail modal instead.
        if (data.x !== card.x || data.y !== card.y) {
          onPositionChange(data.x, data.y);
        } else {
          onOpen();
        }
      }}
      cancel=".padlet-card-delete, .padlet-card-content-toggle"
      bounds="parent"
    >
      <article
        ref={nodeRef}
        className="padlet-card is-draggable is-clickable"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: card.width,
          minHeight: card.height,
          backgroundColor: card.color ?? undefined,
        }}
        aria-label={card.title}
      >
        <CardBody card={card} />
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`"${card.title}" 카드를 삭제할까요?`)) {
                onDelete();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="padlet-card-delete"
            aria-label={`${card.title} 카드 삭제`}
          >
            ×
          </button>
        )}
      </article>
    </Draggable>
  );
}
