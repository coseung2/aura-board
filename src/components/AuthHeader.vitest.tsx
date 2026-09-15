import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthHeader } from "./AuthHeader";

const sessionUser = vi.hoisted(() => ({
  current: { name: "김교사", image: null as string | null },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: sessionUser.current },
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
  sessionUser.current = { name: "김교사", image: null };
  vi.unstubAllGlobals();
});

describe("AuthHeader teacher actions", () => {
  it("shows one profile name with a chevron only for a dual-role account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ canSwitchToParent: true }))));
    const { container } = render(<AuthHeader />);
    await waitFor(() => expect(container.querySelector("summary.auth-profile-trigger")).not.toBeNull());
    const trigger = container.querySelector("summary")!;
    // 사진이 없으면 이름 첫 글자 자리표시자가 이름 앞에 선다.
    expect(trigger.querySelector(".auth-name")?.textContent).toBe("김교사");
    expect(trigger.querySelector(".auth-avatar-fallback")?.textContent).toBe("김");
    expect(trigger.querySelector("img.auth-avatar")).toBeNull();
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

  it("keeps the name readable when the provider photo is missing or broken", () => {
    sessionUser.current = { name: "김교사", image: "https://example.com/a.png" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ canSwitchToParent: false }))),
    );
    const { container } = render(<AuthHeader />);

    const photo = container.querySelector("img.auth-avatar") as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("https://example.com/a.png");
    expect(photo.getAttribute("referrerpolicy")).toBe("no-referrer");

    fireEvent.error(photo);

    expect(container.querySelector("img.auth-avatar")).toBeNull();
    expect(container.querySelector(".auth-avatar-fallback")?.textContent).toBe("김");
    expect(screen.getByText("김교사")).toBeTruthy();
  });
});
