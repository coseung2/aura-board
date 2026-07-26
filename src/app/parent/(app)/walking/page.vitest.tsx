import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

import ParentWalkingPage from "./page";

const week = {
  weekStart: "2026-07-20",
  weekEnd: "2026-07-26",
  today: "2026-07-22",
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function response(children: unknown[]) {
  return { week, children };
}

function child(
  studentId: string,
  name: string,
  rows: Array<{ day: string; steps: number }> = [],
) {
  return {
    studentId,
    name,
    number: null,
    classroom: { id: "classroom-1", name: "햇살반" },
    rows,
  };
}

describe("ParentWalkingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains how to link a child when there are no linked children", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(response([]))));

    render(<ParentWalkingPage />);

    expect(await screen.findByRole("heading", { name: "연결된 자녀가 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "자녀 연결하기" }).getAttribute("href")).toBe(
      "/parent/onboard/match/code",
    );
  });

  it("renders multiple children with today, weekly, and average metrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          response([
            child("student-1", "하늘", [
              { day: "2026-07-20", steps: 1_000 },
              { day: "2026-07-22", steps: 3_000 },
            ]),
            child("student-2", "별", [{ day: "2026-07-21", steps: 2_000 }]),
          ]),
        ),
      ),
    );

    render(<ParentWalkingPage />);

    expect(await screen.findByRole("heading", { name: "자녀별 걷기 기록" })).toBeTruthy();
    expect(screen.getByText("2명")).toBeTruthy();

    const sky = screen.getByRole("article", { name: "하늘 걷기 기록" });
    expect(within(sky).getByText("1,333")).toBeTruthy();
    expect(within(sky).getByText("4,000")).toBeTruthy();
    expect(within(sky).getAllByText("3,000").length).toBeGreaterThan(0);

    const star = screen.getByRole("article", { name: "별 걷기 기록" });
    expect(within(star).getAllByText("2,000").length).toBeGreaterThan(0);
    expect(within(star).getByText("667")).toBeTruthy();
  });

  it("uses elapsed days for a partial-week average and keeps zero-step days visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          response([
            child("student-1", "해봄", [{ day: "2026-07-20", steps: 1_000 }]),
          ]),
        ),
      ),
    );

    render(<ParentWalkingPage />);

    const card = await screen.findByRole("article", { name: "해봄 걷기 기록" });
    expect(within(card).getByText("333")).toBeTruthy();
    expect(within(card).getAllByText("1,000").length).toBeGreaterThan(0);
    expect(within(card).queryByText("이번 주에는 아직 기록이 없어요.")).toBeNull();
    expect(within(card).getByRole("listitem", { name: /오늘 0걸음/ })).toBeTruthy();
    expect(within(card).getByText("3일 기준 평균")).toBeTruthy();
  });

  it("offers retry after a fetch error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(() => json(response([child("student-1", "다시")])));
    vi.stubGlobal("fetch", fetchMock);

    render(<ParentWalkingPage />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("article", { name: "다시 걷기 기록" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redirects expired parent sessions to parent login", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ error: "unauthorized" }, 401)));

    render(<ParentWalkingPage />);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?role=parent&error=session_required",
      ),
    );
  });
});
