import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/boards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/boards category invariant", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFindUnique.mockReset();
    mocks.transaction.mockReset();
  });

  it("rejects an official game submitted as LESSON before any DB write", async () => {
    const response = await POST(
      request({ title: "오목", layout: "omok", category: "LESSON" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "category_layout_mismatch" });
    expect(mocks.classroomFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-official layout submitted as PLAY", async () => {
    const response = await POST(
      request({ title: "퀴즈", layout: "quiz", category: "PLAY" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "category_layout_mismatch" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
