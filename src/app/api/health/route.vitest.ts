import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.queryRaw } }));

import { GET } from "./route";

const NOW = new Date("2026-08-20T00:00:00.000Z");

function sqlText(query: unknown): string {
  if (Array.isArray(query)) return query.join("");
  return String(query);
}

function setReplicationEnvironment(maxAge?: string, flag = "true") {
  process.env.AURA_DR_EXPECT_REPLICATION = flag;
  if (maxAge === undefined) {
    delete process.env.AURA_DR_MAX_HEARTBEAT_AGE_SECONDS;
  } else {
    process.env.AURA_DR_MAX_HEARTBEAT_AGE_SECONDS = maxAge;
  }
}

function expectNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
}

function expectQueryOrder(expected: string[]) {
  expect(mocks.queryRaw.mock.calls.map(([query]) => sqlText(query))).toEqual(
    expected.map((part) => expect.stringContaining(part)),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.queryRaw.mockReset();
  delete process.env.AURA_DR_EXPECT_REPLICATION;
  delete process.env.AURA_DR_MAX_HEARTBEAT_AGE_SECONDS;
  mocks.queryRaw.mockResolvedValue([]);
});

describe("GET /api/health", () => {
  it("preserves the default reachable response and only checks database reachability", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, database: "reachable" });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1"]);
  });

  it.each(["true", "1"])(
    "returns fresh when replication is enabled with %s",
    async (flag) => {
      setReplicationEnvironment("300", flag);
      mocks.queryRaw.mockImplementation(async (query: unknown) =>
        sqlText(query).includes("SELECT 1")
          ? []
          : [
              {
                source_commit_at: new Date(NOW.getTime() - 60_000),
                nonce: "private",
              },
            ],
      );

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        database: "reachable",
        replication: "fresh",
      });
      expectNoStore(response);
      expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
    },
  );

  it("returns stale for a heartbeat older than the configured window", async () => {
    setReplicationEnvironment("180");
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [{ source_commit_at: new Date(NOW.getTime() - 180_001) }],
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "stale",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("returns unavailable when the primary heartbeat is missing", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1") ? [] : [],
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "unavailable",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it.each(["false", "0"])(
    "preserves the legacy response when replication is disabled with %s",
    async (flag) => {
      setReplicationEnvironment(undefined, flag);

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        database: "reachable",
      });
      expectNoStore(response);
      expectQueryOrder(["SELECT 1"]);
    },
  );

  it.each(["", "TRUE", "yes", "  "])(
    "fails closed for invalid replication flag %j without a heartbeat query",
    async (flag) => {
      setReplicationEnvironment(undefined, flag);

      const response = await GET();

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        ok: false,
        database: "reachable",
        replication: "misconfigured",
      });
      expectNoStore(response);
      expectQueryOrder(["SELECT 1"]);
    },
  );

  it("returns stale for a heartbeat 1ms in the future", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [{ source_commit_at: new Date(NOW.getTime() + 1) }],
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "stale",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("returns fresh when the heartbeat timestamp is exactly now", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [{ source_commit_at: new Date(NOW) }],
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      database: "reachable",
      replication: "fresh",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("returns fresh at the configured heartbeat age boundary", async () => {
    setReplicationEnvironment("180");
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [{ source_commit_at: new Date(NOW.getTime() - 180_000) }],
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      database: "reachable",
      replication: "fresh",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("returns unavailable for duplicate heartbeat rows", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [
            { source_commit_at: new Date(NOW) },
            { source_commit_at: new Date(NOW) },
          ],
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "unavailable",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("returns unavailable for an invalid heartbeat date", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes("SELECT 1")
        ? []
        : [{ source_commit_at: new Date("invalid") }],
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "unavailable",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("fails closed when the heartbeat age configuration is invalid", async () => {
    setReplicationEnvironment("29");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "misconfigured",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1"]);
  });

  it("returns unavailable when the heartbeat query fails without exposing the error", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockImplementation(async (query: unknown) => {
      if (sqlText(query).includes("SELECT 1")) return [];
      throw new Error("private SQL secret");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "reachable",
      replication: "unavailable",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1", "private.aura_dr_heartbeat"]);
  });

  it("keeps the initial reachability failure response and skips the heartbeat query", async () => {
    setReplicationEnvironment();
    mocks.queryRaw.mockRejectedValue(new Error("database secret"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      database: "unreachable",
    });
    expectNoStore(response);
    expectQueryOrder(["SELECT 1"]);
  });
});
