import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("shows one profile name with a chevron only for a dual-role account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ canSwitchToParent: true }))));
    const { container } = render(<AuthHeader />);
    await waitFor(() => expect(container.querySelector("summary.auth-profile-trigger")).not.toBeNull());
    const trigger = container.querySelector("summary")!;
    expect(trigger.textContent).toBe("김교사");
    expect(screen.getAllByText("김교사")).toHaveLength(1);
    expect(trigger.querySelector(".auth-role-chevron")).toBeTruthy();
    expect(trigger.querySelector(".auth-role-icon")).toBeNull();
    expect(screen.queryByText("교사", { exact: true })).toBeNull();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
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
    expect(screen.getByText("김교사")).toBeTruthy();
    expect(container.querySelector(".auth-role-chevron")).toBeNull();
  });
});
