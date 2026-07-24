import { describe, expect, it } from "vitest";
import { applyCommentLikeMutation } from "@/lib/comment-like-toggle";

function uniqueConflict() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function createDelegate(options: {
  deleteCount?: number;
  createError?: unknown;
}) {
  const calls: string[] = [];
  const createArgs: unknown[] = [];
  return {
    calls,
    createArgs,
    delegate: {
      async deleteMany() {
        calls.push("deleteMany");
        return { count: options.deleteCount ?? 0 };
      },
      async create(args: unknown) {
        calls.push("create");
        createArgs.push(args);
        if (options.createError) throw options.createError;
        return {};
      },
    },
  };
}

describe("applyCommentLikeMutation", () => {
  it("creates a like for an idempotent liked=true request", async () => {
    const fake = createDelegate({});

    await expect(
      applyCommentLikeMutation(
        fake.delegate,
        "comment-1",
        { kind: "teacher", id: "user-1" },
        true,
      ),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["create"]);
  });

  it("stores a parent like under its dedicated idempotency key", async () => {
    const fake = createDelegate({});

    await expect(
      applyCommentLikeMutation(
        fake.delegate,
        "comment-1",
        { kind: "parent", id: "parent-1" },
        true,
      ),
    ).resolves.toBe(true);

    expect(fake.createArgs).toEqual([
      {
        data: {
          commentId: "comment-1",
          likerKind: "external",
          likerUserId: null,
          likerStudentId: null,
          likerParentId: "parent-1",
        },
      },
    ]);
  });

  it("treats a concurrent unique conflict as already liked", async () => {
    const fake = createDelegate({ createError: uniqueConflict() });

    await expect(
      applyCommentLikeMutation(
        fake.delegate,
        "comment-1",
        { kind: "student", id: "student-1" },
        true,
      ),
    ).resolves.toBe(true);
  });

  it("deletes likes for an idempotent liked=false request", async () => {
    const fake = createDelegate({ deleteCount: 1 });

    await expect(
      applyCommentLikeMutation(
        fake.delegate,
        "comment-1",
        { kind: "student", id: "student-1" },
        false,
      ),
    ).resolves.toBe(false);

    expect(fake.calls).toEqual(["deleteMany"]);
  });

  it("keeps legacy toggle behavior when the intent is omitted", async () => {
    const fake = createDelegate({ deleteCount: 0, createError: uniqueConflict() });

    await expect(
      applyCommentLikeMutation(
        fake.delegate,
        "comment-1",
        { kind: "teacher", id: "user-1" },
        undefined,
      ),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["deleteMany", "create"]);
  });
});
