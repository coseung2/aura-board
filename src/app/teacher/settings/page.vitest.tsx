import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "teacher-1",
    email: "teacher@example.com",
  })),
}));
vi.mock("@/lib/canva", () => ({ isCanvaConnected: vi.fn(async () => false) }));
vi.mock("@/components/TopNav", () => ({ TopNav: () => <div data-testid="top-nav" /> }));
vi.mock("@/components/LlmKeyForm", () => ({ LlmKeyForm: () => <div data-testid="llm-form" /> }));
vi.mock("@/components/CanvaConnectionCard", () => ({
  CanvaConnectionCard: () => <div data-testid="canva-card" />,
}));
vi.mock("@/components/teacher/TeacherWithdrawalSection", () => ({
  TeacherWithdrawalSection: () => <div data-testid="withdrawal-section" />,
}));

import TeacherSettingsPage from "./page";

describe("TeacherSettingsPage", () => {
  it("renders title-only header with full-width AI/integrations content tabs", async () => {
    render(await TeacherSettingsPage());

    expect(screen.getByRole("heading", { name: "교사 설정" })).toBeInTheDocument();
    expect(screen.queryByText("SETTINGS")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "생성형 AI" })).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "설정 구분" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("llm-form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "외부연동" }));
    expect(screen.getByRole("heading", { name: "Canva 연결" })).toBeInTheDocument();
    expect(screen.getByTestId("canva-card")).toBeInTheDocument();
  });
});
