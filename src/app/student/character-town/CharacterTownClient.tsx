"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/avatar/ErrorState";
import { LoadingState } from "@/components/avatar/LoadingState";
import { useAvatarMe } from "@/components/avatar/useAvatarMe";
import type { AvatarGalleryResponse } from "@/components/avatar/types";

type GalleryState =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: AvatarGalleryResponse; error: null }
  | { status: "error"; data: null; error: string };

type TownStyle = CSSProperties & Record<string, string | number>;

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 2;
const DEFAULT_VISIBLE_FLOORS = 7;

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

function spriteStyle(row: number, frame: number): TownStyle {
  return {
    "--avatar-sprite-position-x": `${(frame / (SPRITE_COLUMNS - 1)) * 100}%`,
    "--avatar-sprite-position-y": `${(row / (SPRITE_ROWS - 1)) * 100}%`,
  };
}

function ExhibitionFloor({
  students,
  floorIndex,
}: {
  students: AvatarGalleryResponse["students"];
  floorIndex: number;
}) {
  return (
    <div
      className="character-town-floor"
      style={{ "--floor-index": floorIndex } as TownStyle}
    >
      {students.map((student, index) => {
        const visible = student.galleryVisible;
        const number = student.number ?? floorIndex * 4 + index + 1;
        const spriteRow = number % 2 === 0 ? 1 : 0;
        const spriteFrame =
          index === 3 ? 7 : index === 2 ? 5 : index === 1 ? 1 : 0;

        return (
          <div
            key={student.id}
            className={`character-town-resident${visible ? "" : " is-hidden"}`}
            style={{ "--resident-slot": index } as TownStyle}
            role="listitem"
          >
            <div className="character-town-avatar-wrap">
              {visible ? (
                <span
                  className="character-town-sprite"
                  style={spriteStyle(spriteRow, spriteFrame)}
                  role="img"
                  aria-label={`${student.name} 아바타`}
                />
              ) : (
                <div className="character-town-hidden" aria-label="비공개 캐릭터">
                  <span>?</span>
                </div>
              )}
            </div>
            <span className="character-town-name">
              {student.number !== null ? `${student.number}번 ` : ""}
              {student.name}
            </span>
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
    const perFloor = 4;
    const result: AvatarGalleryResponse["students"][] = [];
    for (let i = 0; i < students.length; i += perFloor) {
      result.push(students.slice(i, i + perFloor));
    }
    return result;
  }, [gallery]);

  const floors = useMemo(() => {
    const floorCount = Math.max(rows.length, DEFAULT_VISIBLE_FLOORS);
    return Array.from({ length: floorCount }, (_, index) => rows[index] ?? []);
  }, [rows]);

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
          {rows.length === 0 ? (
            <div className="avatar-empty">아직 전시할 친구가 없어요.</div>
          ) : (
            <div className="character-town-map" aria-label="우리 반 독서왕 전시공간">
              <div className="character-town-map-scroll">
                <div
                  className="character-town-ground"
                  role="list"
                  aria-label="우리 반 독서왕 전시공간"
                  style={{ "--floor-count": floors.length } as TownStyle}
                >
                  {floors.map((floorStudents, index) => (
                    <ExhibitionFloor
                      key={index}
                      students={floorStudents}
                      floorIndex={index}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
