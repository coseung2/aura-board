import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MorningDashboardProps = {
  classroomId: string;
  classroomName: string;
  sections?: ReadonlyArray<"assignments" | "duties">;
  showToolbar?: boolean;
};

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindUnique: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: { classroom: { findUnique: mocks.classroomFindUnique } },
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/classroom/ClassroomSectionHeader", () => ({
  ClassroomSectionHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/classroom/ClassroomMorningDashboard", () => ({
  ClassroomMorningDashboard: ({
    classroomId,
    classroomName,
    sections = [],
    showToolbar,
  }: MorningDashboardProps) => (
    <section
      data-testid="morning-panel"
      data-classroom-id={classroomId}
      data-classroom-name={classroomName}
      data-sections={sections.join(",")}
      data-show-toolbar={String(showToolbar)}
    />
  ),
}));

import ClassroomMorningPage from "./page";

describe("ClassroomMorningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("calls notFound and stops before composing the dashboard for another teacher", async () => {
    const notFoundError = new Error("NEXT_NOT_FOUND");
    mocks.notFound.mockImplementationOnce(() => {
      throw notFoundError;
    });
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      name: "햇살반",
      teacherId: "teacher-2",
    });

    await expect(
      ClassroomMorningPage({ params: Promise.resolve({ id: "classroom-1" }) }),
    ).rejects.toBe(notFoundError);

    expect(mocks.notFound).toHaveBeenCalledWith();
  });

  it("composes the dashboard for duties with the authorized classroom data", async () => {
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      name: "햇살반",
      teacherId: "teacher-1",
    });

    render(
      await ClassroomMorningPage({
        params: Promise.resolve({ id: "classroom-1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "청소·당번" })).toBeTruthy();
    const panel = screen.getByTestId("morning-panel");
    expect(panel.getAttribute("data-classroom-id")).toBe("classroom-1");
    expect(panel.getAttribute("data-classroom-name")).toBe("햇살반");
    expect(panel.getAttribute("data-sections")).toBe("duties");
    expect(panel.getAttribute("data-show-toolbar")).toBe("false");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
