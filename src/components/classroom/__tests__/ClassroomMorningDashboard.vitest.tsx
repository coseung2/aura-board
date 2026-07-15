import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassroomMorningDashboard } from "../ClassroomMorningDashboard";

const fetchMorningSummaryMock = vi.hoisted(() => vi.fn());
const fetchCleaningDutiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/inspections-client", () => ({
  fetchMorningSummary: fetchMorningSummaryMock,
  fetchCleaningDuties: fetchCleaningDutiesMock,
  saveShoeFindings: vi.fn(),
}));

vi.mock("@/hooks/useClassroomMorningRealtime", () => ({
  useClassroomMorningRealtime: vi.fn(),
}));

vi.mock("@/components/AppBackground", () => ({
  AppBackgroundButton: () => null,
}));

describe("ClassroomMorningDashboard cleaning duties", () => {
  beforeEach(() => {
    fetchMorningSummaryMock.mockReset();
    fetchCleaningDutiesMock.mockReset();
    fetchMorningSummaryMock.mockResolvedValue({
      date: "2026-07-10",
      classroomName: "1반",
      kpis: {
        totalStudents: 1,
        missingAssignmentCount: 0,
        missingAssignmentBoardCount: 0,
        cleaningDirtyCount: 0,
        shoeNotArrangedCount: 0,
      },
      missingAssignments: [],
      missingAssignmentBoards: [],
      cleaningFindings: [],
      shoeFindings: [],
    });
    fetchCleaningDutiesMock.mockRejectedValue(
      new Error("청소 당번을 불러오지 못했습니다."),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ends the duty loading state and exposes a scoped error", async () => {
    render(
      <ClassroomMorningDashboard
        classroomId="classroom-a"
        classroomName="1반"
      />,
    );

    expect(screen.queryByRole("heading", { name: "게시판" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "게시판" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /학급 대시보드/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "배경 설정" })).toBeTruthy();
    await screen.findByRole("tablist", { name: "1인1역할" });
    expect(
      screen.getByRole("tab", { name: "교실 청소" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "청소 당번을 불러오지 못했습니다.",
      );
    });
    expect(screen.queryByText("표시할 아침 정보가 없습니다.")).toBeNull();
  });

  it("switches the selected role panel with keyboard tab navigation", async () => {
    fetchCleaningDutiesMock.mockResolvedValue({ duties: [] });
    fetchMorningSummaryMock.mockResolvedValue({
      date: "2026-07-10",
      classroomName: "1반",
      kpis: {
        totalStudents: 1,
        missingAssignmentCount: 0,
        missingAssignmentBoardCount: 0,
        cleaningDirtyCount: 0,
        shoeNotArrangedCount: 1,
      },
      missingAssignments: [],
      missingAssignmentBoards: [],
      cleaningFindings: [],
      shoeFindings: [
        {
          student: { id: "student-a", name: "김학생", number: 1 },
          photoUrl: null,
        },
      ],
    });

    render(
      <ClassroomMorningDashboard
        classroomId="classroom-a"
        classroomName="1반"
      />,
    );

    const cleaningTab = await screen.findByRole("tab", { name: "교실 청소" });
    const shoeTab = screen.getByRole("tab", { name: "실내화 정리" });
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      cleaningTab.id,
    );
    expect(
      screen.queryByRole("heading", { name: /실내화 정리 결과/ }),
    ).toBeNull();

    fireEvent.keyDown(cleaningTab, { key: "ArrowRight" });

    expect(shoeTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      shoeTab.id,
    );
    expect(
      screen.getByRole("heading", { name: /실내화 정리 결과/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /청소 검사 결과/ }),
    ).toBeNull();
  });

  it("renders assignments as collapsed accordion rows", async () => {
    fetchCleaningDutiesMock.mockResolvedValue({ duties: [] });
    fetchMorningSummaryMock.mockResolvedValue({
      date: "2026-07-10",
      classroomName: "1반",
      kpis: {
        totalStudents: 2,
        missingAssignmentCount: 1,
        missingAssignmentBoardCount: 0,
        cleaningDirtyCount: 0,
        shoeNotArrangedCount: 0,
      },
      missingAssignments: [
        {
          student: { id: "student-a", name: "김학생", number: 1 },
          tasks: [
            {
              id: "task-a",
              title: "국어 읽기",
              dueDate: "2026-07-11",
            },
          ],
        },
      ],
      missingAssignmentBoards: [],
      cleaningFindings: [],
      shoeFindings: [],
    });

    render(
      <ClassroomMorningDashboard
        classroomId="classroom-a"
        classroomName="1반"
      />,
    );

    await screen.findByRole("heading", { name: "과제" });
    expect(screen.queryByText("미제출 과제")).toBeNull();
    expect(screen.queryByRole("navigation", { name: /미제출/ })).toBeNull();

    const assignmentRow = screen.getByRole("button", {
      name: /국어 읽기.*2026.*미제출 1명/,
    });
    const panelId = assignmentRow.getAttribute("aria-controls");
    expect(assignmentRow.getAttribute("aria-expanded")).toBe("false");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeNull();

    fireEvent.click(assignmentRow);
    expect(assignmentRow.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(panelId!);
    expect(panel).toBeTruthy();
    if (!panel) throw new Error("assignment panel did not render");
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel.id).toBe(panelId);
    expect(panel.getAttribute("aria-labelledby")).toBe(assignmentRow.id);
    expect(panel.textContent).toContain("김학생");

    fireEvent.click(assignmentRow);
    expect(assignmentRow.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(panelId!)).toBeNull();
  });
});
