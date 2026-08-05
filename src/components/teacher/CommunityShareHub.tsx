"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";
import { CommunityCopyButton } from "./CommunityCopyButton";

type Category = "LESSON" | "PLAY";
type Classroom = { id: string; name: string };

export type CommunityBoardSummary = {
  id: string;
  title: string;
  description: string;
  layout: string;
  category: Category;
  thumbnailMode: string;
  thumbnailUrl: string | null;
  cardCount: number;
  sectionCount: number;
  ownerName: string;
  isOwner: boolean;
  publishedAt: string;
};

export type CommunityOwnedBoard = {
  id: string;
  title: string;
  layout: string;
  category: Category;
  thumbnailMode: string;
  thumbnailUrl: string | null;
  cardCount: number;
  supported: boolean;
  publishedAt: string | null;
};

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

export function CommunityShareHub({
  publishedBoards,
  ownedBoards,
  classrooms,
  initialView,
}: {
  publishedBoards: CommunityBoardSummary[];
  ownedBoards: CommunityOwnedBoard[];
  classrooms: Classroom[];
  initialView: "browse" | "mine";
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | Category>("ALL");
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visiblePublished = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return publishedBoards.filter((board) => {
      if (category !== "ALL" && board.category !== category) return false;
      if (!normalized) return true;
      return `${board.title} ${board.description} ${board.ownerName} ${layoutLabel(board.layout)}`
        .toLocaleLowerCase("ko")
        .includes(normalized);
    });
  }, [category, publishedBoards, query]);

  async function setPublished(boardId: string, published: boolean) {
    if (
      published &&
      !window.confirm(
        "이 보드의 게시물, 첨부파일, 화면에 표시되는 작성자 이름을 다른 선생님이 읽을 수 있게 됩니다. 공유에 게시할까요?",
      )
    ) {
      return;
    }
    setBusyBoardId(boardId);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/share/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error === "unsupported_layout"
            ? "이 보드 형식은 아직 공유할 수 없습니다."
            : "게시 상태를 변경하지 못했습니다.",
        );
      }
      router.refresh();
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "게시 상태를 변경하지 못했습니다.",
      );
    } finally {
      setBusyBoardId(null);
    }
  }

  return (
    <section className="community-hub">
      <div className="community-tabs" role="tablist" aria-label="공유 보드 보기">
        <button
          type="button"
          role="tab"
          aria-selected={view === "browse"}
          className={view === "browse" ? "is-active" : ""}
          onClick={() => setView("browse")}
        >
          둘러보기 <span>{publishedBoards.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "mine"}
          className={view === "mine" ? "is-active" : ""}
          onClick={() => setView("mine")}
        >
          내 게시 관리 <span>{ownedBoards.length}</span>
        </button>
      </div>

      {error ? <p className="community-error" role="alert">{error}</p> : null}

      {view === "browse" ? (
        <>
          <div className="community-toolbar">
            <label className="community-search">
              <span className="sr-only">공유 보드 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="보드, 선생님, 형식 검색"
              />
            </label>
            <div className="community-filter" role="group" aria-label="보드 구분">
              {(["ALL", "LESSON", "PLAY"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={category === value ? "is-active" : ""}
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                >
                  {value === "ALL" ? "전체" : value === "LESSON" ? "수업" : "놀이"}
                </button>
              ))}
            </div>
          </div>

          {visiblePublished.length === 0 ? (
            <div className="community-empty">
              <h2>{publishedBoards.length === 0 ? "아직 게시된 보드가 없습니다" : "검색 결과가 없습니다"}</h2>
              <p>{publishedBoards.length === 0 ? "내 게시 관리에서 첫 보드를 공유해 보세요." : "검색어나 필터를 바꿔 보세요."}</p>
            </div>
          ) : (
            <div className="community-card-grid">
              {visiblePublished.map((board) => {
                const thumbnail =
                  board.thumbnailMode === "custom" && board.thumbnailUrl
                    ? board.thumbnailUrl
                    : layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL;
                return (
                  <article key={board.id} className="community-card">
                    <Link href={`/teacher/share/${board.id}`} className="community-card-link">
                      <img src={thumbnail} alt="" className="community-card-image" />
                      <div className="community-card-body">
                        <div className="community-card-badges">
                          <span>{board.category === "LESSON" ? "수업" : "놀이"}</span>
                          <span>{layoutLabel(board.layout)}</span>
                        </div>
                        <h2>{board.title || "제목 없는 보드"}</h2>
                        <p className="community-card-description">
                          {board.description || "보드 설명이 없습니다."}
                        </p>
                        <p className="community-card-meta">
                          {board.ownerName} · 게시물 {board.cardCount}개 · 주제 {board.sectionCount}개
                        </p>
                      </div>
                    </Link>
                    <div className="community-card-actions">
                      <Link href={`/teacher/share/${board.id}`}>결과물 보기</Link>
                      <CommunityCopyButton boardId={board.id} classrooms={classrooms} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="community-manage-grid">
          {ownedBoards.map((board) => {
            const thumbnail =
              board.thumbnailMode === "custom" && board.thumbnailUrl
                ? board.thumbnailUrl
                : layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL;
            return (
              <article key={board.id} className="community-manage-card">
                <img src={thumbnail} alt="" />
                <div className="community-manage-info">
                  <div>
                    <span className={`community-status ${board.publishedAt ? "is-published" : ""}`}>
                      {board.publishedAt ? "게시 중" : "비공개"}
                    </span>
                    <h2>{board.title || "제목 없는 보드"}</h2>
                    <p>{layoutLabel(board.layout)} · 게시물 {board.cardCount}개</p>
                  </div>
                  {board.supported ? (
                    <button
                      type="button"
                      className={board.publishedAt ? "community-secondary-action" : "community-primary-action"}
                      onClick={() => void setPublished(board.id, !board.publishedAt)}
                      disabled={busyBoardId === board.id}
                    >
                      {busyBoardId === board.id
                        ? "변경 중…"
                        : board.publishedAt
                          ? "게시 취소"
                          : "공유에 게시"}
                    </button>
                  ) : (
                    <span className="community-unsupported">이 형식은 준비 중</span>
                  )}
                </div>
              </article>
            );
          })}
          {ownedBoards.length === 0 ? (
            <div className="community-empty">
              <h2>게시할 보드가 없습니다</h2>
              <p>대시보드에서 보드를 먼저 만들어 주세요.</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
