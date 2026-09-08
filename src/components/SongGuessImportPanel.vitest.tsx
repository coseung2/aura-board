import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SongGuessImportPanel } from "./SongGuessImportPanel";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const item = { id: "import-one", sourceUrl: "https://youtu.be/abcdefghijk?t=45", startSeconds: 45, status: "ready", title: "Song", artist: "Artist", error: null };
it("keeps imports in the board scope and materializes only after teacher action", async () => {
  const added = vi.fn();
  const fetcher = vi.fn(async (_url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    return { ok: true, json: async () => body?.action === "materialize" ? { title: "Edited", artist: "Artist", clip: { id: "asset-one" } } : { items: [item], item } };
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SongGuessImportPanel boardId="board-one" disabled={false} onAdd={added} />);
  await screen.findByDisplayValue("Song");
  expect(added).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("등록곡 노래 제목"), { target: { value: "Edited" } });
  fireEvent.click(screen.getByText("문제에 추가"));
  await waitFor(() => expect(added).toHaveBeenCalledWith(expect.objectContaining({ title: "Edited" })));
  expect(fetcher.mock.calls.every(([url]) => url === "/api/song-guess/boards/board-one/imports")).toBe(true);
  const mutations = fetcher.mock.calls.filter(([,options]) => options?.method !== "GET");
  expect(mutations.map(([, options]) => options.method)).toEqual(["PATCH", "POST"]);
});
it("shows processing state and does not offer unusable audio as a question", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ ...item, status: "processing" }] }) })));
  render(<SongGuessImportPanel boardId="board-one" disabled={false} onAdd={vi.fn()} />);
  await screen.findByText("15초 음원을 준비하고 있어요…");
  expect(screen.queryByText("문제에 추가")).not.toBeInTheDocument();
  expect(screen.getByText("목록에서 삭제")).toBeDisabled();
});
it("preserves the entered link when submission fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => options.method === "POST"
    ? { ok: false, json: async () => ({ error: "invalid_song_guess_import_link" }) }
    : { ok: true, json: async () => ({ items: [] }) }));
  render(<SongGuessImportPanel boardId="board-one" disabled={false} onAdd={vi.fn()} />);
  const input = screen.getByLabelText("시작 시간이 포함된 유튜브 링크");
  fireEvent.change(input, { target: { value: "https://youtu.be/abcdefghijk" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByRole("alert");
  expect(input).toHaveValue("https://youtu.be/abcdefghijk");
});
