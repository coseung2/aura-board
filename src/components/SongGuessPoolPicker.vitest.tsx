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
    fireEvent.change(screen.getByLabelText("듣기 구간"), { target: { value: "intro" } });
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
});
