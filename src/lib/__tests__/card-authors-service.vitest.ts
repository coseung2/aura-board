import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setCardAuthors,
  CardAuthorError,
  MAX_AUTHORS_PER_CARD,
} from "../card-authors-service";

// Minimal mock TxLike that captures the calls so we can assert the
// service's behaviour without a real Prisma instance.
function makeMockTx(opts: { classroomStudents?: { id: string; classroomId: string | null }[] } = {}) {
  const calls: Array<{ op: string; args: unknown }> = [];
  return {
    calls,
    tx: {
      cardAuthor: {
        deleteMany: vi.fn(async (args: unknown) => {
          calls.push({ op: "deleteMany", args });
          return { count: 0 };
        }),
        createMany: vi.fn(async (args: unknown) => {
          calls.push({ op: "createMany", args });
          return { count: (args as { data: unknown[] }).data.length };
        }),
      },
      card: {
        update: vi.fn(async (args: unknown) => {
          calls.push({ op: "card.update", args });
          return args;
        }),
      },
      student: {
        findMany: vi.fn(async (args: unknown) => {
          calls.push({ op: "student.findMany", args });
          const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
          const store = opts.classroomStudents ?? [];
          return store.filter((s) => ids.includes(s.id));
        }),
      },
    },
  };
}

describe("setCardAuthors — validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects > MAX_AUTHORS_PER_CARD", async () => {
    const m = makeMockTx();
    const inputs = Array.from({ length: MAX_AUTHORS_PER_CARD + 1 }, (_, i) => ({
      studentId: `s${i}`,
      displayName: `N${i}`,
    }));
    await expect(setCardAuthors(m.tx as never, "c1", inputs)).rejects.toBeInstanceOf(
      CardAuthorError
    );
  });

  it("rejects duplicate studentId", async () => {
    const m = makeMockTx();
    await expect(
      setCardAuthors(m.tx as never, "c1", [
        { studentId: "s1", displayName: "A" },
        { studentId: "s1", displayName: "B" },
      ])
    ).rejects.toMatchObject({ code: "duplicate_student" });
  });

  it("rejects empty displayName", async () => {
    const m = makeMockTx();
    await expect(
      setCardAuthors(m.tx as never, "c1", [{ studentId: "s1", displayName: "  " }])
    ).rejects.toMatchObject({ code: "displayName_required" });
  });

  it("rejects >60 char displayName", async () => {
    const m = makeMockTx();
    await expect(
      setCardAuthors(m.tx as never, "c1", [
        { studentId: "s1", displayName: "x".repeat(61) },
      ])
    ).rejects.toMatchObject({ code: "displayName_too_long" });
  });

  it("enforces classroom membership when classroomId provided", async () => {
    const m = makeMockTx({
      classroomStudents: [
        { id: "s1", classroomId: "c-correct" },
        { id: "s2", classroomId: "c-other" },
      ],
    });
    await expect(
      setCardAuthors(
        m.tx as never,
        "card1",
        [
          { studentId: "s1", displayName: "A" },
          { studentId: "s2", displayName: "B" },
        ],
        { classroomId: "c-correct" }
      )
    ).rejects.toMatchObject({ code: "student_not_in_classroom" });
  });

  it("allows free-form null studentId regardless of classroom", async () => {
    const m = makeMockTx();
    const res = await setCardAuthors(
      m.tx as never,
      "card1",
      [{ studentId: null, displayName: "Guest" }],
      { classroomId: "c-x" }
    );
    expect(res.primaryStudentId).toBe(null);
    expect(res.externalAuthorName).toBe("Guest");
  });
});

describe("setCardAuthors — write path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes existing, then creates with normalised order 0..N-1", async () => {
    const m = makeMockTx();
    await setCardAuthors(m.tx as never, "card1", [
      { studentId: "sA", displayName: "Alice" },
      { studentId: "sB", displayName: "Bob" },
    ]);

    const deleteCall = m.calls.find((c) => c.op === "deleteMany");
    expect(deleteCall).toMatchObject({
      args: { where: { cardId: "card1" } },
    });

    const createCall = m.calls.find((c) => c.op === "createMany");
    expect(createCall).toBeDefined();
    const data = (createCall!.args as { data: Array<{ order: number; studentId: string | null }> })
      .data;
    expect(data.map((d) => d.order)).toEqual([0, 1]);
    expect(data.map((d) => d.studentId)).toEqual(["sA", "sB"]);
  });

  it("mirrors primary to Card.studentAuthorId + externalAuthorName", async () => {
    const m = makeMockTx();
    const res = await setCardAuthors(m.tx as never, "card1", [
      { studentId: "sA", displayName: "Alice" },
      { studentId: "sB", displayName: "Bob" },
      { studentId: "sC", displayName: "Carol" },
    ]);
    expect(res.primaryStudentId).toBe("sA");
    expect(res.externalAuthorName).toBe("Alice님과 2명");

    const updCall = m.calls.find((c) => c.op === "card.update");
    expect(updCall).toMatchObject({
      args: {
        where: { id: "card1" },
        data: { studentAuthorId: "sA", externalAuthorName: "Alice님과 2명" },
      },
    });
  });

  it("empty input — mirror becomes null/null", async () => {
    const m = makeMockTx();
    const res = await setCardAuthors(m.tx as never, "card1", []);
    expect(res.primaryStudentId).toBe(null);
    expect(res.externalAuthorName).toBe(null);

    // No createMany call when list is empty (skip insert).
    expect(m.calls.some((c) => c.op === "createMany")).toBe(false);
  });

  it("4+ authors yield polite remaining-count mirror format", async () => {
    const m = makeMockTx();
    const res = await setCardAuthors(m.tx as never, "card1", [
      { studentId: "s1", displayName: "가" },
      { studentId: "s2", displayName: "나" },
      { studentId: "s3", displayName: "다" },
      { studentId: "s4", displayName: "라" },
    ]);
    expect(res.externalAuthorName).toBe("가님과 3명");
  });

  it("trims whitespace in displayName", async () => {
    const m = makeMockTx();
    await setCardAuthors(m.tx as never, "card1", [
      { studentId: null, displayName: "  Alice  " },
    ]);
    const createCall = m.calls.find((c) => c.op === "createMany");
    const data = (createCall!.args as { data: Array<{ displayName: string }> }).data;
    expect(data[0].displayName).toBe("Alice");
  });
});
