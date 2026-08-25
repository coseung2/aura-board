import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TeacherLibraryItemDto } from "@/lib/teacher-library-types";
import { LibraryItemList } from "./LibraryItemList";
import { TeacherLibraryWorkspace } from "./TeacherLibraryWorkspace";

function item(id: string): TeacherLibraryItemDto {
  return {
    id,
    collectionId: null,
    kind: "image",
    title: `자료 ${id}`,
    assetUrl: `/uploads/${id}.png`,
    previewUrl: null,
    mimeType: "image/png",
    fileSize: null,
    canvaDesignId: null,
    canvaViewUrl: null,
    pageCount: null,
    sourceBoardId: null,
    sourceSectionId: null,
    sourceCardId: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

describe("LibraryItemList", () => {
  it("selects every visible item from one control", () => {
    const onToggleAll = vi.fn();
    render(
      <LibraryItemList
        items={[item("one"), item("two")]}
        collections={[]}
        selectedIds={new Set(["one"])}
        search=""
        onSearch={vi.fn()}
        onToggle={vi.fn()}
        onToggleAll={onToggleAll}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const selectAll = screen.getByRole("checkbox", { name: "전체 선택" });
    expect(selectAll).toBePartiallyChecked();
    fireEvent.click(selectAll);
    expect(onToggleAll).toHaveBeenCalledWith(["one", "two"]);
  });

  it("adds and removes all visible items in the workspace", () => {
    render(
      <TeacherLibraryWorkspace
        initialPayload={{ collections: [], items: [item("one"), item("two")] }}
        initialCanvaConnected={false}
      />,
    );

    const selectAll = screen.getByRole("checkbox", { name: "전체 선택" });
    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(screen.getByText("2개 선택")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(selectAll).not.toBeChecked();
    expect(screen.queryByText("2개 선택")).not.toBeInTheDocument();
  });

  it("keeps wide Canva thumbnails fully visible", () => {
    render(
      <LibraryItemList
        items={[
          {
            ...item("wide"),
            kind: "canva",
            previewUrl: "/wide-name-tag.png",
          },
        ]}
        collections={[]}
        selectedIds={new Set()}
        search=""
        onSearch={vi.fn()}
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(document.querySelector(".teacher-library-thumb img")).toHaveStyle({
      objectFit: "contain",
    });
  });
});
