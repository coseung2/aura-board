import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClassroomFirstRunSpotlight } from "./ClassroomFirstRunSpotlight";

afterEach(cleanup);

// jsdom 에는 없는 스크롤 API — 안내가 대상 카드를 화면 가운데로 당긴다.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderSpotlight(onDismiss = vi.fn()) {
  const target = document.createElement("a");
  target.id = "classroom-card-students";
  target.textContent = "학생 명단";
  document.body.append(target);
  render(
    <ClassroomFirstRunSpotlight
      targetId="classroom-card-students"
      message="학생 명단에서 학생을 추가하세요"
      actionHref="/classroom/classroom-1/students?add=1"
      actionLabel="학생 추가"
      onDismiss={onDismiss}
    />,
  );
  return { target, onDismiss };
}

describe("ClassroomFirstRunSpotlight", () => {
  it("dims the page and highlights the student card with a direct action", () => {
    const { target } = renderSpotlight();

    expect(screen.getByText("학생 명단에서 학생을 추가하세요")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "학생 추가" });
    expect(cta.getAttribute("href")).toBe("/classroom/classroom-1/students?add=1");
    expect(document.querySelector(".classroom-first-run-hole")).not.toBeNull();

    target.remove();
  });

  it("closes on the close button and on Escape", () => {
    const { target, onDismiss } = renderSpotlight();

    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);

    target.remove();
  });

  it("leaves clicks on the highlighted card alone", () => {
    const { target, onDismiss } = renderSpotlight();

    fireEvent.pointerDown(target);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    target.remove();
  });
});
