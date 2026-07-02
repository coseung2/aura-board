"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CharacterAvatar } from "@/components/avatar/CharacterAvatar";
import { ErrorState } from "@/components/avatar/ErrorState";
import { LoadingState } from "@/components/avatar/LoadingState";
import { useAvatarMe } from "@/components/avatar/useAvatarMe";
import type { AvatarGalleryResponse, AvatarItem } from "@/components/avatar/types";

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
        const res = await fetch(`/api/avatar/gallery?classroomId=${encodeURIComponent(classroomId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setState({
              status: "error",
              data: null,
              error: typeof body.error === "string" ? body.error : "마을 정보를 불러올 수 없어요",
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
            error: "네트워크 오류가 발생했어요",
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

function TownRow({ students, items }: { students: AvatarGalleryResponse["students"]; items: AvatarItem[] }) {
  return (
    <div className="character-town-row">
      {students.map((student) => {
        const visible = student.galleryVisible;
        return (
          <div
            key={student.id}
            className={`character-town-resident${visible ? "" : " is-hidden"}`}
          >
            <div className="character-town-avatar-wrap">
              {visible ? (
                <CharacterAvatar
                  items={items}
                  equipped={student.equipped}
                  size={80}
                  ariaLabel={`${student.name} 캐릭터`}
                />
              ) : (
                <div className="character-town-hidden" aria-label="비공개 캐릭터">
                  <span>?</span>
                </div>
              )}
            </div>
            <span className="character-town-name">{student.name}</span>
            {student.number !== null && (
              <span className="character-town-number">{student.number}번</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CharacterTownClient() {
  const me = useAvatarMe();
  const gallery = useAvatarGallery(me.data?.student.classroomId ?? null);

  const rows = useMemo(() => {
    if (gallery.status !== "ok" || !gallery.data) return [];
    const students = gallery.data.students;
    const perRow = 6;
    const result: AvatarGalleryResponse["students"][] = [];
    for (let i = 0; i < students.length; i += perRow) {
      result.push(students.slice(i, i + perRow));
    }
    return result;
  }, [gallery]);

  if (me.status === "loading") return <LoadingState message="내 정보를 불러오는 중…" />;
  if (me.status === "error" || !me.data) return <ErrorState message={me.error ?? "불러오지 못했어요"} onRetry={me.reload} />;

  return (
    <main className="character-page character-town-page">
      <div className="character-page-header">
        <div>
          <h1 className="character-page-title">마을</h1>
          <p className="character-page-subtitle">우리 반 친구들의 캐릭터를 구경해요</p>
        </div>
        <div className="character-page-actions">
          <Link href="/student/character-room" className="avatar-btn avatar-btn-secondary">
            피팅룸 가기
          </Link>
          <Link href="/student/character-shop" className="avatar-btn avatar-btn-secondary">
            상점 가기
          </Link>
        </div>
      </div>

      {gallery.status === "error" && (
        <ErrorState message={gallery.error} />
      )}

      {gallery.status === "loading" && <LoadingState message="마을 정보를 불러오는 중…" />}

      {gallery.status === "ok" && (
        <>
          {rows.length === 0 ? (
            <div className="avatar-empty">아직 마을에 친구들이 없어요.</div>
          ) : (
            <div className="character-town-ground" role="list" aria-label="우리 반 캐릭터 목록">
              {rows.map((row, index) => (
                <TownRow key={index} students={row} items={me.data?.items ?? []} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
