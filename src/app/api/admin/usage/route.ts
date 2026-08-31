import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";

export const runtime = "nodejs";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, Math.floor(requestedDays))) : 30;
  const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 86_400_000));

  try {
    const [usageEvents, boardEvents] = await Promise.all([
      db.usageEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { eventName: true, userId: true, source: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      }),
      db.boardActivityEvent.findMany({
        where: { createdAt: { gte: since }, actorId: { not: null } },
        select: { action: true, actorId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    // 기존 보드 활동 로그도 함께 포함해, 계측 이벤트가 아직 충분히 쌓이지
    // 않은 기간에도 실제 사용량을 보여준다.
    const events = [
      ...usageEvents,
      ...boardEvents.map((event) => ({
        eventName: event.action,
        userId: event.actorId,
        source: "web",
        createdAt: event.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const activeUserIds = new Set<string>();
    const daily = new Map<string, Set<string>>();
    const byEvent = new Map<string, number>();
    const bySource = new Map<string, number>();
    const perUser = new Map<string, { events: number; activeDays: Set<string>; byEvent: Map<string, number>; lastActive: Date }>();

    for (const event of events) {
      const day = event.createdAt.toISOString().slice(0, 10);
      byEvent.set(event.eventName, (byEvent.get(event.eventName) ?? 0) + 1);
      bySource.set(event.source, (bySource.get(event.source) ?? 0) + 1);
      if (!event.userId) continue;
      activeUserIds.add(event.userId);
      if (!daily.has(day)) daily.set(day, new Set());
      daily.get(day)!.add(event.userId);
      const current = perUser.get(event.userId) ?? { events: 0, activeDays: new Set<string>(), byEvent: new Map<string, number>(), lastActive: event.createdAt };
      current.events += 1;
      current.activeDays.add(day);
      current.byEvent.set(event.eventName, (current.byEvent.get(event.eventName) ?? 0) + 1);
      if (event.createdAt > current.lastActive) current.lastActive = event.createdAt;
      perUser.set(event.userId, current);
    }

    const users = await db.user.findMany({
      where: { id: { in: [...activeUserIds] } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((entry) => [entry.id, entry]));
    const userUsage = [...perUser.entries()]
      .map(([id, stats]) => ({
        user: userById.get(id) ?? { id, name: null, email: null },
        eventCount: stats.events,
        activeDays: stats.activeDays.size,
        lastActiveAt: stats.lastActive.toISOString(),
        features: Object.fromEntries([...stats.byEvent.entries()].sort((a, b) => b[1] - a[1])),
      }))
      .sort((a, b) => b.eventCount - a.eventCount);

    const dailyActiveUsers = Array.from({ length: days }, (_, index) => {
      const date = new Date(since.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      return { date, count: daily.get(date)?.size ?? 0 };
    });

    return jsonPrivateNoStore({
      period: { days, since: since.toISOString(), until: new Date().toISOString() },
      summary: {
        activeUsers: activeUserIds.size,
        totalEvents: events.length,
        eventTypes: byEvent.size,
      },
      dailyActiveUsers,
      eventsByName: Object.fromEntries([...byEvent.entries()].sort((a, b) => b[1] - a[1])),
      eventsBySource: Object.fromEntries(bySource),
      users: userUsage,
    });
  } catch (error) {
    console.error("[GET /api/admin/usage]", error);
    return jsonPrivateNoStore({ error: "usage_unavailable" }, { status: 503 });
  }
}
