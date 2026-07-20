import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { WalkingAttendanceCalendar } from "./WalkingAttendanceCalendar";

describe("WalkingAttendanceCalendar monthly rewards", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows one cookie alongside the 20-won milestones and keeps day 28 as the item reward", () => {
    render(
      <WalkingAttendanceCalendar
        studentId="student-1"
        month="2026-07"
        monthDays={28}
        attendanceCount={28}
      />,
    );

    for (const ordinal of [7, 14, 21]) {
      const cell = screen.getByRole("button", {
        name: `${ordinal}번, 20원 + 쿠키 1개, 출석 도장 찍기`,
      });
      expect(cell).toHaveTextContent("20원");
      expect(cell).toHaveTextContent("쿠키 1개");
      expect(cell.className).not.toContain("is-item-reward");
    }

    const itemCell = screen.getByRole("button", {
      name: "28번, 아이템 보상, 출석 도장 찍기",
    });
    expect(itemCell).toHaveTextContent("아이템");
    expect(itemCell).toHaveTextContent("보상 자리");
    expect(itemCell).not.toHaveTextContent("쿠키 1개");
  });
});
