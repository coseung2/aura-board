import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TeacherLibraryItemDto } from "@/lib/teacher-library-types";
import { LibraryFileBuilder } from "./LibraryFileBuilder";

const now = "2026-08-19T00:00:00.000Z";

function item(id: string, kind: "image" | "canva"): TeacherLibraryItemDto {
  return {
    id,
    collectionId: null,
    kind,
    title: id === "canva" ? "Canva 활동지" : "학생 작품",
    assetUrl: kind === "image" ? "/uploads/image.png" : null,
    previewUrl: null,
    mimeType: kind === "image" ? "image/png" : null,
    fileSize: null,
    canvaDesignId: kind === "canva" ? "D123" : null,
    canvaViewUrl: null,
    pageCount: null,
    sourceBoardId: null,
    sourceSectionId: null,
    sourceCardId: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("LibraryFileBuilder", () => {
  it("exposes accessible ordering controls in the selected order", () => {
    const onMove = vi.fn();
    render(
      <LibraryFileBuilder
        selectedItems={[item("image", "image"), item("canva", "canva")]}
        filename="수업 자료"
        layout="a4-auto"
        busy={false}
        canvaConnected={true}
        error={null}
        onFilename={vi.fn()}
        onLayout={vi.fn()}
        onMove={onMove}
        onRemove={vi.fn()}
        onDownload={vi.fn()}
        onReconnectCanva={vi.fn()}
        onPageCount={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Canva 활동지 위로 이동" }));
    expect(onMove).toHaveBeenCalledWith(1, -1);
    expect(screen.getByRole("button", { name: "한 파일로 다운로드" })).toBeEnabled();
    expect(screen.getByText("Canva", { selector: ".teacher-library-kind-chip" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /A4 균등 배치/ })).toBeChecked();
    expect(screen.getByLabelText("PDF 배치 미리보기")).toBeTruthy();
  });

  it("blocks Canva export and offers reconnection when disconnected", () => {
    const reconnect = vi.fn();
    render(
      <LibraryFileBuilder
        selectedItems={[item("canva", "canva")]}
        filename="수업 자료"
        layout="a4-fit"
        busy={false}
        canvaConnected={false}
        error={null}
        onFilename={vi.fn()}
        onLayout={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDownload={vi.fn()}
        onReconnectCanva={reconnect}
        onPageCount={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "한 파일로 다운로드" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "재연결" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("shows every source page in a vertical preview sequence", () => {
    render(
      <LibraryFileBuilder
        selectedItems={[
          {
            ...item("canva", "canva"),
            pageCount: 3,
            previewUrl: "/canva-name-tag.png",
          },
        ]}
        filename="수업 자료"
        layout="a4-fit"
        busy={false}
        canvaConnected={true}
        error={null}
        onFilename={vi.fn()}
        onLayout={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDownload={vi.fn()}
        onReconnectCanva={vi.fn()}
        onPageCount={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText(/PDF 미리보기 \d+페이지/)).toHaveLength(3);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    document
      .querySelectorAll<HTMLImageElement>(".teacher-library-preview-item img")
      .forEach((image) => expect(image).toHaveStyle({ objectFit: "contain" }));
  });

  it("uses a different page thumbnail for each page of each Canva design", () => {
    const items = ["one", "two", "three"].map((id) => ({
      ...item(id, "canva"),
      pageCount: 3,
      previewUrl: `/canva-${id}-page-1.png`,
      canvaViewUrl: `https://www.canva.com/design/${id}/view`,
    }));
    render(
      <LibraryFileBuilder
        selectedItems={items}
        filename="자료"
        layout="a4-fit"
        busy={false}
        canvaConnected={true}
        error={null}
        onFilename={vi.fn()}
        onLayout={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDownload={vi.fn()}
        onReconnectCanva={vi.fn()}
        onPageCount={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText(/PDF 미리보기 \d+페이지/)).toHaveLength(9);
    const thumbnails = Array.from(
      document.querySelectorAll<HTMLImageElement>(".teacher-library-preview-item img"),
    ).map((image) => image.getAttribute("src") ?? "");
    expect(thumbnails.filter((src) => src.includes("page=2"))).toHaveLength(3);
    expect(thumbnails.filter((src) => src.includes("page=3"))).toHaveLength(3);
  });
});
