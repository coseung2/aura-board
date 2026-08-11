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
  it("summarizes every child page as a link card", () => {
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
      ["청소·당번", "/classroom/classroom-1/morning"],
      ["과제 현황", "/classroom/classroom-1/assignments"],
      ["제출 체크", "/classroom/classroom-1/check"],
      ["금융 관리", "/classroom/classroom-1/bank"],
      ["QR결제", "/classroom/classroom-1/pay"],
      ["매점", "/classroom/classroom-1/store"],
      ["포트폴리오", "/classroom/classroom-1/portfolio"],
      ["독서", "/classroom/classroom-1/reading"],
      ["걷기 현황", "/classroom/classroom-1/walking"],
      ["일일 배너", "/classroom/classroom-1/daily-banners"],
    ] as const;

    for (const [label, href] of expectedLinks) {
      const link = screen.getByRole("link", { name: new RegExp(label) });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("shows the headline metrics next to each feature", () => {
    render(
      <ClassroomHomeFeatureGrid classroomId="classroom-1" summary={summary} />,
    );

    for (const metric of [
      "24명",
      "모둠 6개",
      "자리 배정 18/24명",
      "3개",
      "20/24명",
      "당번 2명",
      "미제출 5건",
      "진행 4개",
      "125,000원",
      "오늘 3건",
      "상품 12개",
      "42개",
      "17건",
      "오늘 45,200걸음",
      "대기 2건",
    ]) {
      expect(screen.getByText(metric)).toBeTruthy();
    }
  });
});
