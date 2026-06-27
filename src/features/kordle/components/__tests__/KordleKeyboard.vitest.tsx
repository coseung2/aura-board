import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KordleKeyboard } from "../KordleKeyboard";

describe("KordleKeyboard - Korean jamo keys", () => {
  it("emits canonical lead/medial/trail jamo code points and disables the blank trail", () => {
    render(
      <KordleKeyboard locale="ko-KR" letterStates={new Map()} onKey={() => {}} />,
    );
    const buttons = screen.getAllByRole("button");
    let leads = 0;
    let medials = 0;
    let trails = 0;
    for (const btn of buttons) {
      const text = btn.textContent ?? "";
      // Skip the action buttons and the blank trail slot (empty text).
      if (text === "확인" || text === "지움" || text === "") continue;
      const cp = text.codePointAt(0) ?? 0;
      if (cp >= 0x1100 && cp <= 0x1112) leads++;
      else if (cp >= 0x1161 && cp <= 0x1175) medials++;
      else if (cp >= 0x11a8 && cp <= 0x11c2) trails++;
      else throw new Error(`unexpected key text: ${JSON.stringify(text)} (U+${cp.toString(16)})`);
    }
    expect(leads).toBe(19);
    expect(medials).toBe(21);
    expect(trails).toBe(27);
    expect((screen.getByLabelText("종성 없음") as HTMLButtonElement).disabled).toBe(true);
  });
});
