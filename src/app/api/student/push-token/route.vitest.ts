import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  upsertDevice: vi.fn(),
  updateDevices: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/db", () => ({
  db: {
    studentPushDevice: {
      upsert: mocks.upsertDevice,
      updateMany: mocks.updateDevices,
    },
  },
}));

import { DELETE, POST } from "./route";

describe("/api/student/push-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1" });
    mocks.upsertDevice.mockResolvedValue({ id: "device-1" });
    mocks.updateDevices.mockResolvedValue({ count: 1 });
  });

  it("registers a valid Expo token for the authenticated student", async () => {
    const response = await POST(new Request("http://localhost/api/student/push-token", {
      method: "POST",
      body: JSON.stringify({ token: "ExpoPushToken[token_1]", platform: "android" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.upsertDevice).toHaveBeenCalledWith({
      where: { expoPushToken: "ExpoPushToken[token_1]" },
      create: {
        studentId: "student-1",
        expoPushToken: "ExpoPushToken[token_1]",
        platform: "android",
      },
      update: {
        studentId: "student-1",
        platform: "android",
        disabledAt: null,
      },
    });
  });

  it("rejects malformed or unauthenticated registration", async () => {
    const malformed = await POST(new Request("http://localhost/api/student/push-token", {
      method: "POST",
      body: JSON.stringify({ token: "not-an-expo-token", platform: "android" }),
    }));
    expect(malformed.status).toBe(400);

    mocks.getCurrentStudent.mockResolvedValue(null);
    const unauthorized = await POST(new Request("http://localhost/api/student/push-token", {
      method: "POST",
      body: JSON.stringify({ token: "ExpoPushToken[token_1]", platform: "android" }),
    }));
    expect(unauthorized.status).toBe(401);
  });

  it("disables only the current student's matching token", async () => {
    const response = await DELETE(new Request("http://localhost/api/student/push-token", {
      method: "DELETE",
      body: JSON.stringify({ token: "ExpoPushToken[token_1]" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateDevices).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        expoPushToken: "ExpoPushToken[token_1]",
        disabledAt: null,
      },
      data: { disabledAt: expect.any(Date) },
    });
  });
});
