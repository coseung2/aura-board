import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingBoard } from "./DrawingBoard";

// The web drawing editor was removed; DrawingBoard is a gallery surface for
// artwork saved from the mobile app via /api/student-assets.
describe("DrawingBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads shared class artwork into the gallery tab by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          assets: [
            {
              id: "asset-1",
              title: "봄 그림",
              fileUrl: "https://example.test/a.png",
              thumbnailUrl: "https://example.test/a-thumb.png",
              format: "png",
              studentId: "student-1",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DrawingBoard
        boardId="board-1"
        boardTitle="그림보드"
        classroomId="class-1"
        viewerKind="teacher"
        studentId={null}
      />
    );

    expect(await screen.findByTitle("봄 그림")).toBeDefined();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/student-assets?scope=shared&classroomId=class-1"
      );
    });
  });

  it("shows a placeholder instead of a web editor on the 작업실 tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DrawingBoard
        boardId="board-1"
        boardTitle="그림보드"
        classroomId="class-1"
        viewerKind="student"
        studentId="student-1"
      />
    );

    screen.getByRole("tab", { name: /작업실/ }).click();

    expect(
      await screen.findByText("웹 작업실은 준비 중이에요")
    ).toBeDefined();
    expect(document.querySelector("canvas")).toBeNull();
  });
});
