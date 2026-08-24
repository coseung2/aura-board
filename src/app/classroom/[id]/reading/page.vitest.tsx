import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findClassroom: vi.fn(),
  findReadingLogs: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.findClassroom },
    readingLog: { findMany: mocks.findReadingLogs },
  },
}));
vi.mock("@/components/classroom/ReadingLogDeleteButton", () => ({
  ReadingLogDeleteButton: () => <span data-label="관리" role="cell">삭제</span>,
}));

import ClassroomReadingPage from "./page";

describe("ClassroomReadingPage", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "teacher-1" });
    mocks.findClassroom.mockReset().mockResolvedValue({
      id: "classroom-1",
      name: "별무리반",
      teacherId: "teacher-1",
    });
    mocks.findReadingLogs.mockReset();
  });

  it("keeps long reading and evaluation text collapsed below the summary row", async () => {
    mocks.findReadingLogs.mockResolvedValue([
      {
        id: "log-1",
        bookType: "story",
        title: "과학사를 알면 과학이 재밌어",
        author: "김성희,권수진",
        reflection: "긴 독서 기록",
        aiScore: null,
        aiFeedback: null,
        aiFeedbackStatus: "pending",
        createdAt: new Date("2026-08-19T00:00:00Z"),
        student: { name: "서현우", number: 12 },
      },
    ]);

    const view = render(
      await ClassroomReadingPage({
        params: Promise.resolve({ id: "classroom-1" }),
      }),
    );

    expect(screen.queryByRole("columnheader", { name: "독서 감상" })).toBeNull();
    expect(screen.getByRole("cell", { name: "점수 —" })).toBeTruthy();
    expect(screen.getByText("긴 독서 기록")).toBeTruthy();
    expect(screen.getByText("평가 중")).toBeTruthy();
    expect(view.container.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  it("shows only a generated numeric score in the score column", async () => {
    mocks.findReadingLogs.mockResolvedValue([
      {
        id: "log-2",
        bookType: "story",
        title: "버드스파이크",
        author: "손영아",
        reflection: "독서 기록",
        aiScore: 8,
        aiFeedback: "생명 존중에 대한 생각이 잘 드러나요.",
        aiFeedbackStatus: "generated",
        createdAt: new Date("2026-08-18T00:00:00Z"),
        student: { name: "서현우", number: 12 },
      },
    ]);

    render(
      await ClassroomReadingPage({
        params: Promise.resolve({ id: "classroom-1" }),
      }),
    );

    expect(screen.getByRole("cell", { name: "점수 8점" })).toBeTruthy();
    expect(screen.getByText("생명 존중에 대한 생각이 잘 드러나요.")).toBeTruthy();
  });
});
