import { describe, it, expect } from "vitest";
import { buildSourceLabel } from "../source-label";

describe("buildSourceLabel", () => {
  it("주제별 보드(layout=columns) + 칼럼 → '{보드} · {칼럼}'", () => {
    expect(
      buildSourceLabel({
        boardTitle: "미술 4월",
        boardLayout: "columns",
        sectionTitle: "입체파",
      })
    ).toBe("미술 4월 · 입체파");
  });

  it("그 외 layout → 보드 제목만", () => {
    expect(
      buildSourceLabel({
        boardTitle: "자유보드",
        boardLayout: "freeform",
        sectionTitle: null,
      })
    ).toBe("자유보드");
  });

  it("layout=columns 인데 칼럼이 null → 보드 제목만 (방어적)", () => {
    // 학생 시드 columns 보드의 카드가 칼럼 미배정인 케이스
    expect(
      buildSourceLabel({
        boardTitle: "포트폴리오 보드",
        boardLayout: "columns",
        sectionTitle: null,
      })
    ).toBe("포트폴리오 보드");
  });

  it("layout=stream / grid / dj-queue 등 columns 아닌 모든 layout 동일 처리", () => {
    for (const layout of [
      "freeform",
      "grid",
      "stream",
      "dj-queue",
      "breakout",
      "assignment",
      "vibe-arcade",
      "question-board",
    ]) {
      expect(
        buildSourceLabel({
          boardTitle: "테스트 보드",
          boardLayout: layout,
          sectionTitle: "혹시 칼럼 메타가 있어도",
        })
      ).toBe("테스트 보드");
    }
  });
});
