import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HiddenContentManager } from "./HiddenContentManager";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HiddenContentManager", () => {
  it("restores a target and reloads the confirmed server list", async () => {
    let restored = false;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          restored = true;
          return new Response(JSON.stringify({ ok: true }));
        }
        return new Response(
          JSON.stringify({
            items: restored
              ? []
              : [
                  {
                    targetKind: "card",
                    targetId: "card-persisted",
                    viaReport: true,
                    createdAt: "2026-07-25T00:00:00.000Z",
                  },
                ],
            authors: [],
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<HiddenContentManager />);
    await screen.findByText("카드 #card-per…");
    fireEvent.click(screen.getByRole("button", { name: "복원" }));

    await screen.findByText("숨긴 콘텐츠가 없어요");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      scope: "target",
      targetKind: "card",
      targetId: "card-persisted",
    });
  });

  it("shows the session recovery state on unauthorized reload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    render(<HiddenContentManager />);

    await waitFor(() =>
      expect(screen.getByText("로그인이 필요해요")).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: "다시 로그인" }).getAttribute("href"),
    ).toBe("/login?from=/student/hidden-content");
  });
});
