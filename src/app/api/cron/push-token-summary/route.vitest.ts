import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findDevices: vi.fn(),
  updateDevices: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.findUser },
    studentPushDevice: {
      findMany: mocks.findDevices,
      updateMany: mocks.updateDevices,
    },
  },
}));

import { GET, POST } from "./route";

describe("GET /api/cron/push-token-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test";
  });

  it("rejects unauthenticated requests", async () => {
    const response = await GET(new Request("http://localhost/api/cron/push-token-summary"));
    expect(response.status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("returns aggregate counts without token or student details", async () => {
    mocks.findUser.mockResolvedValue({
      classrooms: [{
        name: "별무리반",
        students: [
          { pushDevices: [{ disabledAt: null, platform: "android" }] },
          { pushDevices: [
            { disabledAt: null, platform: "ios" },
            { disabledAt: new Date(), platform: "android" },
          ] },
        ],
      }],
    });
    const response = await GET(new Request(
      "http://localhost/api/cron/push-token-summary?teacherEmail=mallagaenge%40gmail.com",
      { headers: { authorization: "Bearer cron-test" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ classrooms: [{
      classroom: "별무리반",
      students: 2,
      studentsWithAnyToken: 2,
      studentsWithActiveToken: 2,
      studentsWithDisabledTokensOnly: 0,
      studentsWithoutTokenHistory: 0,
      activeTokens: 2,
      disabledTokens: 1,
      totalTokens: 3,
      activeByPlatform: { android: 1, ios: 1 },
    }] });
  });

  it("dry-runs and then disables only stale active tokens", async () => {
    mocks.findDevices.mockResolvedValue([{ id: "device-old" }]);
    mocks.updateDevices.mockResolvedValue({ count: 1 });
    const url = "http://localhost/api/cron/push-token-summary?teacherEmail=mallagaenge%40gmail.com";
    const headers = { authorization: "Bearer cron-test", "content-type": "application/json" };

    const dryRun = await POST(new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ staleDays: 30, dryRun: true }),
    }));
    await expect(dryRun.json()).resolves.toMatchObject({ candidates: 1, disabled: 0, dryRun: true });
    expect(mocks.updateDevices).not.toHaveBeenCalled();

    const apply = await POST(new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ staleDays: 30, dryRun: false }),
    }));
    await expect(apply.json()).resolves.toMatchObject({ candidates: 1, disabled: 1, dryRun: false });
    expect(mocks.updateDevices).toHaveBeenCalledWith(expect.objectContaining({
      data: { disabledAt: expect.any(Date) },
    }));
  });
});
