import { render, screen, waitFor } from "@testing-library/react";
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
    render(<ClassroomMorningDashboard classroomId="classroom-a" />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "청소 당번을 불러오지 못했습니다.",
      );
    });
    expect(screen.queryByText("표시할 아침 정보가 없습니다.")).toBeNull();
  });
});
