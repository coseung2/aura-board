"use client";

import type { AvatarGalleryResponse } from "./types";

export async function fetchAvatarGallery(
  classroomId: string,
): Promise<AvatarGalleryResponse> {
  const res = await fetch(
    `/api/avatar/gallery?classroomId=${encodeURIComponent(classroomId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : "전시 공간을 불러오지 못했습니다.");
  }
  return (await res.json()) as AvatarGalleryResponse;
}
