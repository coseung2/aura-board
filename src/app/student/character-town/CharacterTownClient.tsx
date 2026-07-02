"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/avatar/ErrorState";
import { LoadingState } from "@/components/avatar/LoadingState";
import { ReadingChampionExhibition } from "@/components/avatar/ReadingChampionExhibition";
import { useAvatarMe } from "@/components/avatar/useAvatarMe";
import type { AvatarGalleryResponse } from "@/components/avatar/types";

type GalleryState =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: AvatarGalleryResponse; error: null }
  | { status: "error"; data: null; error: string };

function useAvatarGallery(classroomId: string | null) {
  const [state, setState] = useState<GalleryState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!classroomId) return;
    let cancelled = false;

    async function load() {
      if (!classroomId) return;
      try {
        const res = await fetch(
          `/api/avatar/gallery?classroomId=${encodeURIComponent(classroomId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setState({
              status: "error",
              data: null,
              error:
                typeof body.error === "string"
                  ? body.error
                  : "전시공간 정보를 불러올 수 없어요.",
            });
          }
          return;
        }
        const data = (await res.json()) as AvatarGalleryResponse;
        if (!cancelled) setState({ status: "ok", data, error: null });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: "네트워크 오류가 발생했어요.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  return state;
}

export function CharacterTownClient() {
  const me = useAvatarMe();
  const gallery = useAvatarGallery(me.data?.student.classroomId ?? null);

  if (me.status === "loading") {
    return <LoadingState message="캐릭터 정보를 불러오는 중..." />;
  }
  if (me.status === "error" || !me.data) {
    return (
      <ErrorState
        message={me.error ?? "캐릭터 정보를 불러오지 못했어요."}
        onRetry={me.reload}
      />
    );
  }

  return (
    <main className="character-page character-town-page">
      <div className="character-page-header">
        <div>
          <h1 className="character-page-title">독서왕 전시공간</h1>
          <p className="character-page-subtitle">
            우리 반 친구들의 캐릭터를 번호 순서대로 구경해요.
          </p>
        </div>
        <div className="character-page-actions">
          <Link href="/student/character-room" className="avatar-btn avatar-btn-secondary">
            피팅룸
          </Link>
          <Link href="/student/character-shop" className="avatar-btn avatar-btn-secondary">
            상점
          </Link>
        </div>
      </div>

      {gallery.status === "error" && <ErrorState message={gallery.error} />}

      {gallery.status === "loading" && (
        <LoadingState message="전시공간 정보를 불러오는 중..." />
      )}

      {gallery.status === "ok" && (
        <>
          {gallery.data.students.length === 0 ? (
            <div className="avatar-empty">아직 전시할 친구가 없어요.</div>
          ) : (
            <ReadingChampionExhibition students={gallery.data.students} />
          )}
        </>
      )}
    </main>
  );
}
