import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
}));

import { featureCreature } from "./service";

const date = new Date("2026-07-17T00:00:00.000Z");

function creature(overrides: Record<string, unknown>) {
  return {
    id: "creature-1",
    studentId: "student-1",
    classroomId: "classroom-1",
    lineKey: "terramote",
    stage: "hatchling",
    isActive: true,
    isFeatured: false,
    progressPoints: 3,
    rulesVersion: "creature-rules-v1",
    catalogRevision: "catalog-v1",
    purchaseMode: "random",
    oddsSnapshot: null,
    incubatingStartedAt: date,
    hatchedAt: date,
    juvenileAt: null,
    evolvedAt: null,
    completedAt: null,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

function installTransaction(initialRows: ReturnType<typeof creature>[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const tx = {
    studentCreature: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) =>
          (!where.id || row.id === where.id) &&
          (!where.studentId || row.studentId === where.studentId) &&
          (!where.classroomId || row.classroomId === where.classroomId),
        ) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { studentId: string; isFeatured: boolean; id: { not: string } }; data: { isFeatured: boolean } }) => {
        let count = 0;
        for (const row of rows) {
          if (row.studentId === where.studentId && row.isFeatured === where.isFeatured && row.id !== where.id.not) {
            row.isFeatured = data.isFeatured;
            count += 1;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { isFeatured: boolean } }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("missing creature");
        row.isFeatured = data.isFeatured;
        return row;
      }),
    },
  };
  mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
  return { rows, tx };
}

describe("featured creature selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("switches the representative without changing the active growth slot", async () => {
    const state = installTransaction([
      creature({ id: "old", stage: "evolved", isActive: false, isFeatured: true }),
      creature({ id: "next", stage: "juvenile", isActive: true }),
    ]);

    const result = await featureCreature(
      { id: "student-1", classroomId: "classroom-1" },
      "next",
    );

    expect(result.featured).toMatchObject({ id: "next", isFeatured: true, isActive: true });
    expect(state.rows.find((row) => row.id === "old")?.isFeatured).toBe(false);
    expect(state.rows.find((row) => row.id === "next")?.isActive).toBe(true);
  });

  it("hides another student's creature as not found", async () => {
    installTransaction([creature({ id: "other", studentId: "student-2" })]);
    await expect(featureCreature(
      { id: "student-1", classroomId: "classroom-1" },
      "other",
    )).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("rejects an owned egg as not yet hatched", async () => {
    installTransaction([creature({ id: "egg", stage: "egg" })]);
    await expect(featureCreature(
      { id: "student-1", classroomId: "classroom-1" },
      "egg",
    )).rejects.toMatchObject({ code: "creature_not_hatched", status: 409 });
  });
});
