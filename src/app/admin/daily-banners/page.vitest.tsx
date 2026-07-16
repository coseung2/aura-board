import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDailyBannersPage from "./page";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  publicationFindMany: vi.fn(),
  submissionFindMany: vi.fn(),
  submissionCount: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/TopNav", () => ({ TopNav: () => null }));
vi.mock("@/components/admin/AdminFeatureHeader", () => ({
  AdminFeatureHeader: () => null,
}));
vi.mock("@/components/admin/DailyBannerAdminActions", () => ({
  DailyBannerAdminActions: () => null,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminUser: mocks.requireAdminUser,
  AdminForbidden: () => <p>접근 권한이 없습니다.</p>,
}));
vi.mock("@/lib/db", () => ({
  db: {
    dailyBannerPublication: { findMany: mocks.publicationFindMany },
    dailyBannerSubmission: {
      findMany: mocks.submissionFindMany,
      count: mocks.submissionCount,
    },
  },
}));

describe("AdminDailyBannersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ authorized: true });
    mocks.publicationFindMany.mockResolvedValue([]);
    mocks.submissionCount.mockResolvedValue(1);
    mocks.submissionFindMany.mockResolvedValue([
      {
        id: "pending-banner-1",
        targetDay: new Date("2026-07-18T00:00:00.000Z"),
        kind: "text",
        text: "우리 반 오늘도 힘내요!",
        student: { name: "김학생", number: 7 },
        classroom: { name: "1반" },
      },
    ]);
  });

  it("renders pending submissions independently from published banners", async () => {
    render(await AdminDailyBannersPage());

    expect(mocks.submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } }),
    );

    const pendingSection = screen
      .getByRole("heading", { name: "심사 대기 신청" })
      .closest("section");
    expect(pendingSection).not.toBeNull();

    const pendingTable = within(pendingSection as HTMLElement);
    expect(pendingTable.getByText("2026-07-18")).toBeTruthy();
    expect(pendingTable.getByText("김학생 (7번)")).toBeTruthy();
    expect(pendingTable.getByText("1반")).toBeTruthy();
    expect(pendingTable.getByText("우리 반 오늘도 힘내요!")).toBeTruthy();
    expect(screen.getByText("확정된 배너가 없습니다.")).toBeTruthy();
  });
});
