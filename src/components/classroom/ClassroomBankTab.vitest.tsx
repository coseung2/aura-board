import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomBankTab } from "./ClassroomBankTab";

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("ClassroomBankTab", () => {
  it("uses assignment-style gray head bars for finance summaries", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        currency: { unitLabel: "원", monthlyInterestRate: 1.5 },
        students: [],
        activeFDs: [{ id: "fd-1", accountId: "acc-1", principal: 3000, monthlyRate: 1.5, startDate: "2026-08-01", maturityDate: "2026-08-31" }],
        totals: { totalBalance: 125000, activeFDTotal: 3000 },
        recentTransactions: [],
        transactionPagination: { page: 1, pageSize: 30, total: 0, totalPages: 1 },
        viewerKind: "teacher",
        canCancelFD: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ClassroomBankTab classroomId="classroom-1" />);

    await waitFor(() => {
      expect(screen.getByText("지갑 합계")).toBeTruthy();
    });

    expect(container.querySelectorAll(".bank-summary-head")).toHaveLength(3);
    expect(container.querySelector(".classroom-dashboard-kpi")).toBeNull();
    expect(screen.getByText("125,000 원")).toBeTruthy();
    expect(screen.getByText("적금 (1건)")).toBeTruthy();
    expect(screen.getByLabelText("월 이자율")).toBeTruthy();
  });
});
