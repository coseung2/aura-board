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
    expect(screen.getByText(/1모둠 · 2명/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "배치 보관" }));

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

  it("renames a layout through the inline editor", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ layouts: [savedLayout] }))
      .mockResolvedValueOnce(
        jsonResponse({ layout: { ...savedLayout, name: "새 이름" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ layouts: [{ ...savedLayout, name: "새 이름" }] }),
      );
    renderLibrary();

    fireEvent.click(await screen.findByRole("button", { name: "이름 변경" }));
    fireEvent.change(screen.getByLabelText("배치 이름"), {
      target: { value: "새 이름" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/classroom/classroom-1/seating-layouts/layout-1",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      name: "새 이름",
    });
  });

  it("shows refresh failure without claiming the list was saved", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ layouts: [] }))
      .mockResolvedValueOnce(jsonResponse({ layout: savedLayout }))
      .mockResolvedValueOnce(jsonResponse({}, false));
    renderLibrary();

    fireEvent.change(await screen.findByLabelText("자리 배치 이름"), {
      target: { value: "새 배치" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배치 보관" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "목록을 새로 고치지 못했어요.",
    );
    expect(screen.queryByText("저장했어요")).toBeNull();
  });

  it("uses a Korean fallback for mutation error codes without offering refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ layouts: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, false));
    renderLibrary();

    fireEvent.change(await screen.findByLabelText("자리 배치 이름"), {
      target: { value: "새 배치" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배치 보관" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("자리 배치를 보관하지 못했어요.");
    expect(screen.queryByRole("button", { name: "다시 불러오기" })).toBeNull();
  });

  it("keeps the newest list when an older refresh resolves later", async () => {
    let resolveInitial: (value: unknown) => void = () => undefined;
    let resolveLatest: (value: unknown) => void = () => undefined;
    fetchMock.mockImplementation(() => {
      if (fetchMock.mock.calls.length === 1) {
        return new Promise((resolve) => {
          resolveInitial = resolve;
        });
      }
      if (fetchMock.mock.calls.length === 2) {
        return Promise.resolve(jsonResponse({ layout: savedLayout }));
      }
      return new Promise((resolve) => {
        resolveLatest = resolve;
      });
    });
    renderLibrary();

    fireEvent.change(screen.getByLabelText("자리 배치 이름"), {
      target: { value: "새 배치" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배치 보관" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    resolveInitial(jsonResponse({ layouts: [savedLayout] }));
    resolveLatest(
      jsonResponse({ layouts: [{ ...savedLayout, name: "최신 배치" }] }),
    );

    expect(await screen.findByText("최신 배치")).toBeTruthy();
    expect(screen.queryByText("1학기 1차")).toBeNull();
  });
});
