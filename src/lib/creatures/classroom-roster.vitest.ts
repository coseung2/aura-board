import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classroomFindUnique: vi.fn(),
  studentFindMany: vi.fn(),
  resolveCreatureDto: vi.fn(),
  getCreatureLine: vi.fn(),
  getCreatureStageDefinition: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    student: { findMany: mocks.studentFindMany },
  },
}));
vi.mock("@/lib/creatures/service", () => ({
  resolveCreatureDto: mocks.resolveCreatureDto,
}));
vi.mock("@/lib/creatures/catalog", () => ({
  getCreatureLine: mocks.getCreatureLine,
  getCreatureStageDefinition: mocks.getCreatureStageDefinition,
}));

import { getClassroomCreatureRoster } from "./classroom-roster";

const identity = { id: "student-current", classroomId: "classroom-1" };

function creatureRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    studentId: "student-current",
    classroomId: "classroom-1",
    lineKey: "terramote",
    stage: "hatchling",
    isActive: true,
    isFeatured: false,
    progressPoints: 3,
    rulesVersion: "rules-private",
    catalogRevision: "catalog-private",
    purchaseMode: "purchase-private",
    oddsSnapshot: { private: true },
    incubatingStartedAt: new Date("2026-07-01T00:00:00.000Z"),
    hatchedAt: new Date("2026-07-02T00:00:00.000Z"),
    juvenileAt: null,
    evolvedAt: null,
    completedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("getClassroomCreatureRoster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.classroomFindUnique.mockResolvedValue({ id: "classroom-1", name: "햇살반" });
    mocks.getCreatureLine.mockReturnValue({
      visualConcept: "moss-backed burrower",
      visualConceptKo: "이끼 등 생물",
    });
    mocks.getCreatureStageDefinition.mockReturnValue({
      behaviors: [
        {
          kind: "normal",
          actionId: "normal-action",
          labelKo: "보통",
          descriptionKo: "천천히 움직여요",
        },
      ],
    });
    mocks.resolveCreatureDto.mockImplementation((row: ReturnType<typeof creatureRow>) => ({
      id: row.id,
      lineKey: row.lineKey,
      nameKo: "테라모트",
      affinity: "earth",
      stage: row.stage,
      isActive: row.isActive,
      isFeatured: row.isFeatured,
      packageId: "character.aura.terramote.hatchling",
      assetPackageId: "character.aura.terramote.hatchling",
      behaviorSheetId: "behavior.aura.terramote.hatchling.v1",
      behaviorSheetPath: "/creatures/terramote/hatchling/sheet.json",
      // These fields must never cross the classroom-roster response boundary.
      progressPoints: row.progressPoints,
      nextThreshold: 5,
      oddsSnapshot: row.oddsSnapshot,
      purchaseMode: row.purchaseMode,
      rulesVersion: row.rulesVersion,
      catalogRevision: row.catalogRevision,
      incubatingStartedAt: "2026-07-01T00:00:00.000Z",
      hatchedAt: null,
      juvenileAt: null,
      evolvedAt: null,
      completedAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }));
  });

  it("uses the signed classroom id and nulls-last numeric roster ordering", async () => {
    mocks.studentFindMany.mockResolvedValue([
      {
        id: "student-current",
        number: 2,
        name: "현재 학생",
        creatures: [],
      },
      { id: "student-other", number: null, name: "번호 없음", creatures: [] },
    ]);

    const result = await getClassroomCreatureRoster(identity);
    const query = mocks.studentFindMany.mock.calls[0][0];

    expect(query.where).toEqual({ classroomId: "classroom-1" });
    expect(query.orderBy[0]).toEqual({ number: { sort: "asc", nulls: "last" } });
    expect(query.select.creatures.where).toEqual({ classroomId: "classroom-1" });
    expect(result.students).toMatchObject([
      { studentId: "student-current", studentNumber: 2, number: 2, isCurrent: true },
      { studentId: "student-other", studentNumber: null, number: null, isCurrent: false },
    ]);
  });

  it("returns one representative creature with only public visual/behavior data", async () => {
    const row = creatureRow("creature-1", { studentId: "student-other", isFeatured: true });
    mocks.studentFindMany.mockResolvedValue([
      { id: "student-other", number: 1, name: "다른 학생", creatures: [row] },
    ]);

    const result = await getClassroomCreatureRoster(identity);
    const creature = result.students[0]?.creature;

    expect(creature).toMatchObject({
      id: "creature-1",
      lineKey: "terramote",
      stage: "hatchling",
      isFeatured: true,
      visualConcept: "moss-backed burrower",
      visualConceptKo: "이끼 등 생물",
      behaviors: [{ kind: "normal", actionId: "normal-action" }],
    });
    expect(creature).not.toHaveProperty("progressPoints");
    expect(creature).not.toHaveProperty("oddsSnapshot");
    expect(creature).not.toHaveProperty("purchaseMode");
    expect(creature).not.toHaveProperty("rulesVersion");
    expect(creature).not.toHaveProperty("createdAt");
  });
});

