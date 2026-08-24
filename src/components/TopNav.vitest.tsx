import "@testing-library/jest-dom/vitest";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

vi.mock("./Logo", () => ({ Logo: () => <span>Aura</span> }));
vi.mock("./AuthHeader", () => ({ AuthHeader: () => <span>계정</span> }));

const classroomNavData = {
  classrooms: [
    { id: "class-1", name: "햇살반", boards: [] },
    { id: "class-2", name: "별빛반", boards: [] },
  ],
  boards: [],
};

function openClassroomMenu() {
  fireEvent.mouseEnter(screen.getByRole("link", { name: "학급" }));
}

function groupLinks(panel: HTMLElement, title: string) {
  const heading = within(panel).getByRole("heading", { name: title });
  const group = heading.closest("section");
  if (!group) throw new Error(`Missing visible group: ${title}`);

  return within(group).getAllByRole("link").map((link) => ({
    label: link.textContent?.trim(),
    href: link.getAttribute("href"),
  }));
}

afterEach(() => {
  navigation.pathname = "/dashboard";
  vi.unstubAllGlobals();
});

describe("TopNav teacher navigation loading", () => {
  it("distinguishes a successful empty result from a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ classrooms: [], boards: [] }))));
    const { unmount } = render(<TopNav />);

    openClassroomMenu();
    await waitFor(() =>
      expect(screen.getByText("학급을 먼저 만들어 주세요")).toBeTruthy(),
    );
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

describe("TopNav classroom mega menu", () => {
  it("renders the four visible groups with classroom links and canonical hrefs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(classroomNavData))),
    );
    render(<TopNav />);

    openClassroomMenu();
    const panel = await screen.findByRole("region", { name: "학급 메뉴" });

    expect(
      within(panel)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["학급 선택", "햇살반 관리", "학급 운영", "활동·기록"]);
    expect(
      within(panel).queryByRole("heading", { name: "1인1역할" }),
    ).toBeNull();

    expect(groupLinks(panel, "학급 선택")).toEqual([
      { label: "햇살반", href: "/classroom/class-1/dashboard" },
      { label: "별빛반", href: "/classroom/class-2/dashboard" },
    ]);
    expect(groupLinks(panel, "햇살반 관리")).toEqual([
      { label: "학급 홈", href: "/classroom/class-1/dashboard" },
      { label: "학생 명단", href: "/classroom/class-1/students" },
      { label: "자리·모둠", href: "/classroom/class-1/groups" },
      { label: "보드 연결", href: "/classroom/class-1/boards" },
    ]);
    expect(groupLinks(panel, "학급 운영")).toEqual([
      { label: "1인1역", href: "/classroom/class-1/roles" },
      { label: "과제 현황", href: "/classroom/class-1/assignments" },
      { label: "은행", href: "/classroom/class-1/bank" },
    ]);
    expect(within(panel).queryByRole("link", { name: "청소·당번" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "제출 체크" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "QR결제" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "매점" })).toBeNull();
    expect(groupLinks(panel, "활동·기록")).toEqual([
      { label: "포트폴리오", href: "/classroom/class-1/portfolio" },
      { label: "독서", href: "/classroom/class-1/reading" },
      { label: "걷기 현황", href: "/classroom/class-1/walking" },
      { label: "일일 배너", href: "/classroom/class-1/daily-banners" },
    ]);
  });

  it("keeps classroom preview behavior and marks the current tab active", async () => {
    navigation.pathname = "/classroom/class-1/assignments/details";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(classroomNavData))),
    );
    render(<TopNav />);

    openClassroomMenu();
    const panel = await screen.findByRole("region", { name: "학급 메뉴" });
    expect(
      within(panel).getByRole("link", { name: "과제 현황" }),
    ).toHaveAttribute("aria-current", "page");

    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "학급 메뉴" })).getByRole(
          "heading",
          { name: "햇살반 관리" },
        ),
      ).toBeInTheDocument(),
    );
    fireEvent.focus(within(panel).getByRole("link", { name: "별빛반" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "별빛반 관리" }),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("region", { name: "학급 메뉴" })).getByRole(
        "link",
        { name: "1인1역" },
      ),
    ).toHaveAttribute("href", "/classroom/class-2/roles");
  });
});
