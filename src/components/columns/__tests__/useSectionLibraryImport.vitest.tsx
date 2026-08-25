import "@testing-library/jest-dom/vitest";

import { act, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/Toast";
import { useSectionLibraryImport } from "../useSectionLibraryImport";

const sections = [
  { id: "section-1", title: "환경 프로젝트", order: 0, pinned: false },
];

describe("useSectionLibraryImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows progress immediately and replaces it with the import result", async () => {
    let finishRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishRequest = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useSectionLibraryImport(sections), {
      wrapper: ToastProvider,
    });

    act(() => {
      void result.current.handleAddToLibrary("section-1");
    });
    expect(
      await screen.findByText("“환경 프로젝트” 자료를 라이브러리에 추가하는 중입니다."),
    ).toBeTruthy();

    await act(async () => {
      finishRequest(
        new Response(JSON.stringify({ created: 2, reused: 0, failed: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    expect(await screen.findByText(/“환경 프로젝트” 추가 완료 · 새 자료 2개/)).toBeTruthy();
    expect(screen.queryByText(/추가하는 중입니다/)).toBeNull();
  });
});
