import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatingLayoutLibrary } from "../SeatingLayoutLibrary";

const fetchMock = vi.fn();
const onRestore = vi.fn();

const currentGroups = [
  { name: "1모둠", studentIds: ["s1", "s2"] },
  { name: "2모둠", studentIds: ["s3"] },
];

const savedLayout = {
  id: "layout-1",
  name: "1학기 1차",
  groups: [{ name: "1모둠", studentIds: ["s3", "s1"] }],
  updatedAt: "2026-07-27T00:00:00.000Z",
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function renderLibrary() {
  return render(
    <SeatingLayoutLibrary
      classroomId="classroom-1"
      currentGroups={currentGroups}
      onRestore={onRestore}
    />,
  );
}

describe("SeatingLayoutLibrary", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    onRestore.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists saved layouts with their group and student counts", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ layouts: [savedLayout] }));
    renderLibrary();

    expect(await screen.findByText("1학기 1차")).toBeTruthy();
    expect(screen.getByText(/1분단 · 2명/)).toBeTruthy();
  });

  it("saves the current arrangement under the typed name", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ layouts: [] }))
      .mockResolvedValueOnce(jsonResponse({ layout: savedLayout }))
      .mockResolvedValueOnce(jsonResponse({ layouts: [savedLayout] }));
    renderLibrary();

    fireEvent.change(await screen.findByLabelText("자리 배치 이름"), {
      target: { value: "1학기 2차" },
    });
    fireEvent.click(screen.getByRole("button", { name: "현재 배치 저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/classroom/classroom-1/seating-layouts",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      name: "1학기 2차",
      groups: currentGroups,
    });
  });

  it("restores a saved layout into the editor", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ layouts: [savedLayout] }));
    renderLibrary();

    fireEvent.click(await screen.findByRole("button", { name: "불러오기" }));

    expect(onRestore).toHaveBeenCalledWith(savedLayout.groups);
  });

  it("deletes a layout after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ layouts: [savedLayout] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ layouts: [] }));
    renderLibrary();

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/classroom/classroom-1/seating-layouts/layout-1",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
  });
});
