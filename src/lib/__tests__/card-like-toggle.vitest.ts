import { describe, expect, it } from "vitest";
import { applyCardLikeMutation } from "@/lib/card-like-toggle";

function createDelegate(options: {
  deleteCount?: number;
  createManyCount?: number;
  createManyError?: unknown;
}) {
  const calls: string[] = [];
  const createManyArgs: unknown[] = [];
  return {
    calls,
    createManyArgs,
    delegate: {
      async deleteMany() {
        calls.push("deleteMany");
        return { count: options.deleteCount ?? 0 };
      },
      async createMany(args: unknown) {
        calls.push("createMany");
        createManyArgs.push(args);
        if (options.createManyError) throw options.createManyError;
        return { count: options.createManyCount ?? 1 };
      },
    },
  };
}

describe("applyCardLikeMutation", () => {
  it("creates a like for an idempotent liked=true request", async () => {
    const fake = createDelegate({});

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "teacher", id: "user-1" }, true),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["createMany"]);
    expect(fake.createManyArgs).toEqual([
      {
        data: {
          cardId: "card-1",
          likerKind: "teacher",
          likerUserId: "user-1",
          likerStudentId: null,
          externalLikerKey: null,
        },
        skipDuplicates: true,
      },
    ]);
  });

  it("treats a skipped duplicate student like as already liked", async () => {
    const fake = createDelegate({ createManyCount: 0 });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "student", id: "student-1" }, true),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["createMany"]);
    expect(fake.createManyArgs).toEqual([
      {
        data: {
          cardId: "card-1",
          likerKind: "student",
          likerUserId: null,
          likerStudentId: "student-1",
          externalLikerKey: null,
        },
        skipDuplicates: true,
      },
    ]);
  });

  it("deletes likes for an idempotent liked=false request", async () => {
    const fake = createDelegate({ deleteCount: 1 });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "external", id: "guest-1" }, false),
    ).resolves.toBe(false);

    expect(fake.calls).toEqual(["deleteMany"]);
  });

  it("legacy toggles remove an existing like without a delete race", async () => {
    const fake = createDelegate({ deleteCount: 1 });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "teacher", id: "user-1" }, undefined),
    ).resolves.toBe(false);

    expect(fake.calls).toEqual(["deleteMany"]);
  });

  it("legacy duplicate creates collapse to liked without a constraint error", async () => {
    const fake = createDelegate({ createManyCount: 0 });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "student", id: "student-1" }, undefined),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["deleteMany", "createMany"]);
  });

  it("still surfaces non-duplicate database failures", async () => {
    const failure = Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });
    const fake = createDelegate({ createManyError: failure });

    await expect(
      applyCardLikeMutation(fake.delegate, "missing-card", { kind: "student", id: "student-1" }, true),
    ).rejects.toBe(failure);
  });
});
