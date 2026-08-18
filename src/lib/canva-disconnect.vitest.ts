import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    canvaConnectAccount: {
      findUnique: mocks.findUnique,
      delete: mocks.delete,
    },
  },
}));

import { disconnectTeacherCanva } from "./canva";

describe("disconnectTeacherCanva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.findUnique.mockResolvedValue({
      refreshToken: "stored-refresh-token",
      accessToken: "stored-access-token",
    });
    mocks.delete.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes a stale local connection for Canva's OAuth error response shape", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        {
          error: "bad_request_params",
          error_description: "Token is neither an access or refresh token",
        },
        { status: 400 },
      ),
    );

    await expect(disconnectTeacherCanva("teacher-1")).resolves.toBe(true);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { userId: "teacher-1" } });
  });

  it("keeps the local connection when Canva rejects the client credentials", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        { error: "invalid_access_token", error_description: "Client secret is invalid" },
        { status: 401 },
      ),
    );

    await expect(disconnectTeacherCanva("teacher-1")).resolves.toBe(false);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
