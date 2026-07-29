import { describe, expect, it } from "vitest";

import {
  safeLoginReturnTarget,
  safeStudentLoginReturnTarget,
  safeTeacherLoginReturnTarget,
} from "./login-return-target";

describe("login return targets", () => {
  it("keeps same-origin application paths and rejects external or auth paths", () => {
    expect(safeLoginReturnTarget("/board/example", "/fallback")).toBe(
      "/board/example",
    );
    expect(safeLoginReturnTarget("//example.com", "/fallback")).toBe(
      "/fallback",
    );
    expect(safeLoginReturnTarget("https://example.com", "/fallback")).toBe(
      "/fallback",
    );
    expect(safeLoginReturnTarget("/login?next=/dashboard", "/fallback")).toBe(
      "/fallback",
    );
  });

  it("prevents student login from returning to teacher-only routes", () => {
    expect(safeStudentLoginReturnTarget("/dashboard")).toBe("/student");
    expect(safeStudentLoginReturnTarget("/dashboard?tab=boards")).toBe(
      "/student",
    );
    expect(safeStudentLoginReturnTarget("/classroom/example")).toBe("/student");
    expect(safeStudentLoginReturnTarget("/admin")).toBe("/student");
  });

  it("keeps student-safe destinations and a safe server fallback", () => {
    expect(safeStudentLoginReturnTarget("/student/reading")).toBe(
      "/student/reading",
    );
    expect(safeStudentLoginReturnTarget("/board/example")).toBe(
      "/board/example",
    );
    expect(safeStudentLoginReturnTarget(null, "/student/boards")).toBe(
      "/student/boards",
    );
    expect(safeStudentLoginReturnTarget(null, "/dashboard")).toBe("/student");
  });

  it("keeps the teacher dashboard as a valid teacher return target", () => {
    expect(safeTeacherLoginReturnTarget("/dashboard")).toBe("/dashboard");
    expect(safeTeacherLoginReturnTarget("/login")).toBe("/dashboard");
  });
});
