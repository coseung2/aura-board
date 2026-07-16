import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminSignupActivityChart,
  type AdminTrendPoint,
} from "./AdminSignupActivityChart";

function makePoints(): AdminTrendPoint[] {
  return Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, index + 1))
      .toISOString()
      .slice(0, 10);
    return { date, signups: 20, boardActivities: 40 };
  });
}

function leftAxisLabels(): string[] {
  const axis = document.querySelector(
    ".admin-combined-chart-axis.is-left .admin-combined-chart-axis-values",
  );
  return axis
    ? Array.from(axis.querySelectorAll("span")).map((node) => node.textContent ?? "")
    : [];
}

describe("AdminSignupActivityChart", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
  });

  it("starts on daily view with a 0–100 signup axis", () => {
    render(<AdminSignupActivityChart points={makePoints()} />);

    expect(screen.getByRole("tab", { name: "일" }).getAttribute("aria-selected")).toBe("true");
    expect(leftAxisLabels()).toEqual(["100", "50", "0"]);
  });

  it("scales weekly and monthly signup axes to their aggregated values", () => {
    render(<AdminSignupActivityChart points={makePoints()} />);

    fireEvent.click(screen.getByRole("tab", { name: "주" }));
    expect(leftAxisLabels()).toEqual(["200", "100", "0"]);

    fireEvent.click(screen.getByRole("tab", { name: "월" }));
    expect(leftAxisLabels()).toEqual(["1,000", "500", "0"]);
  });
});
