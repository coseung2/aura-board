import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessClipSnapshot } from "@/lib/song-guess/contracts";
import { SongGuessPlayer } from "./SongGuessPlayer";

const clip: SongGuessClipSnapshot = { assetId: "private-clip", tierMs: 15000, durationMs: 15000, mimeType: "audio/wav", sizeBytes: 1323044 };
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
function visibility(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  fireEvent(document, new Event("visibilitychange"));
}

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
  else Reflect.deleteProperty(document, "hidden");
});

describe("round-owned song playback", () => {
  it.each([500, 7200, 15000, 41000])("loops the actual asset (%dms metadata) without a separate clip timeline", async (durationMs) => {
    const change = vi.fn();
    const { container } = render(<SongGuessPlayer sessionId="session" clip={{ ...clip, durationMs }} remainingMs={23000} onPlayingChange={change} />);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    const audio = container.querySelector("audio")!;
    expect(audio).toHaveAttribute("src", "/api/song-guess/sessions/session/clips/private-clip");
    expect(audio.loop).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).not.toContain("하이라이트");
    fireEvent.play(audio);
    expect(change).toHaveBeenLastCalledWith(true);
  });

  it("shows an unlock control only when autoplay is rejected", async () => {
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={8000} />);
    fireEvent.click(await screen.findByRole("button", { name: "소리 켜기" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("retries loading failures rather than exposing a permanently disabled play button", async () => {
    const { container } = render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={8000} />);
    await act(async () => undefined);
    fireEvent.error(container.querySelector("audio")!);
    fireEvent.click(screen.getByRole("button", { name: "다시 재생" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it("stops at the server deadline even without another snapshot and cannot resume after it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={2300} />);
    await act(async () => undefined);
    const initial = pause.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(2299); });
    expect(pause).toHaveBeenCalledTimes(initial);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(pause.mock.calls.length).toBeGreaterThan(initial);
    act(() => { visibility(true); visibility(false); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not play an already expired round", async () => {
    render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={0} />);
    await act(async () => undefined);
    expect(play).not.toHaveBeenCalled();
  });

  it("preserves playback through routine countdown, mute and callback updates", async () => {
    const { rerender, container } = render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={10000} />);
    await act(async () => undefined);
    rerender(<SongGuessPlayer sessionId="s" clip={{ ...clip }} remainingMs={9000} muted onPlayingChange={() => undefined} />);
    await act(async () => undefined);
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")!.muted).toBe(true);
  });

  it("stops on background/unmount and ignores a late play completion", async () => {
    let finish!: () => void;
    play.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { unmount } = render(<SongGuessPlayer sessionId="s" clip={clip} remainingMs={10000} />);
    act(() => visibility(true));
    expect(pause).toHaveBeenCalled();
    unmount();
    const previous = pause.mock.calls.length;
    await act(async () => finish());
    expect(pause.mock.calls.length).toBeGreaterThan(previous);
  });

  it("never loads a video provider or fabricates a timer for legacy missing audio", () => {
    const { container } = render(<SongGuessPlayer sessionId="s" clip={{ ...clip, mimeType: "video/youtube" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("음원 파일이 없는 문제예요.");
    expect(container.querySelector("audio, iframe")).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});
