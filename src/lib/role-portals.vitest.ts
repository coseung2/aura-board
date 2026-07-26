import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignmentFindMany: vi.fn(),
  settingFindMany: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    classroomRoleAssignment: { findMany: mocks.assignmentFindMany },
    classroomRoleSetting: { findMany: mocks.settingFindMany },
  },
}));
vi.mock("./bank-permissions", () => ({ hasPermission: mocks.hasPermission }));

import { getStudentDuties } from "./role-portals";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasPermission.mockImplementation(
    async (_classroomId: string, _actor: unknown, permission: string) =>
      permission === "bank.deposit",
  );
});

describe("getStudentDuties", () => {
  it("does not expose a portal for a disabled classroom role", async () => {
    mocks.assignmentFindMany.mockResolvedValue([
      {
        classroom: { id: "classroom-1", name: "1반" },
        classroomRole: { id: "role-1", key: "banker", labelKo: "은행원", emoji: "🏦" },
      },
    ]);
    mocks.settingFindMany.mockResolvedValue([
      { classroomId: "classroom-1", classroomRoleId: "role-1" },
    ]);

    await expect(getStudentDuties("student-1")).resolves.toEqual([]);
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });

  it("keeps legacy assignments visible when no setting row exists", async () => {
    mocks.assignmentFindMany.mockResolvedValue([
      {
        classroom: { id: "classroom-1", name: "1반" },
        classroomRole: { id: "role-1", key: "banker", labelKo: "은행원", emoji: "🏦" },
      },
    ]);
    mocks.settingFindMany.mockResolvedValue([]);

    const duties = await getStudentDuties("student-1");

    expect(duties).toEqual([
      expect.objectContaining({
        classroomId: "classroom-1",
        roleKey: "banker",
        href: "/classroom/classroom-1/bank",
      }),
    ]);
  });
});
