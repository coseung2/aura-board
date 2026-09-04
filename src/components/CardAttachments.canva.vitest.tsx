import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./CanvaEmbedSlot", () => ({
  CanvaEmbedSlot: ({ allowLive }: { allowLive?: boolean }) => (
    <div data-testid="canva-slot" data-allow-live={String(allowLive ?? true)} />
  ),
}));
vi.mock("./cards/CardVideoProvider", () => ({
  useCardVideoPlayer: () => null,
}));

import { CardAttachments } from "./CardAttachments";

describe("CardAttachments Canva detail playback", () => {
  it("keeps live Canva playback enabled in the detail variant", () => {
    render(
      <CardAttachments
        variant="detail"
        linkUrl="https://www.canva.com/design/DAFexample/share-token/view"
        linkTitle="수업 자료"
      />,
    );

    expect(
      screen.getByTestId("canva-slot").getAttribute("data-allow-live"),
    ).toBe("true");
  });
});
