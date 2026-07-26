import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadingWeeklyMissionReward } from "@/lib/reading-missions";

import { WeeklyReadingMission } from "./WeeklyReadingMission";

function makeReward(
  overrides: Partial<ReadingWeeklyMissionReward> = {},
): ReadingWeeklyMissionReward {
  return {
    weekStart: "2026-07-20",
    weekEnd: "2026-07-27",
    amount: 50,
    completedCount: 1,
    totalCount: 3,
    achieved: false,
    claimed: false,
    claimable: true,
    totalStepCount: 5,
    achievedStepCount: 3,
    claimedStepCount: 0,
    claimableStepCount: 3,
    achievedAmount: 30,
    claimedAmount: 0,
    claimableAmount: 30,
    missions: [
      {
        key: "weekly_books",
        title: "읽은 책",
        description: "이번 주에 책 5권을 읽어 보세요.",
        target: 5,
        progress: 3,
        unit: "권",
        completed: false,
        amount: 50,
        claimed: false,
        claimable: true,
        claimedStepCount: 0,
        claimableStepCount: 3,
        steps: [
          {
            unit: 1,
            target: 1,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
          {
            unit: 2,
            target: 2,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
          {
            unit: 3,
            target: 3,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
          {
            unit: 4,
            target: 4,
            amount: 10,
            achieved: false,
            claimed: false,
            claimable: false,
          },
          {
            unit: 5,
            target: 5,
            amount: 10,
            achieved: false,
            claimed: false,
            claimable: false,
          },
        ],
      },
      {
        key: "consecutive_days",
        title: "연속 독서일",
        description: "3일 연속으로 독서 기록을 남겨 보세요.",
        target: 3,
        progress: 0,
        unit: "일",
        completed: false,
        amount: 30,
        claimed: false,
        claimable: false,
        steps: [
          {
            unit: 1,
            target: 1,
            amount: 10,
            achieved: false,
            claimed: false,
            claimable: false,
          },
          {
            unit: 2,
            target: 2,
            amount: 10,
            achieved: false,
            claimed: false,
            claimable: false,
          },
          {
            unit: 3,
            target: 3,
            amount: 10,
            achieved: false,
            claimed: false,
            claimable: false,
          },
        ],
      },
      {
        key: "reflection_chars",
        title: "감상문 글자수",
        description: "독서 감상을 모두 합쳐 600자 작성해 보세요.",
        target: 600,
        progress: 600,
        unit: "자",
        completed: true,
        amount: 30,
        claimed: false,
        claimable: true,
        claimedStepCount: 0,
        claimableStepCount: 3,
        steps: [
          {
            unit: 1,
            target: 200,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
          {
            unit: 2,
            target: 400,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
          {
            unit: 3,
            target: 600,
            amount: 10,
            achieved: true,
            claimed: false,
            claimable: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("WeeklyReadingMission", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          weeklyMissionReward: makeReward(),
        }),
      ),
    );
  });

  it("claims an intermediate step with missionKey and unit, then uses the response package", async () => {
    const claimedStepReward = makeReward({
      claimableAmount: 20,
      claimedStepCount: 1,
      claimableStepCount: 2,
      missions: makeReward().missions.map((mission) => {
        if (mission.key !== "weekly_books") return mission;
        return {
          ...mission,
          claimable: true,
          claimed: false,
          claimedStepCount: 1,
          claimableStepCount: 2,
          steps: mission.steps!.map((step) =>
            step.unit === 2
              ? { ...step, claimed: true, claimable: false }
              : step.unit === 1 || step.unit === 3
                ? { ...step, claimed: false, claimable: true }
                : step,
          ),
        };
      }),
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/student/reading" && (!init || !init.method || init.method === "GET")) {
        return jsonResponse({ weeklyMissionReward: makeReward() });
      }
      if (url === "/api/student/reading/rewards/claim" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          missionKey: "weekly_books",
          unit: 2,
        });
        return jsonResponse({
          weeklyMissionReward: claimedStepReward,
          missionKey: "weekly_books",
          unit: 2,
          rewardAmount: 10,
          idempotent: false,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WeeklyReadingMission initialReward={makeReward()} />);

    const intermediateButton = await screen.findByRole("button", {
      name: "읽은 책 2권 보상 10원 받기",
    });
    fireEvent.click(intermediateButton);

    await waitFor(() => {
      expect(screen.getByText("수령 완료")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "읽은 책 2권 보상 10원 받기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "읽은 책 1권 보상 10원 받기" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "읽은 책 3권 보상 10원 받기" }),
    ).toBeEnabled();
  });

  it("claims the final reflection step and refreshes claimed state from the response", async () => {
    const finalClaimedReward = makeReward({
      claimableAmount: 20,
      claimedStepCount: 1,
      claimableStepCount: 2,
      completedCount: 1,
      missions: makeReward().missions.map((mission) => {
        if (mission.key !== "reflection_chars") return mission;
        return {
          ...mission,
          claimed: true,
          claimable: false,
          completed: true,
          claimedStepCount: 3,
          claimableStepCount: 0,
          steps: mission.steps!.map((step) => ({
            ...step,
            claimed: true,
            claimable: false,
            achieved: true,
          })),
        };
      }),
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/student/reading" && (!init || !init.method || init.method === "GET")) {
        return jsonResponse({ weeklyMissionReward: makeReward() });
      }
      if (url === "/api/student/reading/rewards/claim" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          missionKey: "reflection_chars",
          unit: 3,
        });
        return jsonResponse({
          weeklyMissionReward: finalClaimedReward,
          missionKey: "reflection_chars",
          unit: 3,
          rewardAmount: 10,
          idempotent: false,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WeeklyReadingMission initialReward={makeReward()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "감상문 글자수 600자 보상 10원 받기",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /감상문 글자수 .* 보상 10원/ }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("수령 완료").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the failed step retryable after an API error and still allows a later successful claim", async () => {
    const afterClaimReward = makeReward({
      claimableAmount: 20,
      claimedStepCount: 1,
      claimableStepCount: 2,
      missions: makeReward().missions.map((mission) => {
        if (mission.key !== "weekly_books") return mission;
        return {
          ...mission,
          claimedStepCount: 1,
          claimableStepCount: 2,
          steps: mission.steps!.map((step) =>
            step.unit === 1
              ? { ...step, claimed: true, claimable: false }
              : step,
          ),
        };
      }),
    });

    let claimAttempts = 0;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/student/reading" && (!init || !init.method || init.method === "GET")) {
        return jsonResponse({ weeklyMissionReward: makeReward() });
      }
      if (url === "/api/student/reading/rewards/claim" && init?.method === "POST") {
        claimAttempts += 1;
        const body = JSON.parse(String(init.body)) as {
          missionKey: string;
          unit: number;
        };
        expect(body).toEqual({ missionKey: "weekly_books", unit: 1 });
        if (claimAttempts === 1) {
          return jsonResponse({ error: "reward_not_achieved" }, false, 409);
        }
        return jsonResponse({
          weeklyMissionReward: afterClaimReward,
          missionKey: "weekly_books",
          unit: 1,
          rewardAmount: 10,
          idempotent: false,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WeeklyReadingMission initialReward={makeReward()} />);

    const firstStepButton = await screen.findByRole("button", {
      name: "읽은 책 1권 보상 10원 받기",
    });
    fireEvent.click(firstStepButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "아직 이 미션을 완료하지 않았어요.",
    );
    const retryButton = screen.getByRole("button", {
      name: "읽은 책 1권 보상 10원 다시 시도",
    });
    expect(retryButton).toBeEnabled();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /읽은 책 1권 보상 10원/ }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("수령 완료")).toBeInTheDocument();
    expect(claimAttempts).toBe(2);
  });
});
