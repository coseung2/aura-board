import { describe, expect, it } from "vitest";
import { sortClassroomSlimeStudents } from "./classroom-gallery";

describe("sortClassroomSlimeStudents", () => {
  it("orders numbered students first and keeps missing numbers at the end", () => {
    const rows = sortClassroomSlimeStudents([
      { number: null, name: "가람" },
      { number: 12, name: "민수" },
      { number: 2, name: "서연" },
      { number: 2, name: "가온" },
    ]);

    expect(rows.map((row) => `${row.number}:${row.name}`)).toEqual([
      "2:가온",
      "2:서연",
      "12:민수",
      "null:가람",
    ]);
  });
});
