import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MegaNav, type MegaNavItem } from "./MegaNav";

const items: MegaNavItem[] = [
  {
    id: "first",
    href: "/first",
    label: "First",
    groups: [
      {
        title: "First group",
        links: [
          { href: "/first/unavailable", label: "Unavailable", disabled: true },
          { href: "/first/one", label: "First one" },
          { href: "/first/two", label: "First two" },
          { href: "/first/three", label: "First three" },
        ],
      },
    ],
  },
  {
    id: "second",
    href: "/second",
    label: "Second",
    groups: [
      {
        title: "Second group",
        links: [{ href: "/second/one", label: "Second one" }],
      },
    ],
  },
  {
    id: "third",
    href: "/third",
    label: "Third",
    groups: [
      {
        title: "Third group",
        links: [{ href: "/third/one", label: "Third one" }],
      },
    ],
  },
];

function renderNav() {
  return render(<MegaNav items={items} ariaLabel="Primary" />);
}

describe("MegaNav keyboard navigation", () => {
  it("keeps the panel open while focus enters it and restores its trigger on Escape", () => {
    const { container } = renderNav();
    const trigger = screen.getByRole("link", { name: "First" });

    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const firstPanelLink = screen.getByRole("link", { name: "First one" });
    expect(firstPanelLink).toHaveFocus();
    expect(container.querySelector(".mega-nav-panel")).toBeInTheDocument();

    fireEvent.keyDown(firstPanelLink, { key: "Escape" });

    expect(container.querySelector(".mega-nav-panel")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves across top-level links and enabled links with conventional keys", () => {
    renderNav();
    const first = screen.getByRole("link", { name: "First" });
    const second = screen.getByRole("link", { name: "Second" });
    const third = screen.getByRole("link", { name: "Third" });

    act(() => first.focus());
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: "End" });
    expect(third).toHaveFocus();

    fireEvent.keyDown(third, { key: "Home" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(third).toHaveFocus();

    act(() => first.focus());
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const firstPanelLink = screen.getByRole("link", { name: "First one" });
    const secondPanelLink = screen.getByRole("link", { name: "First two" });
    const lastPanelLink = screen.getByRole("link", { name: "First three" });
    expect(firstPanelLink).toHaveFocus();

    fireEvent.keyDown(firstPanelLink, { key: "ArrowDown" });
    expect(secondPanelLink).toHaveFocus();

    fireEvent.keyDown(secondPanelLink, { key: "End" });
    expect(lastPanelLink).toHaveFocus();

    fireEvent.keyDown(lastPanelLink, { key: "ArrowDown" });
    expect(firstPanelLink).toHaveFocus();

    fireEvent.keyDown(firstPanelLink, { key: "ArrowUp" });
    expect(lastPanelLink).toHaveFocus();

    fireEvent.keyDown(lastPanelLink, { key: "Home" });
    expect(firstPanelLink).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Unavailable" })).toBeNull();
    expect(screen.getByText("Unavailable").closest(".mega-nav-link")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
