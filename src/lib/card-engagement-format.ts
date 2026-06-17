// card-comments-likes (2026-04-26): 작성자 표시 라벨 포매터.
// shared (server + client) — server-only deps 없음.

import { normalizeDbTimestamp } from "./db-timestamp";

export type AuthorKind = "teacher" | "student" | "external";

export function formatEngagementAuthor(opts: {
  kind: AuthorKind;
  name: string;
  anonymous: boolean;
}): string {
  if (opts.kind === "external") return opts.name.trim() || "익명 방문자";
  if (opts.anonymous) return "익명";
  if (opts.kind === "teacher") {
    const trimmed = opts.name.trim();
    return trimmed ? `${trimmed} 선생님` : "선생님";
  }
  return opts.name.trim() || "학생";
}

export function formatRelativeTime(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(normalizeDbTimestamp(iso)) : iso;
  const diffMin = Math.floor((Date.now() - t.getTime()) / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hr = Math.floor(diffMin / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return t.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
