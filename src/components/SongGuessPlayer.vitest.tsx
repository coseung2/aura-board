import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessClipSnapshot } from "@/lib/song-guess/contracts";
import { SongGuessPlayer } from "./SongGuessPlayer";

const clip: SongGuessClipSnapshot = { assetId: "private-clip", tierMs: 15000, durationMs: 15000, mimeType: "audio/wav", sizeBytes: 1323044 };

beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("song-guess audio player", () => {
  it("plays the authorized file only after a gesture and reports play/pause", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const onPlayingChange = vi.fn();
    const { container } = render(<SongGuessPlayer sessionId="session-1" clip={clip} onPlayingChange={onPlayingChange} />);
    const audio = screen.getByLabelText("15초 음악 클립") as HTMLAudioElement;
    expect(audio).toHaveAttribute("src", "/api/song-guess/sessions/session-1/clips/private-clip");
    expect(audio).toHaveAttribute("preload", "none");
    expect(audio.autoplay).toBe(false);
    expect(container.querySelector("iframe")).toBeNull();
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "음악 재생" }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    fireEvent.play(audio);
    Object.defineProperty(audio, "paused", { configurable: true, value: false });
    expect(screen.getByRole("button", { name: "음악 일시정지" })).toHaveAttribute("aria-pressed", "true");
    expect(onPlayingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "음악 일시정지" }));
    fireEvent.pause(audio);
    expect(audio.pause).toHaveBeenCalled();
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
  });

  it("restarts the file from zero after it ends", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<SongGuessPlayer sessionId="session-1" clip={clip} />);
    const audio = screen.getByLabelText("15초 음악 클립") as HTMLAudioElement;
    fireEvent.click(screen.getByRole("button", { name: "음악 재생" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "음악 다시 재생" })).toBeEnabled());
    audio.currentTime = 15;
    Object.defineProperty(audio, "ended", { configurable: true, value: true });
    fireEvent.ended(audio);
    fireEvent.click(screen.getByRole("button", { name: "음악 다시 재생" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(audio.currentTime).toBe(0);
  });

  it("allows retry after playback is rejected", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("not allowed")).mockResolvedValue();
    render(<SongGuessPlayer sessionId="session-1" clip={clip} />);
    fireEvent.click(screen.getByRole("button", { name: "음악 재생" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다시 시도");
    fireEvent.click(screen.getByRole("button", { name: "음악 재생" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops on background, unmount, and a late play completion", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(pending);
    const onPlayingChange = vi.fn();
    const { unmount } = render(<SongGuessPlayer sessionId="session-1" clip={clip} onPlayingChange={onPlayingChange} />);
    const audio = screen.getByLabelText("15초 음악 클립") as HTMLAudioElement;
    fireEvent.click(screen.getByRole("button", { name: "음악 재생" }));
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
    unmount();
    await act(async () => { finish(); await pending; });
    expect(audio.pause).toHaveBeenCalledTimes(3);
  });

  it("never loads a video provider for a legacy entry without an audio file", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<SongGuessPlayer sessionId="session-1" clip={{ ...clip, mimeType: "video/youtube", sizeBytes: 0 }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("음원 파일이 없는 문제");
    expect(container.querySelector("audio, iframe")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
