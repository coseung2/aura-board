import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SongGuessPoolPicker } from "./SongGuessPoolPicker";

const catalog = {
  categories: [
    { id: "girl-idol", label: "여자 아이돌", counts: { intro: 1, highlight: 1 } },
    { id: "classical", label: "클래식", counts: { intro: 1, highlight: 0 } },
  ],
  songs: [
    { id: "girl-song", categories: ["girl-idol"], segments: { intro: true, highlight: true } },
    { id: "classical-song", categories: ["classical"], segments: { intro: true, highlight: false } },
  ],
};
const prepared = { rounds: [{ id: "round-1" }] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url, init) => response(init?.method === "POST" ? { setup: prepared } : catalog));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("automatic creation settings", () => {
  it("applies category and segment filters then creates with the selected count", async () => {
    const onPrepared = vi.fn();
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={onPrepared}><span>답변 방식 설정</span></SongGuessPoolPicker>);
    fireEvent.click(await screen.findByRole("button", { name: "여자 아이돌" }));
    fireEvent.click(screen.getByRole("button", { name: "도입" }));
    expect(screen.getByText("답변 방식 설정")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(prepared));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ categories: ["girl-idol"], segment: "intro", count: 1 }) });
  });

  it("keeps one compact summary without the duplicate pool meter", async () => {
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "하이라이트" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1문제" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/1곡 중 1문제/)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /준비하기/ })).toBeNull();
  });

  it("keeps all settings locked until both preparation and creation finish", async () => {
    let finish!: () => void;
    const onPrepared = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onPreparingChange = vi.fn();
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={onPrepared} onPreparingChange={onPreparingChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "게임 만드는 중…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "도입" })).toBeDisabled();
    expect(onPreparingChange).not.toHaveBeenCalledWith(false);
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "게임 만들기" })).toBeEnabled();
    expect(onPreparingChange).toHaveBeenLastCalledWith(false);
  });

  it("retries catalog loading after a failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("노래 풀을 불러오지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("button", { name: "여자 아이돌" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries the actual preparation via the primary action, not a catalog-only refresh", async () => {
    fetchMock.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(response({ error: "song_guess_catalog_insufficient_songs" }, 400));
    const onPrepared = vi.fn();
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={onPrepared} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("선택한 조건에 맞는 음원이 부족해요.");
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[2][1].method).toBe("POST");
  });

  it("does not re-randomize a prepared pack after a lost create response", async () => {
    const onPrepared = vi.fn().mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValue(undefined);
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={onPrepared} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 만들기" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(2));
    expect(onPrepared.mock.calls[0][0]).toBe(onPrepared.mock.calls[1][0]);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("invalidates the prepared pack when category or segment changes", async () => {
    const onPrepared = vi.fn().mockRejectedValue(new TypeError("offline"));
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={onPrepared} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 만들기" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "도입" }));
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });

  it("explains the active-game lock and offers a room-list recovery", async () => {
    fetchMock.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(response({ error: "song_guess_setup_locked" }, 409));
    const onSetupLocked = vi.fn();
    render(<SongGuessPoolPicker boardId="b" busy={false} onPrepared={vi.fn()} onSetupLocked={onSetupLocked} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 만들기" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "방 목록으로 돌아가기" }));
    expect(onSetupLocked).toHaveBeenCalledOnce();
  });
});
