"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem, FeedPage, FeedPoolItem } from "@/lib/feed/types";
import { FeedComposer, type FeedDraft } from "./FeedComposer";
import { FeedList } from "./FeedList";
import { FeedPostCard } from "./FeedPostCard";

type Classroom = { id: string; name: string };
type ViewMode = "classroom" | "global" | "pool";
type Props = { classrooms: Classroom[]; initialView?: ViewMode };

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    if (body.error === "invalid_media") return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    if (body.error === "invalid_payload") return "게시물 내용을 확인해 주세요.";
    if (body.error === "forbidden") return "이 학급에 게시할 권한이 없어요.";
    if (body.error === "pool_post_not_found") return "공유 풀에서 더 이상 사용할 수 없는 게시물이에요.";
  }
  return fallback;
}

export function TeacherFeedHub({ classrooms, initialView = "classroom" }: Props) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [poolItems, setPoolItems] = useState<FeedPoolItem[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>(() => classrooms[0]?.id ? [classrooms[0].id] : []);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const selectedClassroom = useMemo(
    () => classrooms.find((classroom) => classroom.id === classroomId) ?? null,
    [classroomId, classrooms],
  );

  const loadTimeline = useCallback(async (
    nextView: Exclude<ViewMode, "pool">,
    nextClassroomId: string,
    cursor?: string | null,
  ) => {
    if (nextView === "classroom" && !nextClassroomId) {
      setItems([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    const append = Boolean(cursor);
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: nextView, limit: "20" });
      if (nextView === "classroom") params.set("classroomId", nextClassroomId);
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/teacher/feed?${params.toString()}`, { headers: { accept: "application/json" } });
      const body = (await response.json().catch(() => null)) as FeedPage | { error?: string } | null;
      if (!response.ok || !body || !("items" in body)) {
        throw new Error(responseError(body, "피드를 불러오지 못했어요."));
      }
      if (requestId !== requestIdRef.current) return;
      setItems((current) => (append ? [...current, ...body.items] : body.items));
      setNextCursor(body.nextCursor);
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "피드를 불러오지 못했어요.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    setPoolError(null);
    try {
      const response = await fetch("/api/teacher/feed/pool", { headers: { accept: "application/json" } });
      const body = (await response.json().catch(() => null)) as { items?: FeedPoolItem[]; error?: string } | null;
      if (!response.ok || !body?.items) throw new Error(responseError(body, "공유 풀을 불러오지 못했어요."));
      setPoolItems(body.items);
    } catch (nextError) {
      setPoolError(nextError instanceof Error ? nextError.message : "공유 풀을 불러오지 못했어요.");
    } finally {
      setPoolLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "pool") {
      void loadPool();
      return;
    }
    setItems([]);
    setNextCursor(null);
    void loadTimeline(view, classroomId);
  }, [classroomId, loadPool, loadTimeline, view]);

  async function createPost(draft: FeedDraft) {
    if (!classroomId) throw new Error("게시할 학급을 먼저 선택해 주세요.");
    const response = await fetch("/api/teacher/feed/posts", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...draft, classroomId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseError(body, "게시물을 저장하지 못했어요."));
    await loadTimeline("classroom", classroomId);
  }

  function toggleTarget(targetId: string) {
    setTargetIds((current) => current.includes(targetId) ? current.filter((id) => id !== targetId) : [...current, targetId]);
    setPublishMessage(null);
  }

  async function publishPoolPost(postId: string) {
    if (targetIds.length === 0) {
      setPoolError("게시할 학급을 하나 이상 선택해 주세요.");
      return;
    }
    setPublishingPostId(postId);
    setPoolError(null);
    setPublishMessage(null);
    try {
      const response = await fetch(`/api/teacher/feed/pool/${encodeURIComponent(postId)}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ classroomIds: targetIds }),
      });
      const body = (await response.json().catch(() => null)) as { published?: number; error?: string } | null;
      if (!response.ok) throw new Error(responseError(body, "학급에 게시하지 못했어요."));
      setPublishMessage(`${body?.published ?? targetIds.length}개 학급에 게시했어요.`);
      if (classroomId && targetIds.includes(classroomId)) void loadTimeline("classroom", classroomId);
    } catch (nextError) {
      setPoolError(nextError instanceof Error ? nextError.message : "학급에 게시하지 못했어요.");
    } finally {
      setPublishingPostId(null);
    }
  }

  return (
    <section className="ab-feed-shell" aria-label="교사 피드">
      <header className="ab-feed-hero ab-feed-hero-teacher">
        <div>
          <p className="ab-feed-eyebrow">AURA FEED</p>
          <h1>학급 피드 운영</h1>
          <p>직접 소식을 올리거나 공유 풀의 게시물을 여러 학급에 배포할 수 있습니다.</p>
        </div>
        {classrooms.length ? (
          <label className="ab-feed-classroom-select">
            <span>현재 학급</span>
            <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
              {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
            </select>
          </label>
        ) : null}
      </header>

      <div className="ab-feed-tabs" role="tablist" aria-label="교사 피드 보기">
        <button type="button" role="tab" aria-selected={view === "classroom"} className={view === "classroom" ? "is-active" : ""} onClick={() => setView("classroom")}>학급 피드</button>
        <button type="button" role="tab" aria-selected={view === "global"} className={view === "global" ? "is-active" : ""} onClick={() => setView("global")}>전체 피드</button>
        <button type="button" role="tab" aria-selected={view === "pool"} className={view === "pool" ? "is-active" : ""} onClick={() => setView("pool")}>공유 풀</button>
      </div>

      {view === "classroom" ? classrooms.length ? (
        <>
          <FeedComposer heading={`${selectedClassroom?.name ?? "학급"}에 새 게시물`} description="학생들이 바로 볼 수 있는 학급 피드 게시물입니다." onSubmit={createPost} />
          <FeedList items={items} loading={loading} loadingMore={loadingMore} error={error} nextCursor={nextCursor} emptyMessage="아직 이 학급에 게시물이 없어요." onRetry={() => void loadTimeline("classroom", classroomId)} onLoadMore={() => void loadTimeline("classroom", classroomId, nextCursor)} />
        </>
      ) : <div className="ab-feed-state">피드를 운영하려면 먼저 학급을 만들어 주세요.</div> : null}

      {view === "global" ? (
        <>
          <div className="ab-feed-global-note">학생들에게 보이는 Aura 전체 피드를 미리 확인할 수 있습니다.</div>
          <FeedList items={items} loading={loading} loadingMore={loadingMore} error={error} nextCursor={nextCursor} emptyMessage="아직 전체 게시물이 없어요." onRetry={() => void loadTimeline("global", classroomId)} onLoadMore={() => void loadTimeline("global", classroomId, nextCursor)} />
        </>
      ) : null}

      {view === "pool" ? (
        <div className="ab-feed-pool">
          <div className="ab-feed-pool-targets">
            <div><h2>배포할 학급</h2><p>선택한 학급들에 같은 원본 게시물을 참조 형태로 게시합니다.</p></div>
            <div className="ab-feed-classroom-checks">
              {classrooms.map((classroom) => (
                <label key={classroom.id}>
                  <input type="checkbox" checked={targetIds.includes(classroom.id)} onChange={() => toggleTarget(classroom.id)} />
                  <span>{classroom.name}</span>
                </label>
              ))}
            </div>
          </div>
          {publishMessage ? <p className="ab-feed-success" role="status">{publishMessage}</p> : null}
          {poolError ? <div className="ab-feed-inline-error" role="alert"><span>{poolError}</span><button type="button" onClick={() => void loadPool()}>다시 시도</button></div> : null}
          {poolLoading && poolItems.length === 0 ? <div className="ab-feed-state">공유 풀을 불러오는 중…</div> : poolItems.length === 0 ? <div className="ab-feed-state">현재 배포 가능한 공유 게시물이 없어요.</div> : (
            <div className="ab-feed-timeline">
              {poolItems.map((item) => (
                <FeedPostCard key={item.postId} item={{ ...item, timestamp: item.createdAt, scopeLabel: "공유 풀" }} actions={(
                  <button className="btn btn-primary" type="button" disabled={publishingPostId !== null || targetIds.length === 0} onClick={() => void publishPoolPost(item.postId)}>
                    {publishingPostId === item.postId ? "게시 중…" : `선택한 ${targetIds.length}개 학급에 게시`}
                  </button>
                )} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
