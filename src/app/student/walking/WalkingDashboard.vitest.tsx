import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalkingDashboard, walkingAverageSteps } from "./WalkingDashboard";

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

const title = {
  key: "weekly-50k",
  label: "꾸준한 발걸음",
  imagePath: "/walking/titles/weekly-50k-pixel-512.png",
  requirement: "주간 50,000보",
  effectKey: "growth_speed",
  buffBps: 100,
  earned: true,
  claimed: false,
};

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        day: "2026-07-26",
        steps: 30_000,
        distanceMeters: 21_000,
        syncedAt: "2026-07-26T01:00:00.000Z",
      },
    ],
    range: { weekStart: "2026-07-20", weekEnd: "2026-07-26" },
    monthlyAttendanceReward: {
      month: "2026-07",
      monthDays: 31,
      attendanceCount: 3,
      visitCount: 4,
      claimedOrdinals: [1, 2, 3],
      claimableAttendance: [{ ordinal: 4, day: "2026-07-26" }],
      cashPaid: 30,
      itemRewardOrdinal: 28,
      itemEarned: false,
    },
    dailyStepRewards: {
      day: "2026-07-26",
      totalSteps: 30_000,
      tiers: [{ key: "unit1", unit: 1, steps: 10_000, amount: 10, achieved: true, claimed: false, claimable: true }],
    },
    weeklyStepRewards: {
      weekStart: "2026-07-20",
      totalSteps: 30_000,
      maxSteps: 75_000,
      tiers: [{ key: "tier1", steps: 25_000, amount: 20, achieved: true, claimed: false }],
    },
    classroomTopFive: [{
      studentId: "student-1",
      studentNumber: 1,
      studentName: "김학생",
      weeklySteps: 30_000,
      isCurrent: true,
      rewardAmount: 100,
    }],
    classroomRankRewards: [{ weekStart: "2026-07-13", rank: 1, amount: 100 }],
    classroomRankNextResetAt: "2026-07-27T00:00:00.000Z",
    titles: [title],
    ...overrides,
  };
}

async function openMissions() {
  fireEvent.click(await screen.findByRole("tab", { name: "미션" }));
}

describe("WalkingDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calculates a partial-week average from elapsed days only", () => {
    const rows = [
      { day: "2026-07-20", steps: 1_000, distanceMeters: 700, syncedAt: "2026-07-20T03:00:00.000Z" },
      { day: "2026-07-21", steps: 2_000, distanceMeters: 1_400, syncedAt: "2026-07-21T03:00:00.000Z" },
      { day: "2026-07-22", steps: 0, distanceMeters: 0, syncedAt: null },
      { day: "2026-07-23", steps: 0, distanceMeters: 0, syncedAt: null },
      { day: "2026-07-24", steps: 0, distanceMeters: 0, syncedAt: null },
      { day: "2026-07-25", steps: 0, distanceMeters: 0, syncedAt: null },
      { day: "2026-07-26", steps: 0, distanceMeters: 0, syncedAt: null },
    ];
    expect(walkingAverageSteps(rows, "2026-07-22")).toBe(1_000);
  });

  it("renders reward tiers without duplicate React keys when legacy keys repeat", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          snapshot({
            dailyStepRewards: {
              day: "2026-07-26",
              totalSteps: 30_000,
              tiers: [
                { key: "legacy", unit: 1, steps: 10_000, amount: 10, achieved: true, claimed: false },
                { key: "legacy", unit: 2, steps: 20_000, amount: 20, achieved: true, claimed: false },
              ],
            },
          }),
        ),
      ),
    );

    render(<WalkingDashboard initialView="missions" />);
    await screen.findByRole("region", { name: "일간미션" });

    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('unique "key" prop'),
      ),
    ).toBe(false);
  });

  it("claims daily and weekly rewards, reloading authoritative claimed state after each save", async () => {
    const dailyClaimed = snapshot({
      dailyStepRewards: {
        day: "2026-07-26",
        totalSteps: 30_000,
        tiers: [{ key: "unit1", unit: 1, steps: 10_000, amount: 10, achieved: true, claimed: true, claimable: false }],
      },
    });
    const bothClaimed = {
      ...dailyClaimed,
      weeklyStepRewards: {
        weekStart: "2026-07-20",
        totalSteps: 30_000,
        maxSteps: 75_000,
        tiers: [{ key: "tier1", steps: 25_000, amount: 20, achieved: true, claimed: true }],
      },
    };
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ attendance: snapshot().monthlyAttendanceReward }))
      .mockImplementationOnce(() => json(snapshot()))
      .mockImplementationOnce(() => json({ dailyTier: { unit: 1, claimed: true } }))
      .mockImplementationOnce(() => json(dailyClaimed))
      .mockImplementationOnce(() => json({ tier: { key: "tier1", claimed: true } }))
      .mockImplementationOnce(() => json(bothClaimed));
    vi.stubGlobal("fetch", fetchMock);
    render(<WalkingDashboard />);
    await openMissions();

    const daily = screen.getByRole("region", { name: "일간미션" });
    fireEvent.click(within(daily).getByRole("button", { name: "보상 받기" }));
    expect(await within(daily).findByRole("button", { name: "수령 완료" })).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/student/attendance");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/walking?week=current");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ kind: "daily", unit: 1 });
    expect(fetchMock.mock.calls[3][0]).toBe("/api/student/walking?week=current");

    const weekly = screen.getByRole("region", { name: "주간미션" });
    fireEvent.click(within(weekly).getByRole("button", { name: "보상 받기" }));
    expect(await within(weekly).findByRole("button", { name: "수령 완료" })).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string)).toEqual({ kind: "weekly", tierKey: "tier1" });
    expect(fetchMock.mock.calls[5][0]).toBe("/api/student/walking?week=current");
  });

  it("claims attendance and a title, preserving both states from subsequent reloads", async () => {
    const attendanceClaimed = snapshot({
      monthlyAttendanceReward: {
        month: "2026-07",
        monthDays: 31,
        attendanceCount: 4,
        visitCount: 4,
        claimedOrdinals: [1, 2, 3, 4],
        claimableAttendance: [],
        cashPaid: 40,
        itemRewardOrdinal: 28,
        itemEarned: false,
      },
    });
    const titleClaimed = {
      ...attendanceClaimed,
      titles: [{ ...title, claimed: true }],
    };
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ attendance: snapshot().monthlyAttendanceReward }))
      .mockImplementationOnce(() => json(snapshot()))
      .mockImplementationOnce(() => json({ attendance: attendanceClaimed.monthlyAttendanceReward }))
      .mockImplementationOnce(() => json(attendanceClaimed))
      .mockImplementationOnce(() => json({ titles: titleClaimed.titles }))
      .mockImplementationOnce(() => json(titleClaimed));
    vi.stubGlobal("fetch", fetchMock);
    render(<WalkingDashboard />);
    await openMissions();

    fireEvent.click(screen.getByRole("button", { name: "출석 보상 받기" }));
    expect(await screen.findByText("지금 받을 수 있는 출석 보상이 없어요.")).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ day: "2026-07-26" });

    fireEvent.click(screen.getByRole("button", { name: "칭호 받기" }));
    expect(await screen.findByRole("button", { name: "수령 완료" })).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string)).toEqual({ titleKey: title.key });
    expect(fetchMock.mock.calls[5][0]).toBe("/api/student/walking?week=current");
  });

  it("claims a classroom rank reward and removes it only after the server reload", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ attendance: snapshot().monthlyAttendanceReward }))
      .mockImplementationOnce(() => json(snapshot()))
      .mockImplementationOnce(() => json({ classroomRankReward: { weekStart: "2026-07-13", rank: 1, amount: 100, claimed: true } }))
      .mockImplementationOnce(() => json(snapshot({ classroomRankRewards: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<WalkingDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "보상 받기" }));
    expect(await screen.findByText("1등 보상을 받았어요.")).toBeTruthy();
    expect(screen.queryByText("2026-07-13 주간 · 100원")).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      kind: "classroom_rank",
      weekStart: "2026-07-13",
    });
    expect(fetchMock.mock.calls[3][0]).toBe("/api/student/walking?week=current");
  });

  it("keeps claimable state and reports the server error when a reward claim fails", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ attendance: snapshot().monthlyAttendanceReward }))
      .mockImplementationOnce(() => json(snapshot()))
      .mockImplementationOnce(() => json({ error: "reward_not_achieved" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<WalkingDashboard />);
    await openMissions();

    const daily = screen.getByRole("region", { name: "일간미션" });
    fireEvent.click(within(daily).getByRole("button", { name: "보상 받기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("목표를 먼저 달성해 주세요.");
    expect(within(daily).getByRole("button", { name: "보상 받기" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
