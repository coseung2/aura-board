import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePickerSound } from "./usePickerSound";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it("stops overlapping sounds, persists mute, and ignores closed-panel callbacks", async () => {
  const start = vi.fn();
  const stop = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
  vi.stubGlobal("AudioContext", class {
    state = "running";
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = close;
    decodeAudioData = vi.fn().mockResolvedValue({});
    createBufferSource = () => ({ connect: vi.fn(), disconnect: vi.fn(), start, stop, buffer: null, onended: null });
    createGain = () => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() });
  });
  const { result, rerender, unmount } = renderHook(({ open }) => usePickerSound(open), { initialProps: { open: true } });
  act(() => result.current.prepare());
  await waitFor(() => { result.current.play("tick"); expect(start).toHaveBeenCalled(); });
  act(() => result.current.play("complete"));
  expect(stop).toHaveBeenCalled();
  act(() => result.current.toggle());
  expect(localStorage.getItem("aura.student-picker.sound")).toBe("false");
  const count = start.mock.calls.length;
  act(() => result.current.play("tick"));
  expect(start).toHaveBeenCalledTimes(count);
  act(() => result.current.toggle());
  rerender({ open: false });
  act(() => result.current.play("complete"));
  expect(start).toHaveBeenCalledTimes(count);
  unmount();
  expect(close).toHaveBeenCalled();
});
