import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

vi.mock("./Logo", () => ({ Logo: () => <span>Aura</span> }));
vi.mock("./AuthHeader", () => ({ AuthHeader: () => <span>계정</span> }));
vi.mock("./MegaNav", () => ({
  MegaNav: ({ items }: { items: Array<{ groups: Array<{ links: Array<{ label: string }> }> }> }) => (
    <nav>{items.flatMap((item) => item.groups.flatMap((group) => group.links.map((link) => link.label))).join("|")}</nav>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopNav teacher navigation loading", () => {
  it("distinguishes a successful empty result from a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ classrooms: [], boards: [] }))));
    const { unmount } = render(<TopNav />);

    await waitFor(() => expect(screen.getByText(/학급을 먼저 만들어 주세요/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    render(<TopNav />);

    expect((await screen.findByRole("alert")).textContent).toContain("메뉴 로드 실패");
  });

  it("retries a failure and prevents duplicate retry requests", async () => {
    let resolveRetry: ((response: Response) => void) | undefined;
    const retryResponse = new Promise<Response>((resolve) => {
      resolveRetry = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockReturnValueOnce(retryResponse);
    vi.stubGlobal("fetch", fetchMock);
    render(<TopNav />);

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveRetry?.(new Response(JSON.stringify({ classrooms: [], boards: [] })));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
