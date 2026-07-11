import { describe, expect, it } from "vitest";
import { isStudentAssignmentReminded } from "../student-home-types";
import {
  isAssignmentReminderVisible,
  studentNotificationTarget,
} from "../../../apps/mobile/lib/student-notifications";
import {
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
} from "../../../apps/mobile/lib/student-navigation-core";
import {
  inspectionPhotoBlocksSave,
  inspectionPhotoPreviewUri,
} from "../../../apps/mobile/lib/student-inspection";

const baseAssignment = {
  submitted: false,
  assignedAt: "2026-07-10T00:00:00.000Z",
  reminderSentAt: "2026-07-10T23:00:00.000Z",
};

describe("student assignment reminder parity", () => {
  it("shows a reminder only for an unsubmitted item with a distinct reminder time", () => {
    expect(isStudentAssignmentReminded(baseAssignment)).toBe(true);
    expect(isAssignmentReminderVisible(baseAssignment)).toBe(true);
  });

  it.each([
    { ...baseAssignment, submitted: true },
    { ...baseAssignment, reminderSentAt: null },
    { ...baseAssignment, reminderSentAt: baseAssignment.assignedAt },
  ])("hides non-actionable reminder state %#", (item) => {
    expect(isStudentAssignmentReminded(item)).toBe(false);
    expect(isAssignmentReminderVisible(item)).toBe(false);
  });
});

describe("student mobile navigation parity", () => {
  it("contains only production student base destinations", () => {
    expect(studentBaseNavTargets.map((target) => target.id)).toEqual([
      "home",
      "boards",
      "portfolio",
      "reading",
      "walking",
      "more",
    ]);
    expect(studentOptionalNavTargets.map((target) => target.id)).toEqual([
      "wallet",
      "canva",
      "notifications",
    ]);
  });

  it.each([
    ["cleaning-inspector", "/classroom/class-1/cleaning", "/cleaning"],
    ["shoe-inspector", "/classroom/class-1/shoes", "/shoes"],
  ])("maps %s duties to a mobile route", (roleKey, href, pathname) => {
    expect(studentDutyTarget({
      classroomId: "class-1",
      classroomName: "1반",
      roleKey,
      roleLabel: "검사",
      emoji: null,
      href,
    })?.pathname).toBe(pathname);
  });

  it("maps web board notification links to the native board route", () => {
    expect(String(studentNotificationTarget("/board/my-board"))).toBe(
      "/(student)/board/my-board",
    );
    expect(String(studentNotificationTarget("/unknown"))).toBe("/(student)");
  });
});

describe("student cleaning photo state", () => {
  it("prefers a local image while a replacement is uploading", () => {
    expect(inspectionPhotoPreviewUri({
      photoUrl: "https://example.com/existing.jpg",
      localPhotoUri: "file:///replacement.jpg",
    })).toBe("file:///replacement.jpg");
  });

  it("preserves an existing server photo when there is no local replacement", () => {
    expect(inspectionPhotoPreviewUri({
      photoUrl: "https://example.com/existing.jpg",
      localPhotoUri: null,
    })).toBe("https://example.com/existing.jpg");
  });

  it.each([
    ["uploading", "file:///photo.jpg", true],
    ["error", "file:///photo.jpg", true],
    ["error", null, false],
    ["permission-denied", null, false],
    ["idle", null, false],
  ] as const)("evaluates %s save blocking", (photoStatus, localPhotoUri, expected) => {
    expect(inspectionPhotoBlocksSave({ photoStatus, localPhotoUri })).toBe(expected);
  });
});
