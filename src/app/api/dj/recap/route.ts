// DJ 월말 리캡 집계.
// GET /api/dj/recap?boardId=<slug-or-id>&month=YYYY-MM (또는 "current")
// - 교사 or 학생 누구나 읽기 허용 (학생도 리캡 열람)
// - 학생은 자기 학급 보드만 접근 가능, 타 학급 접근은 403
//
// 응답:
//   { period: {from, to}, totals, topSongs[], topSubmitters[], byDay[],
//     spotlight: { topSong, topSubmitter } }

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";

export const runtime = "nodejs";

type SongGroup = {
  key: string; // videoId || normalized title
  title: string;
  linkImage: string | null;
  linkUrl: string | null;
  videoId: string | null;
  plays: number;
  firstSubmitter: string | null;
};

type SubmitterGroup = {
  id: string | null;
  name: string;
  plays: number;
  uniqueSongs: number;
};

function parseMonth(raw: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-based
  if (raw && raw !== "current") {
    const m = raw.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      year = parseInt(m[1]!, 10);
      month = Math.max(0, Math.min(11, parseInt(m[2]!, 10) - 1));
    }
  }
  const from = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  // month+1 day 0 = last day of current month
  const to = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { from, to, label };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardIdOrSlug = url.searchParams.get("boardId");
  const monthRaw = url.searchParams.get("month");
  if (!boardIdOrSlug) {
    return NextResponse.json({ error: "boardId 필수" }, { status: 400 });
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      classroomId: true,
      title: true,
      layout: true,
      anonymousAuthor: true,
    },
  });
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 학생은 자기 학급 보드만. 교사는 getEffectiveBoardRole 기반 access.
  if (user) {
    const role = await getEffectiveBoardRole(board.id, { userId: user.id });
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (student && board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { from, to, label } = parseMonth(monthRaw);

  const events = await db.djPlayEvent.findMany({
    where: {
      boardId: board.id,
      playedAt: { gte: from, lt: to },
    },
    orderBy: { playedAt: "asc" },
    select: {
      id: true,
      title: true,
      linkUrl: true,
      linkImage: true,
      videoId: true,
      submitterName: true,
      submitterId: true,
      submitterKind: true,
      durationSec: true,
      playedAt: true,
    },
  });

  // ── 집계 ──
  const songBy = new Map<string, SongGroup>();
  const submitterBy = new Map<string, SubmitterGroup & { songKeys: Set<string> }>();
  const byDay = new Map<string, number>();
  let totalPlays = 0;
  let totalSeconds = 0;

  for (const ev of events) {
    totalPlays += 1;
    if (ev.durationSec) totalSeconds += ev.durationSec;

    // Song key — videoId 우선, 없으면 normalized title.
    const key = ev.videoId ?? ev.title.trim().toLowerCase();
    if (!songBy.has(key)) {
      songBy.set(key, {
        key,
        title: ev.title,
        linkImage: ev.linkImage,
        linkUrl: ev.linkUrl,
        videoId: ev.videoId,
        plays: 0,
        firstSubmitter: ev.submitterName ?? null,
      });
    }
    songBy.get(key)!.plays += 1;

    // Submitter — name 기준(학생 이름이 주 집계 단위). id 도 참고.
    const subName = ev.submitterName?.trim();
    if (subName) {
      const subKey = ev.submitterId ?? subName;
      if (!submitterBy.has(subKey)) {
        submitterBy.set(subKey, {
          id: ev.submitterId ?? null,
          name: subName,
          plays: 0,
          uniqueSongs: 0,
          songKeys: new Set(),
        });
      }
      const s = submitterBy.get(subKey)!;
      s.plays += 1;
      s.songKeys.add(key);
    }

    // By day — 로컬 날짜가 아닌 UTC 기준 YYYY-MM-DD. 한국(+9) 기준 자정 경계는
    // 추후 필요 시 서버에서 KST offset 적용 — 현 단계는 UTC 로 일관성 유지.
    const dayKey = ev.playedAt.toISOString().slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }

  const topSongs = [...songBy.values()]
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))
    .slice(0, 10);

  const topSubmitters: SubmitterGroup[] = [...submitterBy.values()]
    .map(({ songKeys, ...rest }) => ({
      ...rest,
      uniqueSongs: songKeys.size,
    }))
    .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))
    .slice(0, 10);

  const submittersHidden = board.anonymousAuthor;
  const safeTopSongs = submittersHidden
    ? topSongs.map((song) => ({
        ...song,
        firstSubmitter: song.firstSubmitter ? "익명" : null,
      }))
    : topSongs;
  const safeTopSubmitters = submittersHidden ? [] : topSubmitters;

  const byDayArr = (() => {
    const out: Array<{ date: string; plays: number }> = [];
    // month 전체 범위를 채워서 sparkline 공백 없게.
    for (
      let d = new Date(from);
      d < to;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
    ) {
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, plays: byDay.get(key) ?? 0 });
    }
    return out;
  })();

  return NextResponse.json({
    board: { id: board.id, title: board.title },
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label,
    },
    totals: {
      plays: totalPlays,
      uniqueSongs: songBy.size,
      uniqueSubmitters: submitterBy.size,
      totalMinutes: Math.round(totalSeconds / 60),
    },
    topSongs: safeTopSongs,
    topSubmitters: safeTopSubmitters,
    submittersHidden,
    byDay: byDayArr,
    spotlight: {
      topSong: safeTopSongs[0] ?? null,
      topSubmitter: safeTopSubmitters[0] ?? null,
    },
  });
}
