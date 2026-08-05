import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalkingAttendanceCalendar } from "./WalkingAttendanceCalendar";

describe("WalkingAttendanceCalendar monthly rewards", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the mobile cookie, coin, gift, and attendance stamp assets without placeholder copy", () => {
    render(
      <WalkingAttendanceCalendar
        month="2026-07"
        monthDays={28}
        attendanceCount={28}
      />,
    );

    for (const ordinal of [7, 14, 21]) {
      const cell = screen.getByRole("button", {
        name: `${ordinal}일차, 20원 + 쿠키 1개, 출석 도장 완료`,
      });
      expect(
        cell.querySelector(".student-mobile-calendar-reward.is-cookie img"),
      ).toBeInTheDocument();
      expect(cell).toHaveTextContent("x1");
      expect(
        cell.querySelector(".student-walking-ordinal-stamp"),
      ).toBeInTheDocument();
    }

    const itemCell = screen.getByRole("button", {
      name: "28일차, 아이템 보상, 출석 도장 완료",
    });
    expect(itemCell).toHaveTextContent("🎁");
    expect(itemCell).toHaveTextContent("x1");
    expect(
      itemCell.querySelector(".student-mobile-calendar-reward.is-cookie img"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("보상 자리")).not.toBeInTheDocument();
  });

  it("claims the visited day directly from its calendar cell", () => {
    const onClaim = vi.fn();
    render(
      <WalkingAttendanceCalendar
        month="2026-07"
        monthDays={28}
        attendanceCount={1}
        visitCount={2}
        claimedOrdinals={[1]}
        claimableAttendance={[{ ordinal: 2, day: "2026-07-02" }]}
        onClaim={onClaim}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "2일차, 10원, 보상 받기",
      }),
    );

    expect(onClaim).toHaveBeenCalledWith("2026-07-02");
  });
});
