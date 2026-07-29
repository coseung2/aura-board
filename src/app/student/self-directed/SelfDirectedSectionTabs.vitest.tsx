import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SelfDirectedSectionTabs } from "./SelfDirectedSectionTabs";

describe("SelfDirectedSectionTabs", () => {
  it("renders canonical deep links and exposes the active section", () => {
    render(<SelfDirectedSectionTabs active="walking" />);

    expect(screen.getByRole("link", { name: "독서" })).toHaveAttribute(
      "href",
      "/student/self-directed?activity=reading",
    );
    expect(screen.getByRole("link", { name: "걷기" })).toHaveAttribute(
      "href",
      "/student/self-directed?activity=walking",
    );
    expect(screen.getByRole("link", { name: "걷기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
