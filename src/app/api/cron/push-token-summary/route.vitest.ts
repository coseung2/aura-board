import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUser } } }));

import { GET } from "./route";

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
      studentsWithActiveToken: 2,
      activeTokens: 2,
      disabledTokens: 1,
      totalTokens: 3,
      activeByPlatform: { android: 1, ios: 1 },
    }] });
  });
});
