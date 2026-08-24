import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ReadingLogDeleteButton } from "./ReadingLogDeleteButton";

describe("ReadingLogDeleteButton", () => {
  it("does not toggle or bubble through the reading disclosure summary", () => {
    const summaryClick = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <details>
        <summary onClick={summaryClick}>
          <ReadingLogDeleteButton
            classroomId="classroom-1"
            readingLogId="log-1"
            studentLabel="서현우"
            title="버드스파이크"
          />
        </summary>
      </details>,
    );

    fireEvent.click(screen.getByRole("button", { name: "서현우 버드스파이크 독서 기록 삭제" }));

    expect(summaryClick).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledOnce();
  });
});
