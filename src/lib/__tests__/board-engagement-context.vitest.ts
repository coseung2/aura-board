import { afterEach, describe, expect, it } from "vitest";
import {
  readBoardEngagementContext,
  shouldUseStudentBoardViewer,
} from "../board-engagement-context";

describe("board engagement viewer context", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("allows a validated per-tab student override when a teacher session coexists", () => {
    expect(
      shouldUseStudentBoardViewer({
        boardClassroomId: "class-a",
        studentClassroomId: "class-a",
        hasTeacherSession: true,
        studentViewRequested: true,
      }),
    ).toBe(true);
    expect(
      shouldUseStudentBoardViewer({
        boardClassroomId: "class-a",
        studentClassroomId: "class-a",
        hasTeacherSession: true,
        studentViewRequested: false,
      }),
    ).toBe(false);
  });

  it("rejects a student-view override from another classroom", () => {
    expect(
      shouldUseStudentBoardViewer({
        boardClassroomId: "class-a",
        studentClassroomId: "class-b",
        hasTeacherSession: true,
        studentViewRequested: true,
      }),
    ).toBe(false);
  });

  it("reads the current tab marker", () => {
    document.body.innerHTML =
      '<header data-aura-board-id="board-a" data-aura-student-viewer="true"></header>';
    expect(readBoardEngagementContext()).toEqual({
      boardId: "board-a",
      isStudentViewer: true,
    });
  });
});
