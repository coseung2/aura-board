import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS,
  PDF_POINTS_PER_MM,
  planTeacherLibraryPrint,
} from "./teacher-library-print-layout";

describe("planTeacherLibraryPrint", () => {
  it("keeps original source size while fitting the maximum count on A4", () => {
    const plan = planTeacherLibraryPrint(
      Array.from({ length: 35 }, () => ({ width: 120, height: 80 })),
      DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS,
    );

    expect(plan.pages).toHaveLength(2);
    expect(plan.pages.map((page) => page.placements.length)).toEqual([32, 3]);
    expect(plan.pages[0].placements[0]).toMatchObject({ width: 120, height: 80, scale: 1 });
    expect(plan.pages[1].placements[0]).toMatchObject({ width: 120, height: 80, scale: 1 });
  });

  it("only scales down a source larger than the printable A4 area", () => {
    const plan = planTeacherLibraryPrint(
      [{ width: 900, height: 1600 }],
      DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS,
    );

    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].placements[0].scale).toBeLessThan(1);
    expect(plan.warnings).toEqual(["source_scaled_down"]);
  });

  it("changes the physical paper dimensions for landscape output", () => {
    const plan = planTeacherLibraryPrint(
      [{ width: 120, height: 80 }],
      { ...DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS, orientation: "landscape" },
    );

    expect(plan.pages[0].width).toBeCloseTo(297 * PDF_POINTS_PER_MM);
    expect(plan.pages[0].height).toBeCloseTo(210 * PDF_POINTS_PER_MM);
  });

  it("keeps source page dimensions for original-pages mode", () => {
    const plan = planTeacherLibraryPrint(
      [{ width: 320, height: 180 }],
      { ...DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS, mode: "original-pages" },
    );

    expect(plan.pages[0]).toMatchObject({ width: 320, height: 180 });
    expect(plan.pages[0].placements[0]).toMatchObject({ width: 320, height: 180, scale: 1 });
  });

  it("centers a partially filled last page without changing source scale", () => {
    const sources = Array.from({ length: 33 }, () => ({ width: 120, height: 80 }));
    const centered = planTeacherLibraryPrint(sources, DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS);
    const started = planTeacherLibraryPrint(sources, {
      ...DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS,
      lastPageAlignment: "start",
    });

    expect(centered.pages[1].placements[0].scale).toBe(1);
    expect(centered.pages[1].placements[0].x).toBeGreaterThan(started.pages[1].placements[0].x);
    expect(centered.pages[1].placements[0].y).toBeLessThan(started.pages[1].placements[0].y);
  });

  it("reserves enough space around items when crop marks are enabled", () => {
    const plan = planTeacherLibraryPrint(
      Array.from({ length: 2 }, () => ({ width: 240, height: 160 })),
      { ...DEFAULT_TEACHER_LIBRARY_PRINT_OPTIONS, marginMm: 0, gapMm: 0, cropMarks: true },
    );

    expect(plan.pages[0].placements[0].x).toBeGreaterThanOrEqual(4 * PDF_POINTS_PER_MM);
    expect(plan.pages[0].placements[1].x - (
      plan.pages[0].placements[0].x + plan.pages[0].placements[0].width
    )).toBeGreaterThanOrEqual(8 * PDF_POINTS_PER_MM);
  });
});
