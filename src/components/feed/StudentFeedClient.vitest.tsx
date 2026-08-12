import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentFeedClient } from "./StudentFeedClient";

vi.mock("./FeedComposer", () => ({
  FeedComposer: ({ onSubmit }: { onSubmit: (draft: unknown) => Promise<void> }) => (
    <button
      type="button"
      onClick={() => void onSubmit({ title: "새 소식", body: null, media: [] })}
    >
      테스트 게시
    </button>
  ),
}));

vi.mock("./FeedList", () => ({
  FeedList: ({ items }: { items: unknown[] }) => <div>items:{items.length}</div>,
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudentFeedClient", () => {
  it("loads classroom/global scopes and posts without a caller-controlled classroom", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return json({ postId: "post-1", publicationId: "pub-1" }, 201);
      if (url.includes("scope=global")) {
        return json({
          items: [{
            publicationId: "global-1",
            postId: "post-global",
            scope: "GLOBAL",
            classroomId: null,
            authorKind: "PLATFORM",
            authorDisplayName: "Aura 공식",
            title: "전체 소식",
            body: null,
            publishedAt: "2026-08-12T00:00:00.000Z",
            media: [],
          }],
          nextCursor: null,
        });
      }
      return json({ items: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudentFeedClient />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/student/feed?scope=classroom"),
        expect.any(Object),
      ),
    );

    fireEvent.click(screen.getByRole("tab", { name: "전체" }));
    await waitFor(() => expect(screen.getByText("items:1")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("scope=global"),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("tab", { name: "우리 반" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "테스트 게시" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "테스트 게시" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const [, postInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    const payload = JSON.parse(String(postInit?.body));
    expect(payload).toEqual({ title: "새 소식", body: null, media: [] });
    expect(payload).not.toHaveProperty("classroomId");
    expect(payload).not.toHaveProperty("scope");
  });
});
