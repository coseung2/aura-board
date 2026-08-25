import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type RoleStudent = { id: string; name: string; number: number | null };

type RolesViewProps = {
  classroomId: string;
  classroomName: string;
  unit: string;
  students: RoleStudent[];
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
vi.mock("@/components/classroom/ClassroomRolesView", () => ({
  ClassroomRolesView: ({ classroomId, classroomName, unit, students }: RolesViewProps) => (
    <section aria-label="역할 패널">
      <h1>1인 1역</h1>
      <span data-testid="role-panel-classroom-id">{classroomId}</span>
      <span data-testid="role-panel-classroom-name">{classroomName}</span>
      <span data-testid="role-panel-unit">{unit}</span>
      <span data-testid="role-panel-students">
        {students
          .map(({ id, name, number }) => `${id}:${name}:${number ?? ""}`)
          .join("|")}
      </span>
    </section>
  ),
}));

import ClassroomRolesPage from "./page";

describe("ClassroomRolesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  it("calls notFound and stops before composing the panel for another teacher", async () => {
    const notFoundError = new Error("NEXT_NOT_FOUND");
    mocks.notFound.mockImplementationOnce(() => {
      throw notFoundError;
    });
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      name: "햇살반",
      teacherId: "teacher-2",
      currency: null,
      students: [],
    });

    await expect(
      ClassroomRolesPage({ params: Promise.resolve({ id: "classroom-1" }) }),
    ).rejects.toBe(notFoundError);

    expect(mocks.notFound).toHaveBeenCalledWith();
  });

  it("composes the role panel with the authorized classroom data", async () => {
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      name: "햇살반",
      teacherId: "teacher-1",
      currency: { unitLabel: "별" },
      students: [
        { id: "student-1", name: "가온", number: 3 },
        { id: "student-2", name: "나래", number: null },
      ],
    });

    render(
      await ClassroomRolesPage({
        params: Promise.resolve({ id: "classroom-1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "1인 1역" })).toBeTruthy();
    expect(screen.getByTestId("role-panel-classroom-id").textContent).toBe(
      "classroom-1",
    );
    expect(screen.getByTestId("role-panel-unit").textContent).toBe("별");
    expect(screen.getByTestId("role-panel-classroom-name").textContent).toBe("햇살반");
    expect(screen.getByTestId("role-panel-students").textContent).toBe(
      "student-1:가온:3|student-2:나래:",
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
