import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CardAttachments } from "../CardAttachments";
import { CardBody } from "./CardBody";
import { CardDetailModal } from "./CardDetailModal";
import { CardVideoProvider } from "./CardVideoProvider";

vi.mock("../engagement/CardEngagement", () => ({
  CardEngagement: () => null,
}));

vi.mock("../moderation/StudentContentModeration", () => ({
  HiddenContentPlaceholder: () => null,
  StudentContentModerationControls: () => null,
  useStudentContentHidden: () => ({ hidden: null, setHidden: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() =>
    Promise.resolve(),
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const uploadUrl = "https://storage.example.test/video.mp4";

function ModalHandoffHarness({ upload }: { upload: boolean }) {
  const videoUrl = upload ? uploadUrl : youtubeUrl;
  const [open, setOpen] = useState(false);

  return (
    <CardVideoProvider>
      <section data-testid="card-surface">
        <CardAttachments
          cardId="card-1"
          videoUrl={videoUrl}
          variant="thumbnail"
        />
      </section>
      <button type="button" onClick={() => setOpen(true)}>
        open modal
      </button>
      {open && (
        <section data-testid="modal-surface">
          <CardAttachments
            cardId="card-1"
            videoUrl={videoUrl}
            variant="detail"
          />
        </section>
      )}
    </CardVideoProvider>
  );
}

function CardDetailModalHarness() {
  const [open, setOpen] = useState(false);
  const card = {
    id: "card-1",
    title: "영상 카드",
    content: "",
    color: null,
    videoUrl: youtubeUrl,
    authorId: null,
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    order: 0,
  };

  return (
    <CardVideoProvider>
      <section data-testid="card-surface">
        <CardBody card={card} showEngagement={false} />
      </section>
      <button type="button" onClick={() => setOpen(true)}>
        open detail modal
      </button>
      <CardDetailModal
        card={open ? card : null}
        onClose={() => setOpen(false)}
      />
    </CardVideoProvider>
  );
}

describe("CardVideoProvider", () => {
  it("keeps one YouTube iframe when an active card video is promoted to detail", async () => {
    const { container } = render(<ModalHandoffHarness upload={false} />);

    fireEvent.click(container.querySelector(".card-attach-media-poster")!);
    await waitFor(() => {
      expect(container.querySelector(".card-video-player-layer iframe")).toBeTruthy();
    });
    const iframeBefore = container.querySelector(".card-video-player-layer iframe");
    expect(iframeBefore).toBeTruthy();
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(iframeBefore?.getAttribute("src")).toContain("autoplay=1");
    expect(iframeBefore?.getAttribute("src")).toContain("enablejsapi=1");

    fireEvent.click(screen.getByRole("button", { name: "open modal" }));

    const iframeAfter = container.querySelector(".card-video-player-layer iframe");
    expect(iframeAfter).toBe(iframeBefore);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(screen.getByTestId("modal-surface")).toBeTruthy();
  });

  it("keeps the same uploaded video element and its playback state on handoff", async () => {
    const { container } = render(<ModalHandoffHarness upload />);

    fireEvent.click(container.querySelector(".card-attach-media-poster")!);
    await waitFor(() => {
      expect(container.querySelector(".card-video-player-layer video")).toBeTruthy();
    });
    const videoBefore = container.querySelector<HTMLVideoElement>(
      ".card-video-player-layer video",
    );
    expect(videoBefore).toBeTruthy();
    expect(videoBefore?.hasAttribute("controls")).toBe(true);
    if (videoBefore) {
      Object.defineProperty(videoBefore, "currentTime", {
        configurable: true,
        value: 12,
        writable: true,
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "open modal" }));

    const videoAfter = container.querySelector<HTMLVideoElement>(
      ".card-video-player-layer video",
    );
    expect(videoAfter).toBe(videoBefore);
    expect(videoAfter?.currentTime).toBe(12);
    expect(container.querySelectorAll("video")).toHaveLength(1);
  });

  it("wires the real card body and detail modal to the same player", async () => {
    const { container } = render(<CardDetailModalHarness />);

    fireEvent.click(container.querySelector(".card-attach-media-poster")!);
    await waitFor(() => {
      expect(container.querySelector(".card-video-player-layer iframe")).toBeTruthy();
    });
    const iframeBefore = container.querySelector(".card-video-player-layer iframe");

    fireEvent.click(screen.getByRole("button", { name: "open detail modal" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "영상 카드" })).toBeTruthy();
    });

    expect(container.querySelector(".card-video-player-layer iframe")).toBe(iframeBefore);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(
      screen
        .getByRole("dialog", { name: "영상 카드" })
        .querySelector(".card-video-player-layer iframe"),
    ).toBe(iframeBefore);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "영상 카드" })).toBeNull();
    });
    expect(
      screen
        .getByTestId("card-surface")
        .querySelector(".card-video-player-layer iframe"),
    ).toBe(iframeBefore);
  });
});
