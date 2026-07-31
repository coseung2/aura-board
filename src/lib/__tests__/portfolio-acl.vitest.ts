import { describe, it, expect } from "vitest";
import {
  canViewStudent,
  canViewClassroomShowcase,
  canToggleShowcase,
  isPortfolioEligibleLayout,
  EXCLUDED_BOARD_LAYOUTS,
  type PortfolioViewer,
} from "../portfolio-acl-pure";

const studentViewer = (id: string, classroomId: string): PortfolioViewer => ({
  kind: "student",
  id,
  name: `s_${id}`,
  classroomId,
});
const parentViewer = (
  childIds: string[],
  childClassroomIds: string[]
): PortfolioViewer => ({
  kind: "parent",
  id: "p_1",
  childIds,
  childClassroomIds,
});
const teacherViewer = (classroomIds: string[]): PortfolioViewer => ({
  kind: "teacher_owner",
  id: "u_t",
  classroomIds,
});

describe("canViewStudent", () => {
  it("student: 같은 학급만 OK", () => {
    const v = studentViewer("s_self", "c_a");
    expect(canViewStudent(v, { id: "s_other", classroomId: "c_a" })).toBe(true);
    expect(canViewStudent(v, { id: "s_other", classroomId: "c_b" })).toBe(false);
  });
  it("parent: 자녀 본인만 (자녀 학급의 다른 학생 X)", () => {
    const v = parentViewer(["s_kid1"], ["c_kid"]);
    expect(canViewStudent(v, { id: "s_kid1", classroomId: "c_kid" })).toBe(true);
    expect(canViewStudent(v, { id: "s_other", classroomId: "c_kid" })).toBe(false);
    expect(canViewStudent(v, { id: "s_kid1", classroomId: "c_other" })).toBe(true);
  });
  it("teacher: 자기 학급 학생만", () => {
    const v = teacherViewer(["c_x", "c_y"]);
    expect(canViewStudent(v, { id: "s_a", classroomId: "c_x" })).toBe(true);
    expect(canViewStudent(v, { id: "s_b", classroomId: "c_z" })).toBe(false);
  });
});

describe("canViewClassroomShowcase", () => {
  it("student: 자기 학급만", () => {
    const v = studentViewer("s_1", "c_a");
    expect(canViewClassroomShowcase(v, "c_a")).toBe(true);
    expect(canViewClassroomShowcase(v, "c_b")).toBe(false);
  });
  it("parent: 자녀가 속한 학급들", () => {
    const v = parentViewer(["k1", "k2"], ["c_x", "c_y"]);
    expect(canViewClassroomShowcase(v, "c_x")).toBe(true);
    expect(canViewClassroomShowcase(v, "c_z")).toBe(false);
  });
  it("teacher: 자기 학급들", () => {
    const v = teacherViewer(["c_a"]);
    expect(canViewClassroomShowcase(v, "c_a")).toBe(true);
    expect(canViewClassroomShowcase(v, "c_b")).toBe(false);
  });
});

describe("canToggleShowcase", () => {
  const myCard = {
    studentAuthorId: "s_self",
    authors: [],
    board: { classroomId: "c_a" },
  };
  const coAuthoredCard = {
    studentAuthorId: "s_other",
    authors: [{ studentId: "s_self" }],
    board: { classroomId: "c_a" },
  };
  const otherCard = {
    studentAuthorId: "s_other",
    authors: [{ studentId: "s_third" }],
    board: { classroomId: "c_a" },
  };
  const otherClassroomCard = {
    studentAuthorId: "s_self",
    authors: [],
    board: { classroomId: "c_b" },
  };

  it("student 본인 카드: 토글 OK", () => {
    const v = studentViewer("s_self", "c_a");
    expect(canToggleShowcase(v, myCard)).toBe(true);
  });
  it("student 공동작성자: 토글 OK (R4)", () => {
    const v = studentViewer("s_self", "c_a");
    expect(canToggleShowcase(v, coAuthoredCard)).toBe(true);
  });
  it("student 무관 카드: 차단", () => {
    const v = studentViewer("s_self", "c_a");
    expect(canToggleShowcase(v, otherCard)).toBe(false);
  });
  it("student 다른 학급 보드 카드: 차단", () => {
    const v = studentViewer("s_self", "c_a");
    expect(canToggleShowcase(v, otherClassroomCard)).toBe(false);
  });
  it("parent: 모든 토글 차단 (학생만)", () => {
    const v = parentViewer(["s_self"], ["c_a"]);
    expect(canToggleShowcase(v, myCard)).toBe(false);
    expect(canToggleShowcase(v, coAuthoredCard)).toBe(false);
  });
  it("teacher: 모든 토글 차단 (학생 자율 정책)", () => {
    const v = teacherViewer(["c_a"]);
    expect(canToggleShowcase(v, myCard)).toBe(false);
  });
});

describe("isPortfolioEligibleLayout — dj-queue 등 결과물 아닌 layout 제외", () => {
  it("dj-queue 차단", () => {
    expect(isPortfolioEligibleLayout("dj-queue")).toBe(false);
  });
  it("일반 결과물 layout 모두 통과", () => {
    for (const layout of [
      "freeform",
      "grid",
      "stream",
      "columns",
      "breakout",
      "assignment",
      "vibe-arcade",
      "question-board",
      "plant-roadmap",
    ]) {
      expect(isPortfolioEligibleLayout(layout)).toBe(true);
    }
  });
  it("EXCLUDED_BOARD_LAYOUTS 배열 = 현재 dj-queue 단일 항목", () => {
    expect([...EXCLUDED_BOARD_LAYOUTS]).toEqual(["dj-queue"]);
  });
});
