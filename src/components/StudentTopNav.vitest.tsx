import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MegaNavItem } from "./MegaNav";
import { StudentTopNav } from "./StudentTopNav";

const navigation = vi.hoisted(() => ({
  pathname: "/student",
  search: "",
  replace: vi.fn(),
}));

let renderedItems: MegaNavItem[] = [];

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./Logo", () => ({ Logo: () => <span>Aura</span> }));
vi.mock("./MegaNav", () => ({
  MegaNav: ({ items, ariaLabel }: { items: MegaNavItem[]; ariaLabel: string }) => {
    renderedItems = items;
    return (
      <nav aria-label={ariaLabel}>
        {items.map((item) => (
          <div key={item.id}>
            <a href={item.href} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </a>
            {item.groups.flatMap((group) =>
              group.links.map((link) =>
                link.disabled ? (
                  <span key={`${group.title}-${link.label}`}>{link.label}</span>
                ) : (
                  <a
                    key={`${group.title}-${link.label}`}
                    href={link.href}
                    aria-current={link.active ? "page" : undefined}
                  >
                    {link.label}
                  </a>
                ),
              ),
            )}
          </div>
        ))}
      </nav>
    );
  },
}));
vi.mock("./StudentNotificationBell", () => ({
  StudentNotificationBell: () => <button aria-label="알림" />,
}));

function renderAt(pathname: string, search = "", duties: React.ComponentProps<typeof StudentTopNav>["duties"] = []) {
  navigation.pathname = pathname;
  navigation.search = search;
  render(
    <StudentTopNav
      studentName="학생"
      classroomName="1반"
      duties={duties}
    />,
  );
}

function item(id: string) {
  const found = renderedItems.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing nav item: ${id}`);
  return found;
}

function link(itemId: string, label: string) {
  const found = item(itemId).groups
    .flatMap((group) => group.links)
    .find((candidate) => candidate.label === label);
  if (!found) throw new Error(`Missing nav link: ${itemId}/${label}`);
  return found;
}

afterEach(() => {
  cleanup();
  renderedItems = [];
  navigation.pathname = "/student";
  navigation.search = "";
  navigation.replace.mockReset();
  vi.unstubAllGlobals();
});

describe("StudentTopNav information architecture", () => {
  it("renders the five primary destinations in order with canonical links", () => {
    renderAt("/student");

    expect(renderedItems.map(({ label }) => label)).toEqual([
      "홈",
      "보드",
      "펫",
      "자율활동",
      "더보기",
    ]);
    expect(renderedItems.map(({ href }) => href)).toEqual([
      "/student",
      "/student/boards?category=priority",
      "/student/aura-pet?section=mine",
      "/student/self-directed?activity=reading",
      "/my/wallet",
    ]);

    expect(item("boards").groups[0].links.map(({ href }) => href)).toEqual([
      "/student/boards?category=priority",
      "/student/boards?category=lesson",
      "/student/boards?category=play",
      "/student/boards?category=all",
    ]);
    expect(item("pet").groups[0].links.map(({ href }) => href)).toEqual([
      "/student/aura-pet?section=mine",
      "/student/aura-pet?section=classroom",
      "/student/aura-pet?section=shop",
    ]);
    expect(item("self-directed").groups[0].links.map(({ href }) => href)).toEqual([
      "/student/self-directed?activity=reading",
      "/student/self-directed?activity=walking",
    ]);
  });

  it("keeps wallet, portfolio, duties, and hidden content in More without duplicating notifications", () => {
    renderAt("/student", "", [
      {
        classroomId: "class-1",
        classroomName: "햇살반",
        roleKey: "cleaner",
        roleLabel: "정리 대장",
        emoji: "🧹",
        href: "/classroom/class-1/duty/cleaner",
      },
    ]);

    expect(link("more", "통장").href).toBe("/my/wallet");
    expect(link("more", "포트폴리오").href).toBe("/student/portfolio");
    expect(link("more", "숨긴 콘텐츠").href).toBe("/student/hidden-content");
    expect(link("more", "햇살반 · 정리 대장").href).toBe(
      "/classroom/class-1/duty/cleaner",
    );
    expect(screen.getAllByRole("button", { name: "알림" })).toHaveLength(1);
    expect(
      item("more").groups.flatMap((group) => group.links).some(({ label }) =>
        label.includes("알림"),
      ),
    ).toBe(false);
  });

  it.each([
    ["home", "/student", ""],
    ["boards", "/student/boards", "category=all"],
    ["pet", "/student/aura-pet", "section=shop"],
    ["self-directed", "/student/self-directed", "activity=walking"],
    ["more", "/student/portfolio", ""],
  ])("marks only %s active for its canonical location", (activeId, pathname, search) => {
    renderAt(pathname, search);

    expect(renderedItems.filter(({ active }) => active).map(({ id }) => id)).toEqual([
      activeId,
    ]);
  });

  it("maps canonical query state and legacy deep links to one active destination", () => {
    renderAt("/student", "board=lesson");
    expect(item("home").active).toBe(false);
    expect(item("boards").active).toBe(true);
    expect(link("boards", "수업보드").active).toBe(true);
    cleanup();

    renderAt("/student/aura-pet/classroom");
    expect(item("pet").active).toBe(true);
    expect(link("pet", "우리 반 펫").active).toBe(true);
    cleanup();

    renderAt("/student/reading");
    expect(item("self-directed").active).toBe(true);
    expect(link("self-directed", "독서").active).toBe(true);
    cleanup();

    renderAt("/student/self-directed", "activity=walking");
    expect(link("self-directed", "걷기").active).toBe(true);
    expect(link("self-directed", "독서").active).toBe(false);
  });
});

describe("StudentTopNav logout", () => {
  it("keeps the page on HTTP failure and retries successfully", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/student");

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("로그아웃 실패");
    expect(navigation.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("prevents duplicate logout requests", () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/student");

    const logout = screen.getByRole("button", { name: "로그아웃" });
    fireEvent.click(logout);
    fireEvent.click(logout);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
