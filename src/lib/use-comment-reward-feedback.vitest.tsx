import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCommentRewardFeedback } from "./use-comment-reward-feedback";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("reconciles pending to paid and stops polling after a terminal outcome", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValueOnce({ status: "pending", message: "pending" }).mockResolvedValue({ status: "paid", message: "7 지급", amount: 7 });
  const { result } = renderHook(() => useCommentRewardFeedback(request));
  await act(async () => { await result.current.track("card", "comment"); });
  expect(result.current.notice?.variant).toBe("info");
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current.notice).toMatchObject({ variant: "success", message: "7 지급" });
  await act(async () => { await vi.advanceTimersByTimeAsync(100000); });
  expect(request).toHaveBeenCalledTimes(2);
});
it("ignores a response after unmount", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValue({ status: "pending", message: "pending" });
  const { result, unmount } = renderHook(() => useCommentRewardFeedback(request));
  await act(async () => { await result.current.track("card", "comment"); });
  unmount();
  await vi.advanceTimersByTimeAsync(10000);
  expect(request).toHaveBeenCalledTimes(1);
});
