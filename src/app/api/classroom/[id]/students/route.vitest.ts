import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindUnique: vi.fn(),
  studentFindMany: vi.fn(),
  studentCreate: vi.fn(),
  transaction: vi.fn(),
  generateQrToken: vi.fn(),
  generateTextCode: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: vi.fn() }));
vi.mock("@/lib/classroom-utils", () => ({
  generateQrToken: mocks.generateQrToken,
  generateTextCode: mocks.generateTextCode,
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    student: {
      findMany: mocks.studentFindMany,
      create: mocks.studentCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
  mocks.classroomFindUnique.mockResolvedValue({ id: "classroom-1", teacherId: "teacher-1" });
  mocks.studentFindMany.mockResolvedValue([]);
  mocks.generateQrToken.mockReturnValueOnce("qr-1").mockReturnValueOnce("qr-2");
  mocks.generateTextCode.mockResolvedValueOnce("ABC123").mockResolvedValueOnce("DEF456");
  mocks.studentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `student-${String(data.number)}`,
    ...data,
    createdAt: new Date("2026-09-16T00:00:00.000Z"),
  }));
  mocks.transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
});

describe("POST /api/classroom/:id/students", () => {
  it("persists optional gender from bulk roster imports", async () => {
    const response = await POST(
      new Request("https://example.test/api/classroom/classroom-1/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          students: [
            { number: 1, name: "홍길동", gender: "male" },
            { number: 2, name: "김영희", gender: "female" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "classroom-1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.studentCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        classroomId: "classroom-1",
        number: 1,
        name: "홍길동",
        gender: "male",
      }),
    });
    expect(mocks.studentCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        classroomId: "classroom-1",
        number: 2,
        name: "김영희",
        gender: "female",
      }),
    });
  });
});
