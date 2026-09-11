import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), comment: vi.fn(), transaction: vi.fn(), claim: vi.fn(), outbox: vi.fn() }));
vi.mock("@/lib/card-engagement-actor", () => ({ getCurrentCardActor: mocks.actor }));
vi.mock("@/lib/db", () => ({ db: { cardComment: { findFirst: mocks.comment }, transaction: { findFirst: mocks.transaction }, commentRewardClaim: { findUnique: mocks.claim }, notificationOutbox: { findUnique: mocks.outbox } } }));
import { GET } from "./route";
const request = () => GET(new Request("http://localhost"), { params: Promise.resolve({ id: "card", commentId: "comment" }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ kind: "student", id: "student" });
  mocks.comment.mockResolvedValue({ id: "comment", content: "좋은 글이에요" });
  mocks.transaction.mockResolvedValue(null);
  mocks.claim.mockResolvedValue({ id: "claim" });
  mocks.outbox.mockResolvedValue({ status: "pending", payload: {} });
});
it("requires authentication and restricts lookup to the author", async () => {
  mocks.actor.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  mocks.actor.mockResolvedValue({ kind: "student", id: "student" });
  mocks.comment.mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect(mocks.comment).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ authorStudentId: "student", cardId: "card" }) }));
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it.each(["daily_cap", "weekly_cap", "disabled", "too_short", "duplicate"])("returns the persisted exclusion %s", async (reason) => {
  mocks.outbox.mockResolvedValue({ status: "done", payload: { rewardOutcome: reason, minimumLength: 6 } });
  const result = await (await request()).json();
  expect(result.status).toBe("excluded");
  expect(result.message).toBeTruthy();
});
it("reports actual payment before a stale exclusion and distinguishes pending", async () => {
  expect((await (await request()).json()).status).toBe("pending");
  mocks.transaction.mockResolvedValue({ amount: 7 });
  expect(await (await request()).json()).toMatchObject({ status: "paid", amount: 7 });
});
it("does not invent an exclusion when historical outcome is missing", async () => {
  mocks.outbox.mockResolvedValue({ status: "done", payload: {} });
  expect((await (await request()).json()).status).toBe("unavailable");
});
