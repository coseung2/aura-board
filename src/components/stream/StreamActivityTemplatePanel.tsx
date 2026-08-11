"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CardData } from "../DraggableCard";
import {
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplate,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";
import {
  MapActivityPanel,
  buildTimeline,
  buildWindowOpeningCells,
  buildWordCloud,
  groupWindowOpeningCards,
  limitWordCloudInput,
  normalizeWordCloudEntry,
  wordCloudLayout,
  type WindowOpeningCell,
} from "./StreamActivityPanels";

type Props = {
  template: StreamActivityTemplate;
  sectionId: string;
  cards: CardData[];
  canEdit: boolean;
  isTeacherView?: boolean;
  windowMemberCount?: number;
  windowMemberNames?: string[];
  windowCurrentMemberName?: string | null;
  state?: StreamActivityTemplateState | null;
  canEditCard?: (card: CardData) => boolean;
  onEditCard?: (card: CardData) => void;
  onDeleteCard?: (card: CardData) => void;
  onStateChange?: (state: StreamActivityTemplateState | null) => Promise<boolean>;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
};

export function StreamActivityTemplatePanel({
  template,
  sectionId,
  cards,
  canEdit,
  isTeacherView = false,
  windowMemberCount,
  windowMemberNames,
  windowCurrentMemberName,
  state,
  canEditCard,
  onEditCard,
  onDeleteCard,
  onStateChange,
  onCreateCard,
}: Props) {
  if (template === "window_opening") {
    return (
      <WindowOpeningPanel
        cards={cards}
        canEdit={canEdit}
        isTeacherView={isTeacherView}
        memberCount={windowMemberCount}
        memberNames={windowMemberNames}
        currentMemberName={windowCurrentMemberName}
        canEditCard={canEditCard}
        onEditCard={onEditCard}
        onDeleteCard={onDeleteCard}
        onCreateCard={onCreateCard}
      />
    );
  }
  if (template === "word_cloud") {
    return (
      <WordCloudPanel
        cards={cards}
        canEdit={canEdit}
        isTeacherView={isTeacherView}
        state={state}
        canEditCard={canEditCard}
        onEditCard={onEditCard}
        onStateChange={onStateChange}
        onCreateCard={onCreateCard}
      />
    );
  }
  if (template === "timeline") {
    return (
      <TimelinePanel
        cards={cards}
        canEdit={canEdit}
        canEditCard={canEditCard}
        onEditCard={onEditCard}
        onCreateCard={onCreateCard}
      />
    );
  }
  return <MapActivityPanel sectionId={sectionId} canEdit={canEdit} />;
}

function WindowOpeningPanel({
  cards,
  canEdit,
  isTeacherView,
  memberCount,
  memberNames,
  currentMemberName,
  canEditCard,
  onEditCard,
  onDeleteCard,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  isTeacherView: boolean;
  memberCount?: number;
  memberNames?: string[];
  currentMemberName?: string | null;
  canEditCard?: (card: CardData) => boolean;
  onEditCard?: (card: CardData) => void;
  onDeleteCard?: (card: CardData) => void;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const cells = useMemo(
    () => buildWindowOpeningCells(memberCount, memberNames),
    [memberCount, memberNames],
  );
  const groupedCards = useMemo(
    () => groupWindowOpeningCards(cards, cells),
    [cards, cells],
  );

  return (
    <div className="stream-activity-panel stream-window-panel">
      <div className="stream-window-board">
        {cells.map((cell) => {
          const cellCards = groupedCards[cell.id] ?? [];
          const canWriteCell =
            canEdit &&
            canWriteWindowOpeningCell({
              cell,
              isTeacherView,
              memberNames,
              currentMemberName,
            });
          return (
            <div
              key={cell.id}
              className={cell.kind === "agreement" ? "stream-window-center" : undefined}
              style={{ gridColumn: cell.column, gridRow: cell.row }}
            >
              <span className="stream-window-cell-label">{cell.label}</span>
              <div className="stream-window-note-stack">
                {cellCards.map((card) => {
                  const editable = canWriteCell && (canEditCard?.(card) ?? false);
                  return (
                    <article key={card.id} className="stream-window-note">
                      {card.title && card.title !== cell.label && <strong>{card.title}</strong>}
                      <p>{card.content}</p>
                      {editable && (onEditCard || onDeleteCard) && (
                        <div className="stream-template-inline-actions">
                          {onEditCard && (
                            <button
                              type="button"
                              className="stream-template-inline-edit"
                              onClick={() => onEditCard(card)}
                            >
                              수정
                            </button>
                          )}
                          {onDeleteCard && (
                            <button
                              type="button"
                              className="stream-template-inline-edit stream-template-inline-delete"
                              onClick={() => onDeleteCard(card)}
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {canWriteCell && (
                <WindowCellComposer
                  label={cell.label}
                  onCreateCard={onCreateCard}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function canWriteWindowOpeningCell({
  cell,
  isTeacherView,
  memberNames,
  currentMemberName,
}: {
  cell: WindowOpeningCell;
  isTeacherView: boolean;
  memberNames?: string[];
  currentMemberName?: string | null;
}): boolean {
  if (isTeacherView) return true;
  if (cell.kind === "agreement") return true;
  if (!currentMemberName || !memberNames || memberNames.length === 0) return true;
  return normalizeWindowMemberName(cell.label) === normalizeWindowMemberName(currentMemberName);
}

function normalizeWindowMemberName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function WordCloudPanel({
  cards,
  canEdit,
  isTeacherView,
  state,
  canEditCard,
  onEditCard,
  onStateChange,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  isTeacherView: boolean;
  state?: StreamActivityTemplateState | null;
  canEditCard?: (card: CardData) => boolean;
  onEditCard?: (card: CardData) => void;
  onStateChange?: (state: StreamActivityTemplateState | null) => Promise<boolean>;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const words = useMemo(() => buildWordCloud(cards), [cards]);
  const editableResponses = useMemo(
    () => cards.filter((card) => canEditCard?.(card) ?? false),
    [canEditCard, cards],
  );
  const layout = useMemo(() => wordCloudLayout(words), [words]);
  const visibleWords = useMemo(
    () =>
      words
        .map((word, index) => ({ word, pos: layout[index] }))
        .filter(
          (item): item is { word: (typeof words)[number]; pos: { x: number; y: number } } =>
            item.pos != null,
        ),
    [layout, words],
  );
  const normalizedState = normalizeStreamActivityTemplateState(state);
  const published = normalizedState.wordCloudPublished === true;
  const canSeeCloud = published;
  const [publishing, setPublishing] = useState(false);

  async function publish() {
    if (!onStateChange || publishing) return;
    setPublishing(true);
    try {
      await onStateChange({ ...normalizedState, wordCloudPublished: true });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="stream-activity-panel stream-word-panel">
      {isTeacherView && (
        <div className="stream-word-toolbar">
          <span>
            {published
              ? "공개됨"
              : `비공개 수집 중 · ${cards.length}개 입력`}
          </span>
          <button
            type="button"
            onClick={publish}
            disabled={published || publishing || !onStateChange}
          >
            {published ? "공개됨" : "공개"}
          </button>
        </div>
      )}
      <div className="stream-word-stage">
        {!canSeeCloud ? (
          <p className="stream-activity-muted">
            교사가 공개하면 워드클라우드가 표시됩니다.
          </p>
        ) : words.length === 0 ? (
          <p className="stream-activity-muted">게시글 없음</p>
        ) : visibleWords.length === 0 ? (
          <p className="stream-activity-muted">표시할 공간이 부족해요.</p>
        ) : (
          <div className="stream-word-cloud" aria-label="워드클라우드">
            {visibleWords.map(({ word, pos }) => {
              return (
                <span
                  key={word.text}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    color: word.color,
                    fontSize: `${14 + word.weight * 10}px`,
                  }}
                  title={`${word.count}회`}
                >
                  {word.text}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="stream-word-input-block">
          <QuickTextForm
            className="stream-word-input"
            placeholder="떠오르는 단어를 입력해주세요."
            submitLabel="추가"
            normalizeInput={limitWordCloudInput}
            successMessage="친구들의 응답을 기다려볼까요? 또 입력하셔도 좋아요!"
            errorMessage="반영에 실패했어요."
            onSubmit={(content) => onCreateCard({ title: "", content })}
          />
          {!isTeacherView && editableResponses.length > 0 && onEditCard && (
            <div className="stream-word-response-list" aria-label="내 응답">
              {editableResponses.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="stream-word-response-item"
                  onClick={() => onEditCard(card)}
                >
                  <span>{card.content}</span>
                  <strong>수정</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({
  cards,
  canEdit,
  canEditCard,
  onEditCard,
  onCreateCard,
}: {
  cards: CardData[];
  canEdit: boolean;
  canEditCard?: (card: CardData) => boolean;
  onEditCard?: (card: CardData) => void;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const items = useMemo(() => buildTimeline(cards), [cards]);
  return (
    <div className="stream-activity-panel stream-timeline-panel">
      <div className="stream-timeline-stage">
        {items.length === 0 ? (
          <p className="stream-activity-muted">게시글 없음</p>
        ) : (
          <ol className="stream-timeline-list">
            {items.map((item, index) => {
              const eventText =
                item.card.title ||
                item.card.content.replace(item.dateText, "").trim() ||
                item.card.content.slice(0, 48);
              return (
                <li
                  key={`${item.card.id}:${item.dateText}`}
                  className={index % 2 === 0 ? "is-above" : "is-below"}
                >
                  <span className="stream-timeline-stem" aria-hidden="true" />
                  <span className="stream-timeline-node" aria-hidden="true" />
                  <article className="stream-timeline-event">
                    <time>{item.dateText}</time>
                    <span>{eventText}</span>
                    {(canEditCard?.(item.card) ?? false) && onEditCard && (
                      <button
                        type="button"
                        className="stream-template-inline-edit"
                        onClick={() => onEditCard(item.card)}
                      >
                        수정
                      </button>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {canEdit && (
        <TimelineEntryForm onCreateCard={onCreateCard} />
      )}
    </div>
  );
}

function WindowCellComposer({
  label,
  onCreateCard,
}: {
  label: string;
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  return (
    <QuickTextForm
      className="stream-window-cell-input"
      placeholder="입력"
      submitLabel="등록"
      onSubmit={(content) => onCreateCard({ title: label, content })}
    />
  );
}

function TimelineEntryForm({
  onCreateCard,
}: {
  onCreateCard: (data: { title: string; content: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = content.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || !trimmed || busy) return;
    setBusy(true);
    try {
      await onCreateCard({ title: trimmed, content: date });
      setContent("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stream-timeline-input" onSubmit={submit}>
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        disabled={busy}
        aria-label="날짜"
      />
      <input
        type="text"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="내용"
        disabled={busy}
        aria-label="연표 내용"
      />
      <button type="submit" disabled={!date || !trimmed || busy}>
        추가
      </button>
    </form>
  );
}

function QuickTextForm({
  className,
  placeholder,
  submitLabel,
  normalizeInput,
  successMessage,
  errorMessage,
  onSubmit,
}: {
  className: string;
  placeholder: string;
  submitLabel: string;
  normalizeInput?: (value: string) => string;
  successMessage?: string;
  errorMessage?: string;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const trimmed = content.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus("idle");
    try {
      await onSubmit(normalizeInput ? normalizeInput(trimmed).trim() : trimmed);
      setContent("");
      setStatus("success");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={className} onSubmit={submit}>
      <div className="quick-text-form-row">
        <input
          type="text"
          value={content}
          onChange={(event) => {
            setStatus("idle");
            setContent(normalizeInput ? normalizeInput(event.target.value) : event.target.value);
          }}
          placeholder={placeholder}
          disabled={busy}
        />
        <button type="submit" disabled={!trimmed || busy}>
          {submitLabel}
        </button>
      </div>
      {(successMessage || errorMessage) && (
        <p className={`quick-text-form-status is-${status}`} aria-live="polite">
          {status === "success"
            ? successMessage
            : status === "error"
              ? errorMessage
              : "\u00a0"}
        </p>
      )}
    </form>
  );
}
