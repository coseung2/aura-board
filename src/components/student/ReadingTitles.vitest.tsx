import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReadingTitles, type ReadingTitleProgress } from "./ReadingTitles";

const TITLES: ReadingTitleProgress[] = [
  {
    key: "logs-50",
    label: "독서왕",
    imagePath: "/reading/titles/logs-50-pixel-512.png",
    requirement: "독서 기록 50권",
    effectKey: "reading_reward",
    buffBps: 400,
    earned: false,
    claimed: false,
  },
  {
    key: "logs-5",
    label: "독서 새싹",
    imagePath: "/reading/titles/logs-5-pixel-512.png",
    requirement: "독서 기록 5권",
    effectKey: "reading_reward",
    buffBps: 100,
    earned: true,
    claimed: false,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ReadingTitles", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders loading, locked and claimable states with their criteria", async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<ReadingTitles />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "독서 칭호를 불러오는 중이에요.",
    );

    resolveFetch(jsonResponse({ reading: TITLES, walking: [] }));

    expect(await screen.findByText("독서 기록 50권")).toBeInTheDocument();
    expect(screen.getByText("잠김")).toBeInTheDocument();
    expect(screen.getByText("수령 가능 · 독서 보상 +1%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "독서 새싹 칭호 수령" }),
    ).toBeEnabled();
  });

  it("claims through the existing title endpoint and applies the returned reading titles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ reading: TITLES, walking: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          titles: TITLES.map((title) =>
            title.key === "logs-5" ? { ...title, claimed: true } : title,
          ),
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ReadingTitles />);
    fireEvent.click(
      await screen.findByRole("button", { name: "독서 새싹 칭호 수령" }),
    );

    await waitFor(() => {
      expect(screen.getByText("수령 완료 · 독서 보상 +1%")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "칭호를 받았어요. 펫 꾸미기에서 붙일 수 있어요.",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/student/titles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ titleKey: "logs-5" }),
      }),
    );
  });

  it("shows a retryable error and an empty state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "failed" }, 500))
      .mockResolvedValueOnce(jsonResponse({ reading: [], walking: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReadingTitles />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "독서 칭호를 불러오지 못했어요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(
      await screen.findByText("표시할 독서 칭호가 아직 없어요."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
