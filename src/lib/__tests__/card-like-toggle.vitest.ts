import { describe, expect, it } from "vitest";
import { applyCardLikeMutation } from "@/lib/card-like-toggle";

function uniqueConflict() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function createDelegate(options: {
  deleteCount?: number;
  createError?: unknown;
}) {
  const calls: string[] = [];
  return {
    calls,
    delegate: {
      async deleteMany() {
        calls.push("deleteMany");
        return { count: options.deleteCount ?? 0 };
      },
      async create() {
        calls.push("create");
        if (options.createError) throw options.createError;
        return {};
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

    expect(fake.calls).toEqual(["create"]);
  });

  it("treats unique conflicts as already liked", async () => {
    const fake = createDelegate({ createError: uniqueConflict() });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "student", id: "student-1" }, true),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["create"]);
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

  it("legacy duplicate creates collapse to liked instead of throwing", async () => {
    const fake = createDelegate({ createError: uniqueConflict() });

    await expect(
      applyCardLikeMutation(fake.delegate, "card-1", { kind: "student", id: "student-1" }, undefined),
    ).resolves.toBe(true);

    expect(fake.calls).toEqual(["deleteMany", "create"]);
  });
});
