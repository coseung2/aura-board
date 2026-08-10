import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomDashboardSections } from "./ClassroomDashboardSections";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/client-lookup-cache", () => ({
  notifyClassroomListChanged: vi.fn(),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  refresh.mockReset();
});

describe("ClassroomDashboardSections", () => {
  it("renders a read-only summary without former navigation controls", () => {
    render(
      <ClassroomDashboardSections
        classroomId="classroom-1"
        classroomName="햇살반"
        summaryKpis={[
          { label: "학생 수", value: "24명" },
          { label: "연결 보드", value: "3개" },
          { label: "1인1역 배정", value: "18/24" },
          { label: "포트폴리오", value: "42개" },
          { label: "학급 코드", value: "A1B2C3" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "햇살반" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "학급 현황" })).toBeTruthy();
    expect(screen.getByText("24명")).toBeTruthy();
    expect(screen.getByText("3개")).toBeTruthy();
    expect(screen.getByText("18/24")).toBeTruthy();
    expect(screen.getByText("42개")).toBeTruthy();
    expect(screen.getByText("A1B2C3")).toBeTruthy();

    expect(screen.getByRole("button", { name: "학급 이름 수정" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "학급 삭제" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    for (const value of ["24명", "3개", "18/24", "42개", "A1B2C3"]) {
      const valueNode = screen.getByText(value);
      expect(valueNode.closest("a")).toBeNull();
      expect(valueNode.closest("button")).toBeNull();
    }

    for (const label of [
      "대시보드",
      "학생 명단",
      "자리 배치",
      "학급 보드",
      "금융 관리",
      "포트폴리오",
      "1인1역",
      "과제",
      "청소",
    ]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
      expect(screen.queryByRole("tab", { name: label })).toBeNull();
    }
  });
});
