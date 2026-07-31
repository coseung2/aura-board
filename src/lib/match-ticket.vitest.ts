import { afterEach, describe, expect, it, vi } from "vitest";
import { MockParentSecurityRedis } from "./__tests__/parent-security-redis.mock";

async function loadTicketInstance(redis: MockParentSecurityRedis) {
  vi.resetModules();
  const store = await import("./parent-security-store");
  store._setParentSecurityRedisForTests(redis);
  return import("./match-ticket");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("distributed parent match tickets", () => {
  it("stores an opaque five-minute ticket with hashed key and session binding", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00Z"));
    const redis = new MockParentSecurityRedis();
    const tickets = await loadTicketInstance(redis);

    const token = await tickets.issueTicket({
      parentSessionId: "parent-session-secret",
      classroomId: "classroom-1",
      classroomName: "햇살반",
    });

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(redis.setCalls).toHaveLength(1);
    expect(redis.setCalls[0].ex).toBe(300);
    expect(redis.setCalls[0].key).not.toContain(token);
    expect(redis.setCalls[0].key).not.toContain("parent-session-secret");
    expect(redis.setCalls[0].value).not.toContain("parent-session-secret");
  });

  it("reads across module instances and consumes exactly once atomically", async () => {
    const redis = new MockParentSecurityRedis();
    const first = await loadTicketInstance(redis);
    const token = await first.issueTicket({
      parentSessionId: "session-1",
      classroomId: "classroom-1",
      classroomName: "햇살반",
    });
    const second = await loadTicketInstance(redis);

    await expect(second.readTicket(token, "session-1")).resolves.toMatchObject({
      classroomId: "classroom-1",
    });
    await expect(second.consumeTicket(token, "wrong-session")).resolves.toBeNull();

    const results = await Promise.all([
      first.consumeTicket(token, "session-1"),
      second.consumeTicket(token, "session-1"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(first.readTicket(token, "session-1")).resolves.toBeNull();
  });

  it("expires tickets after five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00Z"));
    const redis = new MockParentSecurityRedis();
    const tickets = await loadTicketInstance(redis);
    const token = await tickets.issueTicket({
      parentSessionId: "session-1",
      classroomId: "classroom-1",
      classroomName: "햇살반",
    });

    vi.advanceTimersByTime(300_001);
    await expect(tickets.readTicket(token, "session-1")).resolves.toBeNull();
  });

  it("fails closed in production when Redis is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const store = await import("./parent-security-store");
    store._setParentSecurityRedisForTests(null);
    const tickets = await import("./match-ticket");

    await expect(tickets.issueTicket({
      parentSessionId: "session-1",
      classroomId: "classroom-1",
      classroomName: "햇살반",
    })).rejects.toThrow(/Redis is not configured.*request denied/);
  });
});
