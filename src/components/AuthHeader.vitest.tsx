import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthHeader } from "./AuthHeader";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "김교사", image: null },
    },
  }),
  signOut: vi.fn(),
}));
vi.mock("./TeacherNotificationBell", () => ({
  TeacherNotificationBell: () => <button aria-label="알림" />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthHeader teacher actions", () => {
  it("keeps notifications and settings but removes the standalone Jam Live icon", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ canSwitchToParent: false }), {
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    const { container } = render(<AuthHeader />);

    expect(screen.getByRole("button", { name: "알림" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "교사 설정으로 이동" })).toBeTruthy();
    expect(container.querySelector('a[href="/live-quiz"]')).toBeNull();
    expect(screen.queryByText("📡")).toBeNull();
  });
});
