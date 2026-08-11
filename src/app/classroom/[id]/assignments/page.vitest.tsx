import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

type AssignmentsViewProps = {
  classroomId: string;
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
  ClassroomSectionHeader: ({
    title,
    actions,
  }: {
    title: string;
    actions?: ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock("@/components/classroom/ClassroomAssignmentsView", () => ({
  ClassroomAssignmentsView: ({ classroomId }: AssignmentsViewProps) => (
    <section
      data-testid="assignments-view"
      data-classroom-id={classroomId}
    />
  ),
  ClassroomAssignmentDistributeButton: () => (
    <button type="button">+ 과제 배부</button>
  ),
  ArchivedAssignmentsButton: () => (
    <button type="button">보관함</button>
  ),
}));

import ClassroomAssignmentsPage from "./page";

describe("ClassroomAssignmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("calls notFound and stops before composing the view for another teacher", async () => {
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
      ClassroomAssignmentsPage({ params: Promise.resolve({ id: "classroom-1" }) }),
    ).rejects.toBe(notFoundError);

    expect(mocks.notFound).toHaveBeenCalledWith();
  });

  it("composes the full-width assignments view for the authorized classroom", async () => {
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      name: "햇살반",
      teacherId: "teacher-1",
    });

    render(
      await ClassroomAssignmentsPage({
        params: Promise.resolve({ id: "classroom-1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "과제 현황" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ 과제 배부" })).toBeTruthy();
    const view = screen.getByTestId("assignments-view");
    expect(view.getAttribute("data-classroom-id")).toBe("classroom-1");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
