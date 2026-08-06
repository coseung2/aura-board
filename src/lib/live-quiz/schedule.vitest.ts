import { describe, expect, it } from "vitest";
import {
  addKstDays,
  kstDayKey,
  liveQuizEndsAt,
  liveQuizLockAt,
  liveQuizSetupNextStartsAt,
  liveQuizStartsAt,
  liveQuizTimeline,
} from "./schedule";

describe("live quiz schedule", () => {
  it("uses the Korea calendar day around UTC midnight", () => {
    expect(kstDayKey(new Date("2026-08-05T15:01:00.000Z"))).toBe("2026-08-06");
    expect(kstDayKey(new Date("2026-08-06T14:59:59.000Z"))).toBe("2026-08-06");
  });

  it("locks at 13:25 and starts at 13:30 KST", () => {
    expect(liveQuizLockAt("2026-08-06").toISOString()).toBe(
      "2026-08-06T04:25:00.000Z",
    );
    expect(liveQuizStartsAt("2026-08-06").toISOString()).toBe(
      "2026-08-06T04:30:00.000Z",
    );
  });

  it("moves an underfilled setup to tomorrow once the daily lock passes", () => {
    expect(
      liveQuizSetupNextStartsAt(
        new Date("2026-08-06T04:24:59.999Z"),
        "2026-08-06",
      ).toISOString(),
    ).toBe("2026-08-06T04:30:00.000Z");
    expect(
      liveQuizSetupNextStartsAt(
        new Date("2026-08-06T04:25:00.000Z"),
        "2026-08-06",
      ).toISOString(),
    ).toBe("2026-08-07T04:30:00.000Z");
  });

  it("moves from answer to reveal and then the next question", () => {
    const startsAt = liveQuizStartsAt("2026-08-06");
    expect(
      liveQuizTimeline(new Date(startsAt.getTime() + 19_000), startsAt, 10),
    ).toMatchObject({ phase: "live", questionIndex: 0, stage: "answer" });
    expect(
      liveQuizTimeline(new Date(startsAt.getTime() + 20_000), startsAt, 10),
    ).toMatchObject({ phase: "live", questionIndex: 0, stage: "reveal" });
    expect(
      liveQuizTimeline(new Date(startsAt.getTime() + 25_000), startsAt, 10),
    ).toMatchObject({ phase: "live", questionIndex: 1, stage: "answer" });
  });

  it("finishes after the configured question count", () => {
    const startsAt = liveQuizStartsAt("2026-08-06");
    const endsAt = liveQuizEndsAt(startsAt, 10);
    expect(liveQuizTimeline(endsAt, startsAt, 10).phase).toBe("finished");
  });

  it("advances KST day keys without local timezone dependence", () => {
    expect(addKstDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
