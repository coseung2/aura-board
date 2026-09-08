import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatingReveal } from "../SeatingReveal";

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
const sources: string[] = [];
const complete = vi.fn();
const progress = vi.fn();
const students = [{ id: "a", name: "하나", number: 1 }, { id: "b", name: "두나", number: 2 }];
function element(muted = false) {
  return <SeatingReveal groups={[{ name: "1모둠", studentIds: ["a", "b"] }]} students={students} onComplete={complete} onProgress={progress} muted={muted} />;
}
function show(muted = false) { return render(element(muted)); }
describe("seating reveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    complete.mockClear(); play.mockClear(); pause.mockClear(); sources.length = 0;
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true,
      value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("Audio", class {
      volume = 1;
      constructor(source: string) { sources.push(source); }
      play = play; pause = pause;
      removeAttribute() {} load() {}
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("counts down, shuffles, reveals individually and commits once", () => {
    show();
    expect(screen.queryByText("1번 하나")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText("자리를 섞고 있어요")).toBeTruthy();
    expect(sources).toContain("/sounds/seating/shuffle.ogg");
    act(() => vi.advanceTimersByTime(600));
    expect(progress).toHaveBeenLastCalledWith(1, false);
    expect(screen.queryByText("2번 두나")).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(220));
    expect(progress).toHaveBeenLastCalledWith(2, false);
    expect(sources.at(-1)).toBe("/sounds/song-guess/podium.ogg");
    act(() => vi.advanceTimersByTime(650));
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("renders only the count and accessible status, without an inserted toolbar", () => {
    const view = show();
    expect(view.container.querySelector("header")).toBeNull();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("honors saved mute before the first cue and stops audio on mute", () => {
    const view = show(true);
    expect(play).not.toHaveBeenCalled();
    view.rerender(element(false));
    expect(play).toHaveBeenCalledTimes(1);
    view.rerender(element(true));
    expect(pause).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(700));
    expect(play).toHaveBeenCalledTimes(1);
  });
  it("cleans up timers and sound on unmount", () => {
    const view = show();
    view.unmount();
    act(() => vi.runAllTimers());
    expect(complete).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });
});
