import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KordleKeyboard } from "../KordleKeyboard";

describe("KordleKeyboard - Korean jamo keys", () => {
  it("renders a Korean QWERTY keyboard with compatibility jamo labels", () => {
    render(
      <KordleKeyboard locale="ko-KR" letterStates={new Map()} onKey={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "ㅂ" }).textContent).toBe("ㅂ");
    expect(screen.getByRole("button", { name: "ㅓ" }).textContent).toBe("ㅓ");
    expect(screen.getByRole("button", { name: "확인" }).textContent).toBe("확인");
    expect(screen.getByRole("button", { name: "지움" }).textContent).toBe("지움");
    expect(screen.getAllByRole("button")).toHaveLength(28);
  });
});
