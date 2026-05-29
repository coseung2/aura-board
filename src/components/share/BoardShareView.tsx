"use client";

/**
 * BoardShareView — Public board renderer with permission-based UI.
 *
 * - "view" mode:  read-only (as before).
 * - "comment" mode: read-only + 댓글 작성 (익명 이름 + 댓글 입력).
 * - "edit" mode:   full read-write (카드 추가 + 댓글).
 *
 * 익명 이름은 localStorage에 저장되어 재방문 시 자동 복원된다.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CardBody } from "@/components/cards/CardBody";
import { layoutLabel } from "@/lib/layout-meta";
import type { CardData } from "@/components/DraggableCard";
import "./share-view.css";

type SharedBoard = {
  id: string;
  title: string;
  layout: string;
  description: string;
};

type SharedCard = CardData;

type SharedSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  sortMode: string | null;
  accessToken: string | null;
};

type ShareMode = "view" | "comment" | "edit";

type Props = {
  board: SharedBoard;
  initialCards: SharedCard[];
  initialSections: SharedSection[];
  shareMode: ShareMode;
  shareToken: string;
};

const NAME_STORAGE_KEY = "aura_share_name";

function commentApiPath(cardId: string) {
  return `/api/share/cards/${cardId}/comments`;
}

const SHARE_MODE_LABELS: Record<ShareMode, string> = {
  view: "읽기 전용",
  comment: "댓글 쓰기",
  edit: "편집 가능",
};

// ─── 댓글 아이템 ───
type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  authorKind: string;
  authorLabel: string;
  canDelete: boolean;
};

// ─── 카드별 댓글 섹션 ───
function CardCommentSection({
  cardId,
  shareToken,
  authorName,
}: {
  cardId: string;
  shareToken: string;
  authorName: string;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    try {
      const r = await fetch(commentApiPath(cardId), {
        cache: "no-store",
        headers: { "x-share-token": shareToken },
      });
      if (r.ok) {
        const j = (await r.json()) as { items: CommentItem[] };
        setComments(j.items);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [cardId, shareToken]);

  useEffect(() => { void fetchComments(); }, [fetchComments]);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const r = await fetch(commentApiPath(cardId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shareToken,
          content: trimmed,
          authorName: authorName || "익명",
        }),
      });
      if (r.ok) {
        setText("");
        void fetchComments();
      }
    } catch { /* ignore */ }
    setSending(false);
  }, [text, sending, cardId, shareToken, authorName, fetchComments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit]
  );

  return (
    <div className="share-comment-section">
      {loading ? (
        <p className="share-comment-loading">댓글 불러오는 중…</p>
      ) : comments.length > 0 ? (
        <div className="share-comment-list">
          {comments.map((c) => (
            <div key={c.id} className="share-comment-item">
              <span className="share-comment-author">{c.authorLabel}</span>
              <span className="share-comment-text">{c.content}</span>
              <span className="share-comment-time">
                {new Date(c.createdAt).toLocaleDateString("ko-KR")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {authorName && (
        <div className="share-comment-input-row">
          <input
            type="text"
            className="share-comment-input"
            placeholder="댓글 쓰기…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            maxLength={1000}
          />
          <button
            type="button"
            className="share-comment-send"
            onClick={submit}
            disabled={!text.trim() || sending}
          >
            {sending ? "…" : "전송"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 메인 뷰 ───
export function BoardShareView({
  board,
  initialCards,
  initialSections,
  shareMode,
  shareToken,
}: Props) {
  const [cards, setCards] = useState<SharedCard[]>(initialCards);
  const [authorName, setAuthorName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addSectionId, setAddSectionId] = useState(initialSections[0]?.id ?? "");
  const [addSending, setAddSending] = useState(false);
  const [addErr, setAddErr] = useState("");

  const canComment = shareMode === "comment" || shareMode === "edit";
  const canEdit = shareMode === "edit";

  // localStorage에서 이름 복원
  useEffect(() => {
    const stored = localStorage.getItem(NAME_STORAGE_KEY);
    if (stored) setAuthorName(stored);
    setNameDirty(true);
  }, []);

  const handleNameChange = useCallback((val: string) => {
    setAuthorName(val);
    localStorage.setItem(NAME_STORAGE_KEY, val);
  }, []);

  // 새 카드 생성 (edit mode)
  const createCard = useCallback(async () => {
    if (!addTitle.trim() || addSending) return;
    setAddSending(true);
    setAddErr("");
    try {
      const r = await fetch("/api/share/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shareToken,
          boardId: board.id,
          title: addTitle.trim(),
          content: addContent.trim(),
          sectionId: addSectionId || null,
          authorName: authorName || "익명",
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { card: SharedCard };
        setCards((prev) => [...prev, j.card]);
        setAddTitle("");
        setAddContent("");
        setShowAddForm(false);
      } else {
        const j = await r.json().catch(() => ({}));
        setAddErr((j as any).error ?? "카드 생성 실패");
      }
    } catch {
      setAddErr("네트워크 오류");
    }
    setAddSending(false);
  }, [addTitle, addContent, addSectionId, addSending, shareToken, board.id, authorName]);

  // 카드 섹션 그룹핑
  const sectionCards = new Map<string, SharedCard[]>();
  const unassigned: SharedCard[] = [];
  for (const c of cards) {
    if (c.sectionId) {
      const list = sectionCards.get(c.sectionId) ?? [];
      list.push(c);
      sectionCards.set(c.sectionId, list);
    } else {
      unassigned.push(c);
    }
  }

  const isColumns = board.layout === "columns" && initialSections.length > 0;
  const modeTag = SHARE_MODE_LABELS[shareMode] ?? shareMode;

  return (
    <main className="share-page">
      <header className="share-header">
        <div className="share-header-left">
          <Link href="/" className="share-home-link">
            ← Aura Board
          </Link>
          <h1 className="share-title">{board.title}</h1>
          <span className="share-layout-badge">
            {layoutLabel(board.layout)}
          </span>
          <span className="share-mode-badge">{modeTag}</span>
        </div>
        {board.description && (
          <p className="share-desc">{board.description}</p>
        )}
      </header>

      {/* 익명 이름 입력 (comment/edit 모드) */}
      {canComment && nameDirty && (
        <div className="share-name-bar">
          <label className="share-name-label">
            표시 이름:
            <input
              type="text"
              className="share-name-input"
              placeholder="이름을 입력하세요"
              value={authorName}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={60}
            />
          </label>
          <span className="share-name-hint">
            {authorName
              ? `${authorName}(으)로 활동합니다`
              : "이름을 입력해야 댓글/카드를 작성할 수 있어요"}
          </span>
        </div>
      )}

      {/* 새 카드 추가 (edit mode) */}
      {canEdit && (
        <div className="share-add-card-bar">
          {!showAddForm ? (
            <button
              type="button"
              className="share-add-card-btn"
              onClick={() => setShowAddForm(true)}
            >
              + 카드 추가
            </button>
          ) : (
            <div className="share-add-card-form">
              <input
                type="text"
                className="share-add-card-input"
                placeholder="제목"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                maxLength={200}
              />
              <textarea
                className="share-add-card-textarea"
                placeholder="내용 (선택)"
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                rows={3}
                maxLength={5000}
              />
              {initialSections.length > 0 && (
                <select
                  className="share-add-card-select"
                  value={addSectionId}
                  onChange={(e) => setAddSectionId(e.target.value)}
                >
                  {initialSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              {addErr && <p className="share-add-card-err">{addErr}</p>}
              <div className="share-add-card-actions">
                <button
                  type="button"
                  className="share-add-card-cancel"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddErr("");
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="share-add-card-submit"
                  onClick={createCard}
                  disabled={!addTitle.trim() || addSending}
                >
                  {addSending ? "생성 중…" : "추가"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="share-body">
        {isColumns ? (
          <div className="share-columns">
            {initialSections.map((section) => {
              const secCards = sectionCards.get(section.id) ?? [];
              return (
                <section key={section.id} className="share-section">
                  <h2 className="share-section-title">{section.title}</h2>
                  <div className="share-card-list">
                    {secCards.map((card) => (
                      <article key={card.id} className="share-card">
                        <CardBody card={card} showEngagement={false} />
                        {canComment && card.id && (
                          <CardCommentSection
                            cardId={card.id}
                            shareToken={shareToken}
                            authorName={authorName}
                          />
                        )}
                      </article>
                    ))}
                    {secCards.length === 0 && (
                      <p className="share-empty">카드가 없어요</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : board.layout === "grid" ? (
          <div className="share-grid">
            {cards.map((card) => (
              <article key={card.id} className="share-card">
                <CardBody card={card} showEngagement={false} />
                {canComment && card.id && (
                  <CardCommentSection
                    cardId={card.id}
                    shareToken={shareToken}
                    authorName={authorName}
                  />
                )}
              </article>
            ))}
            {cards.length === 0 && (
              <p className="share-empty">카드가 없어요</p>
            )}
          </div>
        ) : board.layout === "stream" ? (
          <div className="share-stream">
            {cards.map((card) => (
              <article key={card.id} className="share-card">
                <CardBody card={card} showEngagement={false} />
                {canComment && card.id && (
                  <CardCommentSection
                    cardId={card.id}
                    shareToken={shareToken}
                    authorName={authorName}
                  />
                )}
              </article>
            ))}
            {cards.length === 0 && (
              <p className="share-empty">카드가 없어요</p>
            )}
          </div>
        ) : (
          <div className="share-list">
            {cards.map((card) => (
              <article key={card.id} className="share-card">
                <CardBody card={card} showEngagement={false} />
                {canComment && card.id && (
                  <CardCommentSection
                    cardId={card.id}
                    shareToken={shareToken}
                    authorName={authorName}
                  />
                )}
              </article>
            ))}
            {cards.length === 0 && (
              <p className="share-empty">카드가 없어요</p>
            )}
          </div>
        )}
      </div>

      <footer className="share-footer">
        <p>
          이 보드는 <strong>{board.title}</strong>의 공유 보기입니다.
          Aura Board로 제작되었습니다.
        </p>
      </footer>
    </main>
  );
}
