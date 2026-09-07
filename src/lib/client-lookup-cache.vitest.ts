import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchClassroomStudents,
  notifyRosterChanged,
} from "./client-lookup-cache";

describe("client lookup cache invalidation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    notifyRosterChanged("class-1");
  });

  it("does not let an invalidated older lookup overwrite a newer roster", async () => {
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const stale = fetchClassroomStudents("class-1");
    notifyRosterChanged("class-1");
    const fresh = fetchClassroomStudents("class-1");

    resolveSecond(
      new Response(JSON.stringify({ students: [{ id: "student-2", name: "새 학생", number: 2 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(fresh).resolves.toEqual([
      { id: "student-2", name: "새 학생", number: 2 },
    ]);

    resolveFirst(
      new Response(JSON.stringify({ students: [{ id: "student-1", name: "이전 학생", number: 1 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(stale).resolves.toEqual([
      { id: "student-1", name: "이전 학생", number: 1 },
    ]);

    await expect(fetchClassroomStudents("class-1")).resolves.toEqual([
      { id: "student-2", name: "새 학생", number: 2 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
