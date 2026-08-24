import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClassroomFeatureHeader } from "../ClassroomFeatureHeader";
import { ClassroomSectionHeader } from "../ClassroomSectionHeader";

describe("classroom section headers", () => {
  it("does not render an empty navigation landmark", () => {
    render(
      <ClassroomSectionHeader
        classroomId="classroom-1"
        eyebrow="1반"
        title="청소·당번"
        ariaLabel="청소·당번 메뉴"
        links={[]}
        activeKey="duties"
      />,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("keeps the navigation landmark when links exist", () => {
    render(
      <ClassroomSectionHeader
        classroomId="classroom-1"
        eyebrow="1반"
        title="은행"
        ariaLabel="은행 메뉴"
        links={[{ key: "actions", label: "입출금", href: "/bank" }]}
        activeKey="actions"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "은행 메뉴" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "입출금" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it.each([
    ["walking", "걷기"],
    ["daily-banners", "배너 관리"],
    ["reading", "독서"],
  ] as const)("maps %s to its standalone title", (active, title) => {
    render(
      <ClassroomFeatureHeader
        classroomId="classroom-1"
        eyebrow="1반"
        active={active}
      />,
    );

    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
