import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  processNext: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCronRequest: mocks.authorized,
}));
vi.mock("@/lib/reading-feedback-worker", () => ({
  processNextReadingFeedback: mocks.processNext,
}));

import { POST } from "./route";

function request() {
  return new Request("https://aura-board.example/api/cron/reading-feedback", {
    method: "POST",
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("POST /api/cron/reading-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorized.mockReturnValue(true);
    mocks.processNext.mockResolvedValue({ outcome: "idle" });
  });

  it("rejects unauthorized requests before processing records", async () => {
    mocks.authorized.mockReturnValueOnce(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(mocks.processNext).not.toHaveBeenCalled();
  });

  it("processes at most the worker's single claimed record", async () => {
    mocks.processNext.mockResolvedValueOnce({
      outcome: "generated",
      logId: "log-1",
      score: 8,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      outcome: "generated",
      logId: "log-1",
      score: 8,
    });
    expect(mocks.processNext).toHaveBeenCalledTimes(1);
  });
});
