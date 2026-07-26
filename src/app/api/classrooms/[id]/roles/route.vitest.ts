import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindUnique: vi.fn(),
  roleDefFindMany: vi.fn(),
  roleDefFindUnique: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignmentCreate: vi.fn(),
  assignmentDeleteMany: vi.fn(),
  studentFindUnique: vi.fn(),
  settingFindMany: vi.fn(),
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    classroomRoleDef: {
      findMany: mocks.roleDefFindMany,
      findUnique: mocks.roleDefFindUnique,
    },
    classroomRoleAssignment: {
      findMany: mocks.assignmentFindMany,
      create: mocks.assignmentCreate,
    },
    classroomRoleSetting: {
      findMany: mocks.settingFindMany,
      findUnique: mocks.settingFindUnique,
    },
    student: { findUnique: mocks.studentFindUnique },
    $transaction: vi.fn(async (callback) =>
      callback({
        classroomRoleSetting: { upsert: mocks.settingUpsert },
        classroomRoleAssignment: { deleteMany: mocks.assignmentDeleteMany },
      }),
    ),
  },
}));

import { GET, PATCH } from "./route";
import { POST as ASSIGN } from "./assign/route";
import { PUT as SET_ROLE } from "./set/route";

const context = { params: Promise.resolve({ id: "classroom-1" }) };
const roleDefs = [
  {
    id: "role-1",
    key: "banker",
    labelKo: "은행원",
    emoji: "🏦",
    description: "",
  },
  {
    id: "role-2",
    key: "checker",
    labelKo: "체크원",
    emoji: "✅",
    description: "",
  },
];
const assignments = [
  {
    id: "assignment-1",
    studentId: "student-1",
    classroomRoleId: "role-1",
    assignedAt: new Date("2026-07-26T00:00:00Z"),
    student: { id: "student-1", name: "가람", number: 1 },
  },
  {
    id: "assignment-2",
    studentId: "student-2",
    classroomRoleId: "role-2",
    assignedAt: new Date("2026-07-26T00:00:00Z"),
    student: { id: "student-2", name: "나래", number: 2 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
  mocks.classroomFindUnique.mockResolvedValue({ id: "classroom-1", teacherId: "teacher-1" });
  mocks.roleDefFindMany.mockResolvedValue(roleDefs);
  mocks.assignmentFindMany.mockResolvedValue(assignments);
  mocks.settingFindMany.mockResolvedValue([]);
});

describe("classroom role settings API", () => {
  it("keeps every legacy role enabled with zero weekly compensation", async () => {
    const response = await GET(new Request("http://localhost"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.availableDefs).toEqual(roleDefs);
    expect(body.defs).toEqual(
      roleDefs.map((role) => ({
        ...role,
        enabled: true,
        salaryAmount: 0,
        payPeriod: "weekly",
      })),
    );
    expect(body.assignments).toHaveLength(2);
  });

  it("omits explicitly disabled roles and their stale assignments", async () => {
    mocks.settingFindMany.mockResolvedValue([
      {
        classroomRoleId: "role-2",
        enabled: false,
        salaryAmount: 100,
        payPeriod: "daily",
      },
    ]);

    const response = await GET(new Request("http://localhost"), context);
    const body = await response.json();

    expect(body.defs.map((role: { id: string }) => role.id)).toEqual(["role-1"]);
    expect(body.assignments.map((assignment: { id: string }) => assignment.id)).toEqual([
      "assignment-1",
    ]);
  });

  it("rejects non-teachers before reading or writing a role", async () => {
    mocks.classroomFindUnique.mockResolvedValue({ teacherId: "teacher-2" });
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ roleKey: "banker", enabled: false }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.roleDefFindUnique).not.toHaveBeenCalled();
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });

  it("validates salary and pay period", async () => {
    for (const body of [
      { roleKey: "banker", salaryAmount: -1 },
      { roleKey: "banker", salaryAmount: 1.5 },
      { roleKey: "banker", payPeriod: "yearly" },
    ]) {
      const response = await PATCH(
        new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }),
        context,
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.classroomFindUnique).not.toHaveBeenCalled();
  });

  it("persists compensation for an active role", async () => {
    mocks.roleDefFindUnique.mockResolvedValue({ id: "role-1" });
    mocks.settingFindUnique.mockResolvedValue(null);
    mocks.settingUpsert.mockResolvedValue({
      enabled: true,
      salaryAmount: 300,
      payPeriod: "monthly",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          roleKey: "banker",
          salaryAmount: 300,
          payPeriod: "monthly",
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.settingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          enabled: true,
          salaryAmount: 300,
          payPeriod: "monthly",
        }),
        update: { salaryAmount: 300, payPeriod: "monthly" },
      }),
    );
    expect(mocks.assignmentDeleteMany).not.toHaveBeenCalled();
  });

  it("disables a role and removes its assignments in the same transaction", async () => {
    mocks.roleDefFindUnique.mockResolvedValue({ id: "role-1" });
    mocks.settingFindUnique.mockResolvedValue(null);
    mocks.settingUpsert.mockResolvedValue({
      enabled: false,
      salaryAmount: 0,
      payPeriod: "weekly",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ roleKey: "banker", enabled: false }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.assignmentDeleteMany).toHaveBeenCalledWith({
      where: { classroomId: "classroom-1", classroomRoleId: "role-1" },
    });
  });

  it("rejects assignment to an explicitly disabled classroom role", async () => {
    mocks.studentFindUnique.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.roleDefFindUnique.mockResolvedValue({ id: "role-1" });
    mocks.settingFindUnique.mockResolvedValue({ enabled: false });

    const response = await ASSIGN(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ studentId: "student-1", roleKey: "banker" }),
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.assignmentCreate).not.toHaveBeenCalled();
  });

  it("rejects one-role replacement with an explicitly disabled role", async () => {
    mocks.studentFindUnique.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.roleDefFindUnique.mockResolvedValue({ id: "role-1" });
    mocks.settingFindUnique.mockResolvedValue({ enabled: false });

    const response = await SET_ROLE(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ studentId: "student-1", roleKey: "banker" }),
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.assignmentDeleteMany).not.toHaveBeenCalled();
  });
});
