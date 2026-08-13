import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import { useParentPosts } from "./useParentPosts";

const parentFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/parent-fetch", () => ({
  parentFetch: parentFetchMock,
}));

const post = (id: string) => ({ id, title: id }) as ParentPostDTO;
const payload = (id: string, nextCursor: string | null = null) => ({
  items: [post(id)],
  nextCursor,
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("useParentPosts continuity and cache", () => {
  beforeEach(() => {
    parentFetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps warm content visible while a changed endpoint loads", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    parentFetchMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const hook = renderHook(({ endpoint }: { endpoint: string }) => useParentPosts(endpoint), {
      initialProps: { endpoint: "/api/parent/feed?child=continuity-a" },
    });

    await act(async () => first.resolve(response(payload("old-post"))));
    await waitFor(() => expect(hook.result.current.data?.items[0]?.id).toBe("old-post"));

    hook.rerender({ endpoint: "/api/parent/feed?child=continuity-b" });

    expect(hook.result.current.data?.items[0]?.id).toBe("old-post");
    expect(hook.result.current.loading).toBe(false);
    expect(parentFetchMock).toHaveBeenCalledTimes(2);

    await act(async () => second.resolve(response(payload("new-post"))));
    await waitFor(() => expect(hook.result.current.data?.items[0]?.id).toBe("new-post"));
  });

  it("restores a fresh endpoint cache immediately on a later mount", async () => {
    const first = deferred<Response>();
    parentFetchMock.mockReturnValueOnce(first.promise);
    const endpoint = "/api/parent/feed?child=cache-restore";
    const firstHook = renderHook(() => useParentPosts(endpoint));

    await act(async () => first.resolve(response(payload("cached-post"))));
    await waitFor(() => expect(firstHook.result.current.data?.items[0]?.id).toBe("cached-post"));
    firstHook.unmount();

    const restoredHook = renderHook(() => useParentPosts(endpoint));
    expect(restoredHook.result.current.data?.items[0]?.id).toBe("cached-post");
    expect(restoredHook.result.current.loading).toBe(false);
    expect(parentFetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale first-page response after switching endpoints", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    parentFetchMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const hook = renderHook(({ endpoint }: { endpoint: string }) => useParentPosts(endpoint), {
      initialProps: { endpoint: "/api/parent/feed?child=stale-a" },
    });

    hook.rerender({ endpoint: "/api/parent/feed?child=stale-b" });
    await act(async () => newRequest.resolve(response(payload("newer-post"))));
    await waitFor(() => expect(hook.result.current.data?.items[0]?.id).toBe("newer-post"));

    await act(async () => oldRequest.resolve(response(payload("stale-post"))));
    await act(async () => undefined);
    expect(hook.result.current.data?.items[0]?.id).toBe("newer-post");
  });

  it("retains data and exposes retry when revalidation fails", async () => {
    const first = deferred<Response>();
    parentFetchMock.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("offline"));
    const endpoint = "/api/parent/feed?child=revalidate";
    const hook = renderHook(() => useParentPosts(endpoint));

    await act(async () => first.resolve(response(payload("retained-post"))));
    await waitFor(() => expect(hook.result.current.data?.items[0]?.id).toBe("retained-post"));

    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.error).toBe("load_failed"));
    expect(hook.result.current.data?.items[0]?.id).toBe("retained-post");
    expect(hook.result.current.loading).toBe(false);
  });

  it("does not merge a load-more response into a newer endpoint", async () => {
    const first = deferred<Response>();
    const oldPage = deferred<Response>();
    const newFirstPage = deferred<Response>();
    parentFetchMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(newFirstPage.promise);
    const hook = renderHook(
      ({ endpoint }: { endpoint: string }) => useParentPosts(endpoint),
      { initialProps: { endpoint: "/api/parent/feed?child=page-a" } },
    );

    await act(async () => first.resolve(response(payload("page-a-1", "cursor-a"))));
    await waitFor(() => expect(hook.result.current.data?.nextCursor).toBe("cursor-a"));
    act(() => void hook.result.current.loadMore());
    hook.rerender({ endpoint: "/api/parent/feed?child=page-b" });

    await act(async () => oldPage.resolve(response(payload("page-a-2"))));
    await act(async () => newFirstPage.resolve(response(payload("page-b-1"))));
    await waitFor(() => expect(hook.result.current.data?.items[0]?.id).toBe("page-b-1"));
    expect(hook.result.current.data?.items.map((item) => item.id)).toEqual(["page-b-1"]);
  });
});
