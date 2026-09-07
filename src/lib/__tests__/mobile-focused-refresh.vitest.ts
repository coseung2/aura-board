// A native-only test uses the .vitest.ts exclusion from the web type program.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ listener: null as null | ((state: string) => void), remove: vi.fn() }));
vi.mock("../../../apps/mobile/node_modules/react", async () => await import("react"));
vi.mock("../../../apps/mobile/node_modules/react-native", () => ({ AppState: { currentState: "active", addEventListener: vi.fn((_event, listener) => { native.listener = listener; return { remove: native.remove }; }) } }));
vi.mock("../../../apps/mobile/node_modules/expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (callback: () => void | (() => void)) => useEffect(callback, [callback]) };
});
import { useFocusedRefresh } from "../../../apps/mobile/hooks/use-focused-refresh";

describe("visible mobile route recovery", () => {
  afterEach(() => { cleanup(); native.listener = null; native.remove.mockClear(); vi.useRealTimers(); });
  it("recovers on foreground and scope changes without refetching on every render", async () => {
    vi.useFakeTimers();
    const reload = vi.fn(async () => undefined);
    const hook = renderHook(({ scope }) => useFocusedRefresh(reload, scope), { initialProps: { scope: "class-a" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(reload).toHaveBeenCalledTimes(1);
    hook.rerender({ scope: "class-a" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => native.listener?.("background"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    act(() => native.listener?.("active"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(reload).toHaveBeenCalledTimes(2);
    hook.rerender({ scope: "class-b" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(reload).toHaveBeenCalledTimes(3);
    hook.unmount();
    expect(native.remove).toHaveBeenCalledTimes(2);
  });
});
