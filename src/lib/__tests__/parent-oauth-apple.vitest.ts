import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  accountUpdate: vi.fn(),
  accountCreate: vi.fn(),
  parentFindUnique: vi.fn(),
  parentCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    parentOAuthAccount: {
      findUnique: mocks.accountFindUnique,
      update: mocks.accountUpdate,
      create: mocks.accountCreate,
    },
    parent: {
      findUnique: mocks.parentFindUnique,
      create: mocks.parentCreate,
    },
  },
}));

import { upsertParentFromOAuth } from "../parent-oauth";

const appleInfo = {
  providerAccountId: "apple-sub-1",
  email: "abc123@privaterelay.appleid.com",
  emailVerified: true,
  displayName: "보호자",
  profileImage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountFindUnique.mockResolvedValue(null);
  mocks.accountUpdate.mockResolvedValue(undefined);
  mocks.accountCreate.mockResolvedValue(undefined);
  mocks.parentFindUnique.mockResolvedValue(null);
  mocks.parentCreate.mockResolvedValue({ id: "parent-new" });
});

describe("Apple parent OAuth linking", () => {
  it("reuses the parent linked to the stable Apple sub", async () => {
    mocks.accountFindUnique.mockResolvedValue({
      id: "oauth-account-1",
      parentId: "parent-existing",
    });

    await expect(upsertParentFromOAuth("apple", appleInfo)).resolves.toEqual({
      parentId: "parent-existing",
      isNewParent: false,
    });
    expect(mocks.accountFindUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "apple",
          providerAccountId: "apple-sub-1",
        },
      },
    });
    expect(mocks.accountUpdate).toHaveBeenCalledWith({
      where: { id: "oauth-account-1" },
      data: {
        email: appleInfo.email,
        emailVerified: true,
        displayName: "보호자",
        profileImage: null,
      },
    });
    expect(mocks.parentCreate).not.toHaveBeenCalled();
  });

  it("links a new Apple sub to an existing parent by verified private relay email", async () => {
    mocks.parentFindUnique.mockResolvedValue({
      id: "parent-by-email",
      parentDeletedAt: null,
    });

    await expect(upsertParentFromOAuth("apple", appleInfo)).resolves.toEqual({
      parentId: "parent-by-email",
      isNewParent: false,
    });
    expect(mocks.accountCreate).toHaveBeenCalledWith({
      data: {
        parentId: "parent-by-email",
        provider: "apple",
        providerAccountId: "apple-sub-1",
        email: appleInfo.email,
        emailVerified: true,
        displayName: "보호자",
        profileImage: null,
      },
    });
    expect(mocks.parentCreate).not.toHaveBeenCalled();
  });
});
