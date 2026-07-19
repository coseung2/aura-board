"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import type { ChildRow } from "./ParentChildSelector";
import type { ParentPendingLink } from "./ParentPendingLinks";
import { ParentPendingLinks } from "./ParentPendingLinks";
import { buildFallbackBackground, getPostImage } from "./ParentPostCard";
import { ParentPostsError } from "./ParentFeed";
import { useParentPosts } from "./useParentPosts";

type Props = {
  children: ChildRow[];
  initialSelectedId: string;
  pendingLinks?: ParentPendingLink[];
};

export function ParentHomeGrid({
  children: childRows,
  initialSelectedId,
  pendingLinks = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("kind") === "text" ? "text" : "media";
  const selectedId = searchParams.get("child") ?? initialSelectedId;
  const selected = childRows.find((child) => child.studentId === selectedId) ?? childRows[0];
  const endpoint = selected
    ? `/api/parent/children/${encodeURIComponent(selected.studentId)}/posts?kind=${category}`
    : `/api/parent/feed?kind=${category}`;
  const { data, error, loading, loadingMore, loadMore, retry } = useParentPosts(endpoint);

  function selectChild(studentId: string) {
    if (studentId === selected?.studentId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", studentId);
    params.delete("error");
    router.push(`/parent/home?${params.toString()}`, { scroll: false });
  }

  function selectCategory(nextCategory: "media" | "text") {
    if (nextCategory === category) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("kind", nextCategory);
    router.push(`/parent/home?${params.toString()}`, { scroll: false });
  }

  if (!selected) {
    return (
      <main className="parent-home-page">
        <ParentPendingLinks links={pendingLinks} />
        <div className="parent-feed-empty">
          <span aria-hidden>+</span>
          <h1>연결된 자녀가 없어요</h1>
          <p>자녀를 연결하면 교실에서 만든 게시물을 확인할 수 있어요.</p>
          <Link href="/parent/onboard/match/code">자녀 연결하기</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="parent-home-page">
      <header className="parent-home-header">
        <div>
          <p>자녀별 보기</p>
          <h1>홈</h1>
        </div>
        <nav className="parent-home-utilities" aria-label="학부모 계정 메뉴">
          <Link href="/parent/onboard/match/code">자녀 추가</Link>
          <Link href="/parent/account">계정</Link>
        </nav>
      </header>

      <div className="parent-child-tabs" role="tablist" aria-label="자녀 프로필">
        {childRows.map((child) => {
          const isSelected = child.studentId === selected.studentId;
          return (
            <button
              key={child.studentId}
              type="button"
              id={`parent-child-tab-${child.studentId}`}
              className={`parent-child-tab${isSelected ? " is-selected" : ""}`}
              role="tab"
              aria-selected={isSelected}
              aria-controls="parent-child-posts"
              onClick={() => selectChild(child.studentId)}
            >
              <span className="parent-child-tab-avatar" aria-hidden>
                {child.studentName.trim().slice(0, 1) || "아"}
              </span>
              <span>
                <strong>{child.studentName}</strong>
                <small>{child.classroomName}{child.studentNumber != null ? ` · ${child.studentNumber}번` : ""}</small>
              </span>
            </button>
          );
        })}
      </div>

      <ParentPendingLinks links={pendingLinks} compact />

      <div className="parent-home-category-tabs" role="tablist" aria-label="게시물 종류">
        <button
          type="button"
          id="parent-kind-tab-media"
          role="tab"
          aria-selected={category === "media"}
          aria-controls="parent-child-posts"
          className={category === "media" ? "is-selected" : undefined}
          onClick={() => selectCategory("media")}
        >
          미디어
        </button>
        <button
          type="button"
          id="parent-kind-tab-text"
          role="tab"
          aria-selected={category === "text"}
          aria-controls="parent-child-posts"
          className={category === "text" ? "is-selected" : undefined}
          onClick={() => selectCategory("text")}
        >
          텍스트
        </button>
      </div>

      <section
        id="parent-child-posts"
        className="parent-home-content"
        role="tabpanel"
        aria-labelledby={`parent-child-tab-${selected.studentId} parent-kind-tab-${category}`}
      >
        <div className="parent-home-content-head">
          <div>
            <h2>{selected.studentName}</h2>
            <p>{selected.classroomName}의 게시물</p>
          </div>
          {!loading && !error ? <span>{data?.items.length ?? 0}{data?.nextCursor ? "+" : ""}개</span> : null}
        </div>

        {loading ? <ParentHomeSkeleton /> : error ? (
          <ParentPostsError error={error} retry={retry} />
        ) : data?.items.length ? (
          <>
            <div className={`parent-home-grid is-${category}`}>
              {data.items.map((post) => (
                <ParentHomeGridItem key={post.id} post={post} category={category} />
              ))}
            </div>
            {data.nextCursor ? (
              <button type="button" className="parent-home-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "불러오는 중…" : "게시물 더 보기"}
              </button>
            ) : <p className="parent-feed-end">모든 게시물을 확인했어요</p>}
          </>
        ) : (
          <div className="parent-feed-empty parent-home-empty">
            <span aria-hidden>□</span>
            <h2>아직 게시물이 없어요</h2>
            <p>{selected.studentName}의 {category === "media" ? "미디어" : "텍스트"} 게시물이 생기면 여기에 표시돼요.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ParentHomeGridItem({
  post,
  category,
}: {
  post: ParentPostDTO;
  category: "media" | "text";
}) {
  const imageUrl = getPostImage(post);
  return (
    <Link
      href={`/parent/feed?post=${encodeURIComponent(post.id)}`}
      className={`parent-home-grid-item is-${category}`}
      aria-label={`${post.title || "게시물"} 피드에서 보기`}
    >
      {category === "media" && imageUrl ? (
        <Image src={imageUrl} alt="" fill sizes="(max-width: 600px) 33vw, 280px" unoptimized />
      ) : (
        <span className="parent-home-grid-fallback" style={{ background: buildFallbackBackground(post.color) }}>
          {post.title || post.content || "교실 기록"}
        </span>
      )}
      <span className="parent-home-grid-overlay">
        <strong>{post.title || "교실 기록"}</strong>
        <small>{new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(post.createdAt))}</small>
      </span>
    </Link>
  );
}

function ParentHomeSkeleton() {
  return (
    <div className="parent-home-grid" aria-label="게시물 불러오는 중" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="parent-home-grid-item parent-home-grid-skeleton" />
      ))}
    </div>
  );
}
