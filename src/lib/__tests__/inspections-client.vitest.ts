import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCleaningDuties } from "@/lib/inspections-client";

describe("fetchCleaningDuties", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the typed duty roster for the requested date", async () => {
    const duties = [
      {
        id: "duty-a",
        studentId: "student-a",
        studentName: "김아라",
        studentNumber: 3,
        dutyDate: "2026-07-10T00:00:00.000Z",
        source: "yellow_card",
        assignedAt: "2026-07-10T01:00:00.000Z",
      },
    ];
    const fetchMock = vi.fn(async () =>
      Response.json({ date: "2026-07-10", duties }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCleaningDuties("classroom-a", "2026-07-10"),
    ).resolves.toEqual({ date: "2026-07-10", duties });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/classrooms/classroom-a/cleaning-duty?date=2026-07-10",
      { cache: "no-store" },
    );
  });

  it("surfaces the server error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "청소 당번 조회 실패" }, { status: 500 }),
      ),
    );

    await expect(fetchCleaningDuties("classroom-a")).rejects.toThrow(
      "청소 당번 조회 실패",
    );
  });
});
