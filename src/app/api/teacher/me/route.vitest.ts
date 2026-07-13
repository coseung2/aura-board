import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  disconnectTeacherCanva: vi.fn(),
  transaction: vi.fn(),
  classroomDeleteMany: vi.fn(),
  cardUpdateMany: vi.fn(),
  submissionUpdateMany: vi.fn(),
  submissionReviewDeleteMany: vi.fn(),
  userDelete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/canva", () => ({
  disconnectTeacherCanva: mocks.disconnectTeacherCanva,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));

import { DELETE } from "./route";

describe("DELETE /api/teacher/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.disconnectTeacherCanva.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        classroom: { deleteMany: mocks.classroomDeleteMany },
        card: { updateMany: mocks.cardUpdateMany },
        submission: { updateMany: mocks.submissionUpdateMany },
        submissionReview: { deleteMany: mocks.submissionReviewDeleteMany },
        user: { delete: mocks.userDelete },
      }),
    );
  });

  it("disconnects Canva before deleting the account", async () => {
    const events: string[] = [];
    mocks.disconnectTeacherCanva.mockImplementation(async () => {
      events.push("canva");
      return true;
    });
    mocks.userDelete.mockImplementation(async () => {
      events.push("user");
    });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mocks.disconnectTeacherCanva).toHaveBeenCalledWith("teacher-1");
    expect(events).toEqual(["canva", "user"]);
  });

  it("does not mutate account data when Canva revocation fails", async () => {
    mocks.disconnectTeacherCanva.mockResolvedValue(false);

    const response = await DELETE();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "canva_disconnect_failed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.classroomDeleteMany).not.toHaveBeenCalled();
    expect(mocks.cardUpdateMany).not.toHaveBeenCalled();
    expect(mocks.submissionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.submissionReviewDeleteMany).not.toHaveBeenCalled();
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("does not mutate account data when Canva revocation throws", async () => {
    mocks.disconnectTeacherCanva.mockRejectedValue(new Error("revoke failed"));

    const response = await DELETE();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "canva_disconnect_failed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("does not revoke Canva or delete data for unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(mocks.disconnectTeacherCanva).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });
});
