import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentActivityTabs } from "./StudentActivityTabs";

describe("StudentActivityTabs", () => {
  it("connects reading content tabs to their panels and uses an h2 activity heading", () => {
    render(
      <StudentActivityTabs
        activity="reading"
        records={<p>기록 내용</p>}
        missions={<p>미션 내용</p>}
        titles={<p>칭호 내용</p>}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["기록", "미션", "칭호"]);
    expect(screen.getByRole("heading", { level: 2, name: "독서" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute("aria-controls", "student-reading-records-panel");

    fireEvent.click(screen.getByRole("tab", { name: "칭호" }));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("칭호 내용");
    expect(screen.getByRole("tab", { name: "칭호" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(window.location.search).toBe("?tab=titles");
  });

  it("honors a deep-linked initial tab and supports roving keyboard focus", () => {
    render(
      <StudentActivityTabs
        activity="reading"
        initialView="missions"
        records="기록"
        missions="미션"
        titles="칭호"
      />,
    );

    const missionsTab = screen.getByRole("tab", { name: "미션" });
    expect(missionsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("미션");

    missionsTab.focus();
    fireEvent.keyDown(missionsTab, { key: "End" });
    expect(screen.getByRole("tab", { name: "칭호" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("칭호");
  });

  it("keeps walking to its two supported local tabs", () => {
    render(
      <StudentActivityTabs activity="walking" records="기록" missions="미션" />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "기록",
      "미션",
    ]);
  });
});
