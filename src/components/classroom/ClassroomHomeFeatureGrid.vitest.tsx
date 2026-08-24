import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassroomHomeFeatureGrid } from "./ClassroomHomeFeatureGrid";
import type { ClassroomHomeSummary } from "@/lib/classroom-home-summary";

const summary: ClassroomHomeSummary = {
  students: { total: 24 },
  groups: { groupCount: 6, seatedCount: 18 },
  boards: { count: 3 },
  roles: { assignedCount: 20 },
  morning: { dutyCount: 2, findingCount: 1 },
  assignments: { missingCount: 5 },
  checks: { activeCount: 4 },
  bank: {
    totalBalance: 125000,
    accountCount: 24,
    transactionCount: 320,
    unitLabel: "원",
  },
  pay: { todayChargeCount: 3 },
  store: { itemCount: 12 },
  portfolio: { itemCount: 42 },
  reading: { logCount: 17 },
  walking: { connectedCount: 10, todaySteps: 45200 },
  banners: { pendingCount: 2 },
  parents: { pendingCount: 1, activeCount: 8 },
};

describe("ClassroomHomeFeatureGrid", () => {
  it("keeps teacher tasks and omits student role execution cards", () => {
    render(
      <ClassroomHomeFeatureGrid classroomId="classroom-1" summary={summary} />,
    );

    expect(
      screen.getByRole("navigation", { name: "학급 기능 요약" }),
    ).toBeTruthy();

    const expectedLinks = [
      ["학생 명단", "/classroom/classroom-1/students"],
      ["자리·모둠", "/classroom/classroom-1/groups"],
      ["보드 연결", "/classroom/classroom-1/boards"],
      ["학부모 액세스", "/classroom/classroom-1/parent-access"],
      ["1인1역", "/classroom/classroom-1/roles"],
      ["과제 현황", "/classroom/classroom-1/assignments"],
      ["은행", "/classroom/classroom-1/bank"],
      ["포트폴리오", "/classroom/classroom-1/portfolio"],
      ["독서", "/classroom/classroom-1/reading"],
      ["걷기", "/classroom/classroom-1/walking"],
      ["일일 배너", "/classroom/classroom-1/daily-banners"],
    ] as const;

    for (const [label, href] of expectedLinks) {
      const link = screen.getByRole("link", { name: new RegExp(label) });
      expect(link.getAttribute("href")).toBe(href);
    }

    for (const label of ["청소·당번", "제출 체크", "QR결제", "매점"]) {
      expect(screen.queryByRole("link", { name: new RegExp(label) })).toBeNull();
    }
  });

  it("shows the headline metrics for the remaining teacher features", () => {
    render(
      <ClassroomHomeFeatureGrid classroomId="classroom-1" summary={summary} />,
    );

    for (const metric of [
      "24명",
      "모둠 6개",
      "자리 배정 18/24명",
      "3개",
      "20/24명",
      "미제출 5건",
      "125,000원",
      "42개",
      "17건",
      "학급 합계 45,200걸음",
      "대기 2건",
    ]) {
      expect(screen.getByText(metric)).toBeTruthy();
    }
  });

  it("does not render decorative emoji in feature cards", () => {
    const { container } = render(
      <ClassroomHomeFeatureGrid classroomId="classroom-1" summary={summary} />,
    );

    expect(container.querySelector(".classroom-home-summary-emoji")).toBeNull();
  });

  it("uses assignment-style head bars instead of boxed cards", () => {
    const { container } = render(
      <ClassroomHomeFeatureGrid classroomId="classroom-1" summary={summary} />,
    );

    expect(container.querySelectorAll(".classroom-home-summary-head")).toHaveLength(11);
    expect(container.querySelector(".classroom-home-summary-arrow")).toBeNull();
    expect(container.querySelector(".classroom-home-summary-body")).toBeNull();
  });
});
