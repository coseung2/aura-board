import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getStudentMonthlyAttendance: vi.fn(),
  recordStudentAttendanceVisit: vi.fn(),
  claimStudentAttendanceReward: vi.fn(),
  isValidAttendanceDay: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/student-attendance", () => ({
  getStudentMonthlyAttendance: mocks.getStudentMonthlyAttendance,
  recordStudentAttendanceVisit: mocks.recordStudentAttendanceVisit,
  claimStudentAttendanceReward: mocks.claimStudentAttendanceReward,
  isValidAttendanceDay: (value: string) =>
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) &&
    value !== "2026-02-31",
}));

import { GET, PATCH, POST } from "./route";

const attendance = {
  month: "2026-07",
  monthDays: 28,
  attendanceCount: 3,
  attendanceDays: ["2026-07-01", "2026-07-02", "2026-07-03"],
  itemRewardOrdinal: 28,
  itemEarned: false,
  nextOrdinalReward: { ordinal: 4, type: "cash" as const, amount: 10 },
};

describe("student attendance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.getStudentMonthlyAttendance.mockResolvedValue(attendance);
    mocks.recordStudentAttendanceVisit.mockResolvedValue(attendance);
    mocks.claimStudentAttendanceReward.mockResolvedValue(attendance);
  });

  it("returns the common attendance board for the signed-in student", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ attendance });
    expect(mocks.getStudentMonthlyAttendance).toHaveBeenCalledWith("student-1");
  });

  it("records an idempotent app visit before returning the shared board", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ attendance });
    expect(mocks.recordStudentAttendanceVisit).toHaveBeenCalledWith({
      id: "student-1",
      classroomId: "classroom-1",
    });
  });

  it("rejects unauthenticated attendance reads", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects impossible calendar dates before attempting the SQL date cast", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/student/attendance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day: "2026-02-31" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_day" });
    expect(mocks.claimStudentAttendanceReward).not.toHaveBeenCalled();
  });
});
