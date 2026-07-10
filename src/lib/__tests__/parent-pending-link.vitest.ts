import { describe, expect, it } from "vitest";
import { toParentPendingLink } from "../parent-pending-link";

describe("parent pending link presentation", () => {
  it("formats the request date and remaining seven-day approval window", () => {
    const requestedAt = new Date("2026-07-08T00:00:00.000Z");
    const item = toParentPendingLink({
      id: "link_1",
      requestedAt,
      student: {
        name: "민지",
        number: 7,
        classroom: { name: "1반" },
      },
    }, new Date("2026-07-10T00:00:00.000Z").getTime());

    expect(item).toMatchObject({
      id: "link_1",
      studentName: "민지",
      studentNumber: 7,
      classroomName: "1반",
      expiresInDays: 5,
    });
  });
});
