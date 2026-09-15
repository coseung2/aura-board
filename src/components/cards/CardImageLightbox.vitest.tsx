import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardImageLightbox } from "./CardImageLightbox";

const images = [
  { id: "image-1", url: "/first.jpg", alt: "첫 이미지" },
  { id: "image-2", url: "/second.jpg", alt: "둘째 이미지" },
];

afterEach(() => {
  cleanup();
});

describe("CardImageLightbox zoom", () => {
  it("zooms with controls and resets to the original size", () => {
    render(
      <CardImageLightbox images={images} initialIndex={0} onClose={vi.fn()} />,
    );

    const image = screen.getByRole("img", { name: "첫 이미지" });
    fireEvent.click(screen.getByRole("button", { name: "확대" }));

    expect(image.style.transform).toContain("scale(1.5)");
    expect(screen.getByRole("button", { name: "원래 크기로" }).textContent).toBe(
      "150%",
    );

    fireEvent.click(screen.getByRole("button", { name: "원래 크기로" }));
    expect(image.style.transform).toContain("scale(1)");
  });

  it("supports keyboard zoom and resets when navigating images", () => {
    render(
      <CardImageLightbox images={images} initialIndex={0} onClose={vi.fn()} />,
    );

    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByRole("img", { name: "첫 이미지" }).style.transform).toContain(
      "scale(1.5)",
    );

    fireEvent.click(screen.getByRole("button", { name: "다음 이미지" }));
    expect(screen.getByRole("img", { name: "둘째 이미지" }).style.transform).toContain(
      "scale(1)",
    );
  });

  it("toggles two-times zoom on double click", () => {
    render(
      <CardImageLightbox images={images.slice(0, 1)} initialIndex={0} onClose={vi.fn()} />,
    );

    const stage = screen.getByRole("img", { name: "첫 이미지" }).parentElement!;
    fireEvent.doubleClick(stage);
    expect(screen.getByRole("img").style.transform).toContain("scale(2)");

    fireEvent.doubleClick(stage);
    expect(screen.getByRole("img").style.transform).toContain("scale(1)");
  });
});
