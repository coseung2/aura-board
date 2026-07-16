import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyBannerModerationPanel } from "./DailyBannerModerationPanel";

const fetchMock = vi.fn();

function currentKstDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

describe("DailyBannerModerationPanel calendar", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    const month = currentKstDay().slice(0, 7);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        month,
        submissions: [
          {
            id: "submission-approved",
            targetDay: `${month}-15`,
            kind: "text",
            text: "게시된 문구",
            imageUrl: null,
            status: "approved",
            student: { name: "김학생", number: 1 },
          },
          {
            id: "submission-pending",
            targetDay: `${month}-16`,
            kind: "text",
            text: "검토할 문구",
            imageUrl: null,
            status: "pending",
            student: { name: "이학생", number: 2 },
          },
        ],
      }),
    });
  });

  it("loads one month and marks dates with submissions", async () => {
    render(<DailyBannerModerationPanel classroomId="classroom-1" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/classrooms\/classroom-1\/daily-banners\?month=\d{4}-\d{2}&status=all/,
        ),
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    expect(
      screen.getByRole("button", { name: /15일, 게시 확정 김학생/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /16일, 심사 대기 이학생/ }),
    ).toBeTruthy();
    expect(
      document.querySelector(".classroom-banner-calendar-day-count.is-approved"),
    ).toBeTruthy();
    expect(
      document.querySelector(".classroom-banner-calendar-day-count.is-pending"),
    ).toBeTruthy();
  });

  it("shows the selected date's submissions below the calendar", async () => {
    render(<DailyBannerModerationPanel classroomId="classroom-1" />);

    const dateButton = await screen.findByRole("button", {
      name: /16일, 심사 대기 이학생/,
    });
    fireEvent.click(dateButton);

    expect(await screen.findByText("검토할 문구")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /16일 신청/ })).toBeTruthy();
  });
});
