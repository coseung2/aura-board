import { describe, expect, it } from "vitest";
import { buildLinkTextBlock } from "./add-card-modal-model";

describe("buildLinkTextBlock", () => {
  it("keeps the saved title and description markdown contract", () => {
    expect(buildLinkTextBlock("  자료 제목  ", "  자료 설명  ")).toBe(
      "**자료 제목**\n\n자료 설명",
    );
  });

  it("uses the one available field and omits an empty block", () => {
    expect(buildLinkTextBlock("자료 제목", " ")).toBe("자료 제목");
    expect(buildLinkTextBlock(null, "자료 설명")).toBe("자료 설명");
    expect(buildLinkTextBlock(undefined, null)).toBe("");
  });
});
