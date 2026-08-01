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
  payPolicyFindUnique: vi.fn(),
  payPolicyUpsert: vi.fn(),
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
    classroomRolePayPolicy: {
      findUnique: mocks.payPolicyFindUnique,
      upsert: mocks.payPolicyUpsert,
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
import { PUT as SET_PAY_POLICY } from "./pay-policy/route";

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
  mocks.payPolicyFindUnique.mockResolvedValue(null);
});

describe("classroom role settings API", () => {
  it("keeps every legacy role enabled with zero compensation", async () => {
    const response = await GET(new Request("http://localhost"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.availableDefs).toEqual(roleDefs);
    expect(body.defs).toEqual(
      roleDefs.map((role) => ({
        ...role,
        enabled: true,
        salaryAmount: 0,
      })),
    );
    expect(body.assignments).toHaveLength(2);
  });

  it("falls back to 수동지급 주급 when the classroom has no pay policy row", async () => {
    const response = await GET(new Request("http://localhost"), context);
    const body = await response.json();

    expect(body.payPolicy).toEqual({
      payMode: "manual",
      payPeriod: "weekly",
      payAnchor: null,
    });
  });

  it("returns the stored classroom pay policy", async () => {
    mocks.payPolicyFindUnique.mockResolvedValue({
      payMode: "auto",
      payPeriod: "monthly",
      payAnchor: 10,
    });

    const response = await GET(new Request("http://localhost"), context);
    const body = await response.json();

    expect(body.payPolicy).toEqual({
      payMode: "auto",
      payPeriod: "monthly",
      payAnchor: 10,
    });
  });

  it("omits explicitly disabled roles and their stale assignments", async () => {
    mocks.settingFindMany.mockResolvedValue([
      {
        classroomRoleId: "role-2",
        enabled: false,
        salaryAmount: 100,
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
      { roleKey: "banker" },
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
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          roleKey: "banker",
          salaryAmount: 300,
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
        }),
        update: { salaryAmount: 300 },
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

// 지급 방식/주기/기준일은 학급 단위 한 행이다. 역할 수와 무관하게 쓰기 1회.
describe("classroom role pay policy API", () => {
  function payPolicyRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  it("upserts the classroom policy exactly once regardless of role count", async () => {
    mocks.payPolicyUpsert.mockResolvedValue({
      payMode: "auto",
      payPeriod: "weekly",
      payAnchor: 1,
    });

    const response = await SET_PAY_POLICY(
      payPolicyRequest({ payMode: "auto" }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      payMode: "auto",
      payPeriod: "weekly",
      payAnchor: 1,
    });
    expect(mocks.payPolicyUpsert).toHaveBeenCalledOnce();
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });

  it("clears the anchor when switching to 일급", async () => {
    mocks.payPolicyFindUnique.mockResolvedValue({
      payMode: "auto",
      payPeriod: "weekly",
      payAnchor: 3,
    });
    mocks.payPolicyUpsert.mockResolvedValue({
      payMode: "auto",
      payPeriod: "daily",
      payAnchor: null,
    });

    await SET_PAY_POLICY(payPolicyRequest({ payPeriod: "daily" }), context);

    expect(mocks.payPolicyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { payMode: "auto", payPeriod: "daily", payAnchor: null },
      }),
    );
  });

  it("resets the anchor to 1 when the period changes without one", async () => {
    mocks.payPolicyFindUnique.mockResolvedValue({
      payMode: "auto",
      payPeriod: "monthly",
      payAnchor: 25,
    });
    mocks.payPolicyUpsert.mockResolvedValue({
      payMode: "auto",
      payPeriod: "weekly",
      payAnchor: 1,
    });

    await SET_PAY_POLICY(payPolicyRequest({ payPeriod: "weekly" }), context);

    expect(mocks.payPolicyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { payMode: "auto", payPeriod: "weekly", payAnchor: 1 },
      }),
    );
  });

  it("rejects a weekday anchor outside 1~7 for 주급", async () => {
    mocks.payPolicyFindUnique.mockResolvedValue({
      payMode: "auto",
      payPeriod: "weekly",
      payAnchor: 1,
    });

    const response = await SET_PAY_POLICY(
      payPolicyRequest({ payAnchor: 20 }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.payPolicyUpsert).not.toHaveBeenCalled();
  });

  it("rejects an empty patch and non-teachers", async () => {
    const empty = await SET_PAY_POLICY(payPolicyRequest({}), context);
    expect(empty.status).toBe(400);

    mocks.classroomFindUnique.mockResolvedValue({ teacherId: "teacher-2" });
    const forbidden = await SET_PAY_POLICY(
      payPolicyRequest({ payMode: "auto" }),
      context,
    );
    expect(forbidden.status).toBe(403);
    expect(mocks.payPolicyUpsert).not.toHaveBeenCalled();
  });
});
