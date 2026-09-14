import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SongGuessPoolPicker } from "./SongGuessPoolPicker";

const catalog = {
  categories: [
    { id: "girl-idol", label: "여자 아이돌", counts: { intro: 1, highlight: 1 } },
    { id: "classical", label: "클래식", counts: { intro: 1, highlight: 0 } },
  ],
  songs: [
    {
      id: "girl-song",
      title: "Girl Song",
      artist: "Artist",
      aliases: [],
      categories: ["girl-idol"],
      sourceUrl: "https://example.com/girl",
      segments: { intro: true, highlight: true },
    },
    {
      id: "classical-song",
      title: "Classical Song",
      artist: "Artist",
      aliases: [],
      categories: ["classical"],
      sourceUrl: "https://example.com/classical",
      segments: { intro: true, highlight: false },
    },
  ],
} as const;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SongGuessPoolPicker", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response(catalog));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads the pool, applies category and segment filters, and prepares the selected count", async () => {
    const onPrepared = vi.fn();
    fetchMock
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(response({ setup: { rounds: [{ id: "round-1" }] } }, 201));

    render(<SongGuessPoolPicker boardId="board-1" busy={false} onPrepared={onPrepared} />);
    await screen.findByRole("button", { name: /여자 아이돌/ });

    fireEvent.click(screen.getByRole("button", { name: /여자 아이돌/ }));
    fireEvent.click(screen.getByRole("button", { name: "도입" }));
    const prepareButton = screen.getByRole("button", { name: "1문제 준비하기" });
    expect(prepareButton).toBeEnabled();
    fireEvent.click(prepareButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ categories: ["girl-idol"], segment: "intro", count: 1 }),
    });
    await waitFor(() => expect(onPrepared).toHaveBeenCalledWith({ rounds: [{ id: "round-1" }] }));
  });

  it("exposes segment and count as pressed buttons with a pool estimate", async () => {
    render(<SongGuessPoolPicker boardId="board-1" busy={false} onPrepared={vi.fn()} />);
    const highlight = await screen.findByRole("button", { name: "하이라이트" });
    expect(highlight).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "도입" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "1문제" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("img", { name: /조건에 맞는 1곡/ })).toBeInTheDocument();
    expect(screen.getByText(/예상 진행/)).toBeInTheDocument();
  });

  it("keeps preparation busy until the prepared callback finishes", async () => {
    let finishPrepared!: () => void;
    const callbackPending = new Promise<void>((resolve) => {
      finishPrepared = resolve;
    });
    const onPrepared = vi.fn(() => callbackPending);
    const onPreparingChange = vi.fn();
    fetchMock
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(
        response({ setup: { rounds: [{ id: "round-1" }] } }, 201),
      );
    render(
      <SongGuessPoolPicker
        boardId="board-1"
        busy={false}
        onPrepared={onPrepared}
        onPreparingChange={onPreparingChange}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "1문제 준비하기" }),
    );
    await waitFor(() => expect(onPrepared).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "노래 준비 중…" })).toBeDisabled();
    expect(onPreparingChange).toHaveBeenCalledWith(true);
    expect(onPreparingChange).not.toHaveBeenCalledWith(false);

    finishPrepared();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "1문제 준비하기" })).toBeEnabled(),
    );
    expect(onPreparingChange).toHaveBeenLastCalledWith(false);
  });

  it("offers a retry after catalog loading fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response(catalog));
    render(<SongGuessPoolPicker boardId="board-1" busy={false} onPrepared={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("노래 풀을 불러오지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /여자 아이돌/ })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps preparation errors retryable", async () => {
    fetchMock
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(response({ error: "song_guess_catalog_insufficient_songs" }, 400))
      .mockResolvedValueOnce(response(catalog));
    render(<SongGuessPoolPicker boardId="board-1" busy={false} onPrepared={vi.fn()} />);
    await screen.findByRole("button", { name: /여자 아이돌/ });
    fireEvent.click(screen.getByRole("button", { name: "1문제 준비하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("노래를 준비하지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("explains an active-game setup lock and returns to the room list", async () => {
    const onSetupLocked = vi.fn();
    fetchMock
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(response({ error: "song_guess_setup_locked" }, 409));
    render(
      <SongGuessPoolPicker
        boardId="board-1"
        busy={false}
        onPrepared={vi.fn()}
        onSetupLocked={onSetupLocked}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "1문제 준비하기" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "진행 중인 노래 맞히기 게임이 있어 새 문제를 준비할 수 없어요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "방 목록으로 돌아가기" }));
    expect(onSetupLocked).toHaveBeenCalledOnce();
  });
});
