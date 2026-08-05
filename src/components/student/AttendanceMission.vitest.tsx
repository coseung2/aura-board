import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttendanceMission } from "./AttendanceMission";

const attendance = {
  month: "2026-07",
  monthDays: 28,
  attendanceCount: 2,
  attendanceDays: ["2026-07-01", "2026-07-02"],
  visitCount: 2,
  claimedOrdinals: [1, 2],
  claimableAttendance: [],
  itemRewardOrdinal: 28,
  itemEarned: false,
  nextOrdinalReward: { ordinal: 3, type: "cash" as const, amount: 10 },
};

describe("AttendanceMission", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attendance: { ...attendance, attendanceCount: 3 } }),
    }));
  });

  it("records the app visit and updates the shared monthly progress", async () => {
    render(<AttendanceMission attendance={attendance} />);

    expect(screen.getByText("2 / 28회")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("3 / 28회")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/student/attendance", { method: "POST" });
  });
});
