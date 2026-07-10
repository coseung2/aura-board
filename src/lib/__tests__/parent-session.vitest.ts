import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cookieDelete = vi.fn();
  const cookieGet = vi.fn();
  const parentSessionUpdateMany = vi.fn();
  const parentSessionFindUnique = vi.fn();
  const parentSessionUpdate = vi.fn();
  const headers = vi.fn();
  const cookies = vi.fn(async () => ({ get: cookieGet, delete: cookieDelete }));
  return {
    cookieDelete,
    cookieGet,
    parentSessionUpdateMany,
    parentSessionFindUnique,
    parentSessionUpdate,
    headers,
    cookies,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));
vi.mock("@/lib/db", () => ({
  db: {
    parentSession: {
      updateMany: mocks.parentSessionUpdateMany,
      findUnique: mocks.parentSessionFindUnique,
      update: mocks.parentSessionUpdate,
    },
  },
}));

import { clearParentSession, getCurrentParent } from "../parent-session";

describe("parent bearer session logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.headers.mockResolvedValue(
      new Headers({ authorization: "Bearer mobile-parent-token" }),
    );
    mocks.parentSessionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("revokes the bearer session so the same token cannot be replayed", async () => {
    let revoked = false;
    mocks.parentSessionUpdateMany.mockImplementation(async () => {
      revoked = true;
      return { count: 1 };
    });
    mocks.parentSessionFindUnique.mockImplementation(async () => ({
      id: "session_1",
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      sessionRevokedAt: revoked ? new Date() : null,
      parent: { id: "parent_1", parentDeletedAt: null },
    }));

    await clearParentSession();

    expect(mocks.parentSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionRevokedAt: null }),
      }),
    );
    expect(await getCurrentParent()).toBeNull();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("parent_session");
  });
});
