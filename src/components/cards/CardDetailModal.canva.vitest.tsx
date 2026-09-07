import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardDetailModal } from "./CardDetailModal";
import type { CardData } from "../DraggableCard";

vi.mock("../CardAttachments", () => ({
  CardAttachments: () => (
    <div className="card-attachments">
      <div className="card-canva-slot">
        <div className="card-canva-slot-frame" />
      </div>
    </div>
  ),
}));

vi.mock("../engagement/CardEngagement", () => ({ CardEngagement: () => null }));
vi.mock("../moderation/StudentContentModeration", () => ({
  HiddenContentPlaceholder: () => null,
  StudentContentModerationControls: () => null,
  useStudentContentHidden: () => ({ hidden: null, setHidden: vi.fn() }),
}));

afterEach(() => cleanup());

const card = {
  id: "canva-card",
  title: "Canva 디자인",
  content: "",
  color: null,
  imageUrl: null,
  videoUrl: null,
  linkUrl: "https://www.canva.com/design/DAFexample/view",
  linkTitle: null,
  linkDesc: null,
  linkImage: null,
  authorId: null,
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  order: 0,
  attachments: [],
} as CardData;

describe("CardDetailModal Canva presentation surface", () => {
  it("marks Canva media so fullscreen CSS can strip the card attachment wrapper", () => {
    render(<CardDetailModal card={card} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Canva 디자인" });
    expect(dialog.getAttribute("data-canva-media")).toBe("true");
    expect(dialog.querySelector(".card-attachments")).toBeTruthy();
    expect(dialog.querySelector(".card-canva-slot-frame")).toBeTruthy();
  });
});
