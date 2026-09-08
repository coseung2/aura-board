import { describe, expect, it } from "vitest";
import {
  arrangeSeating,
  type SeatingOptions,
} from "../classroom-seating-arrange";
import type {
  GroupEditorDraft,
  GroupEditorStudent,
} from "../GroupRosterEditor";

function fixture(
  female = 12,
  male = 12,
  count = 6,
  unknown = 0,
): SeatingOptions {
  const students: GroupEditorStudent[] = Array.from(
    { length: female + male + unknown },
    (_, i) => ({
      id: `s${i}`,
      name: `학생${i}`,
      number: i + 1,
      gender: i < female ? "female" : i < female + male ? "male" : null,
    }),
  );
  const groups = Array.from({ length: count }, (_, i) => ({
    name: `${i + 1}분단`,
    studentIds: students.filter((_, j) => j % count === i).map((s) => s.id),
  }));
  return {
    students,
    groups,
    pairMode: "any",
    useGenderQuota: false,
    femaleTarget: 1,
    maleTarget: 1,
    fixedPairs: [],
    random: () => 0.37,
  };
}

function check(options: SeatingOptions, groups: GroupEditorDraft[]) {
  const map = new Map(options.students.map((s) => [s.id, s.gender]));
  expect(groups.flatMap((g) => g.studentIds).sort()).toEqual(
    options.groups.flatMap((g) => g.studentIds).sort(),
  );
  const sizes = groups.map((g) => g.studentIds.length);
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  for (const group of groups) {
    if (options.useGenderQuota) {
      const expected =
        (group.studentIds.length * options.femaleTarget) /
        (options.femaleTarget + options.maleTarget);
      const actual = group.studentIds.filter(
        (id) => map.get(id) === "female",
      ).length;
      expect(actual).toBeGreaterThanOrEqual(Math.floor(expected));
      expect(actual).toBeLessThanOrEqual(Math.ceil(expected));
    }
    for (let i = 0; i + 1 < group.studentIds.length; i += 2) {
      const a = map.get(group.studentIds[i]);
      const b = map.get(group.studentIds[i + 1]);
      if (options.pairMode !== "any") {
        expect(["male", "female"]).toContain(a);
        expect(["male", "female"]).toContain(b);
      }
      if (options.pairMode === "mixed") expect(a).not.toBe(b);
      if (options.pairMode === "same") expect(a).toBe(b);
      if (options.pairMode === "female_female")
        expect([a, b]).toEqual(["female", "female"]);
      if (options.pairMode === "male_male")
        expect([a, b]).toEqual(["male", "male"]);
    }
  }
  for (const {
    studentIds: [a, b],
  } of options.fixedPairs) {
    const group = groups.find((g) => g.studentIds.includes(a))!;
    expect(Math.floor(group.studentIds.indexOf(a) / 2)).toBe(
      Math.floor(group.studentIds.indexOf(b) / 2),
    );
  }
}

function success(options: SeatingOptions) {
  const original = structuredClone({
    students: options.students,
    groups: options.groups,
    fixedPairs: options.fixedPairs,
  });
  const result = arrangeSeating(options);
  expect(result.ok, result.ok ? "" : result.error).toBe(true);
  if (result.ok) check(options, result.groups);
  expect({
    students: options.students,
    groups: options.groups,
    fixedPairs: options.fixedPairs,
  }).toEqual(original);
  return result;
}

describe("seating conditions", () => {
  it.each([
    [13, 11, 0, "mixed", 1],
    [12, 12, 0, "male_male", 6],
    [12, 12, 0, "female_female", 6],
    [11, 13, 0, "same", 1],
    [10, 12, 2, "mixed", 2],
  ] as const)("minimizes exceptions for %iF/%iM/%i unspecified in %s mode", (female, male, unknown, pairMode, expected) => {
    const input = { ...fixture(female, male, 6, unknown), pairMode };
    const result = arrangeSeating(input);
    expect(result).toMatchObject({ ok: true, pairExceptions: expected });
    if (result.ok) check({ ...input, pairMode: "any" }, result.groups);
  });
  it("applies ratio and visible adjacent mixed pairs even with fixed partners", () => {
    const input = fixture();
    input.useGenderQuota = true;
    input.pairMode = "mixed";
    input.fixedPairs = [
      { id: "a", studentIds: ["s0", "s12"] },
      { id: "b", studentIds: ["s1", "s13"] },
    ];
    success(input);
  });

  it("keeps same-sex fixed pairs adjacent while satisfying 2:2 groups", () => {
    const input = fixture();
    input.useGenderQuota = true;
    input.pairMode = "same";
    input.fixedPairs = [
      { id: "a", studentIds: ["s0", "s1"] },
      { id: "b", studentIds: ["s12", "s13"] },
    ];
    success(input);
  });

  it("rounds odd group sizes across the class instead of biasing every group female", () => {
    const input = fixture(8, 7, 5);
    input.useGenderQuota = true;
    input.pairMode = "mixed";
    success(input);
  });

  it("scales a ratio for six-seat groups and supports more than four per group", () => {
    const input = fixture(16, 8, 4);
    input.useGenderQuota = true;
    input.femaleTarget = 2;
    success(input);
  });

  it("does not silently drop gender quotas when fixed pairs conflict", () => {
    const input = fixture(2, 2, 2);
    input.useGenderQuota = true;
    input.fixedPairs = [{ id: "a", studentIds: ["s0", "s1"] }];
    const before = structuredClone(input.groups);
    expect(arrangeSeating(input)).toMatchObject({ ok: false });
    expect(input.groups).toEqual(before);
  });

  it("preserves fixed partners with the minimum pair exceptions", () => {
    const input = fixture();
    input.pairMode = "mixed";
    input.fixedPairs = [{ id: "a", studentIds: ["s0", "s1"] }];
    expect(arrangeSeating(input)).toMatchObject({
      ok: true,
      pairExceptions: 2,
    });
  });

  it("keeps excluded students unassigned", () => {
    const input = fixture();
    input.groups[0].studentIds = input.groups[0].studentIds.filter(
      (id) => id !== "s0",
    );
    const result = success(input);
    if (result.ok)
      expect(result.groups.flatMap((g) => g.studentIds)).not.toContain("s0");
  });

  it("accepts unknown genders with unrestricted pairing, but never claims a ratio for them", () => {
    const input = fixture(3, 3, 2, 2);
    success(input);
    input.useGenderQuota = true;
    expect(arrangeSeating(input)).toMatchObject({
      ok: false,
      error: expect.stringContaining("미지정"),
    });
  });

  it("allows an unknown-gender student in an unpaired odd seat", () => {
    const input = fixture(1, 1, 1, 1);
    input.pairMode = "mixed";
    success(input);
  });

  it.each(["male_male", "female_female"] as const)(
    "enforces every full pair for %s",
    (pairMode) => {
      const input =
        pairMode === "male_male" ? fixture(2, 8, 2) : fixture(8, 2, 2);
      input.pairMode = pairMode;
      success(input);
    },
  );

  it.each([
    [0, 0],
    [-1, 1],
    [0.5, 1],
    [NaN, 1],
    [Infinity, 1],
    [101, 1],
  ])(
    "rejects invalid ratio %s:%s without changing input",
    (femaleTarget, maleTarget) => {
      const input = {
        ...fixture(),
        useGenderQuota: true,
        femaleTarget,
        maleTarget,
      };
      expect(arrangeSeating(input)).toMatchObject({ ok: false });
    },
  );

  it("rejects impossible totals without a best-effort success", () => {
    expect(
      arrangeSeating({ ...fixture(13, 11), useGenderQuota: true }),
    ).toMatchObject({ ok: false });
    expect(
      arrangeSeating({ ...fixture(13, 11), pairMode: "mixed" }),
    ).toMatchObject({ ok: true, pairExceptions: 1 });
  });

  it("does not turn a 2:1 request into 1:1 by rounding every group down", () => {
    expect(
      arrangeSeating({
        ...fixture(),
        useGenderQuota: true,
        femaleTarget: 2,
        maleTarget: 1,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects duplicate, unknown, empty and overlapping fixed students", () => {
    const input = fixture();
    input.groups[0].studentIds.push("s0");
    expect(arrangeSeating(input).ok).toBe(false);
    input.groups[0].studentIds.pop();
    input.groups[0].studentIds.push("missing");
    expect(arrangeSeating(input).ok).toBe(false);
    input.groups = [];
    expect(arrangeSeating(input).ok).toBe(false);
    const fixed = fixture();
    fixed.fixedPairs = [
      { id: "a", studentIds: ["s0", "s1"] },
      { id: "b", studentIds: ["s1", "s2"] },
    ];
    expect(arrangeSeating(fixed).ok).toBe(false);
  });

  it("searches across many randomized orderings with fixed pairs and quotas", () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = seed;
      const input = fixture(15, 15, 6);
      input.pairMode = "mixed";
      input.useGenderQuota = true;
      input.fixedPairs = Array.from({ length: 7 }, (_, i) => ({
        id: `pair${i}`,
        studentIds: [`s${i}`, `s${15 + i}`] as [string, string],
      }));
      input.random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
      };
      success(input);
    }
  });

  it("agrees with exhaustive seat permutations for small classrooms", () => {
    // Independent oracle: enumerate identities, then inspect the actual pairs.
    // This catches incorrect feasibility pruning as well as false successes.
    function feasible(input: SeatingOptions): boolean {
      const ids = input.students.map((s) => s.id);
      if (input.useGenderQuota) {
        const totalFemale = input.students.filter(
          (s) => s.gender === "female",
        ).length;
        const target =
          (ids.length * input.femaleTarget) /
          (input.femaleTarget + input.maleTarget);
        if (totalFemale < Math.floor(target) || totalFemale > Math.ceil(target))
          return false;
      }
      const sexes = new Map(input.students.map((s) => [s.id, s.gender]));
      const sizes = input.groups.map(
        (_, i) =>
          Math.floor(ids.length / input.groups.length) +
          (i < ids.length % input.groups.length ? 1 : 0),
      );
      function valid(order: string[]) {
        let start = 0;
        for (const size of sizes) {
          const group = order.slice(start, start + size);
          start += size;
          if (input.useGenderQuota) {
            const female = group.filter(
              (id) => sexes.get(id) === "female",
            ).length;
            const target =
              (size * input.femaleTarget) /
              (input.femaleTarget + input.maleTarget);
            if (female < Math.floor(target) || female > Math.ceil(target))
              return false;
          }
          for (const pair of input.fixedPairs) {
            if (
              group.includes(pair.studentIds[0]) &&
              Math.floor(group.indexOf(pair.studentIds[0]) / 2) !==
                Math.floor(group.indexOf(pair.studentIds[1]) / 2)
            )
              return false;
          }
          for (let i = 0; i + 1 < size; i += 2) {
            const a = sexes.get(group[i]);
            const b = sexes.get(group[i + 1]);
            if (input.pairMode === "mixed" && a === b) return false;
            if (input.pairMode === "same" && a !== b) return false;
            if (
              input.pairMode === "male_male" &&
              (a !== "male" || b !== "male")
            )
              return false;
            if (
              input.pairMode === "female_female" &&
              (a !== "female" || b !== "female")
            )
              return false;
          }
        }
        return true;
      }
      function permute(prefix: string[], remaining: string[]): boolean {
        if (!remaining.length) return valid(prefix);
        return remaining.some((id, i) =>
          permute(
            [...prefix, id],
            remaining.filter((_, j) => j !== i),
          ),
        );
      }
      return permute([], ids);
    }
    for (let size = 2; size <= 6; size++) {
      for (let female = 0; female <= size; female++) {
        for (let count = 1; count <= Math.min(3, size); count++) {
          for (const pairMode of [
            "any",
            "mixed",
            "same",
            "male_male",
            "female_female",
          ] as const) {
            for (const [useGenderQuota, femaleTarget, maleTarget] of [
              [false, 1, 1],
              [true, 1, 1],
              [true, 2, 1],
              [true, 1, 2],
              [true, 0, 1],
              [true, 1, 0],
            ] as const) {
              const input = {
                ...fixture(female, size - female, count),
                pairMode,
                useGenderQuota,
                femaleTarget,
                maleTarget,
              };
              input.fixedPairs =
                size % 2 === 0
                  ? [{ id: "fixed", studentIds: ["s0", `s${size - 1}`] }]
                  : [];
              const actual = arrangeSeating(input);
              expect(
                actual.ok,
                JSON.stringify({
                  size,
                  female,
                  count,
                  pairMode,
                  useGenderQuota,
                  femaleTarget,
                  maleTarget,
                }),
              ).toBe(feasible({ ...input, pairMode: "any" }));
              if (actual.ok) {
                check({ ...input, pairMode: actual.pairExceptions ? "any" : pairMode }, actual.groups);
                expect(actual.pairExceptions === 0).toBe(feasible(input));
              }
            }
          }
        }
      }
    }
  });
});
