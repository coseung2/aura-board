import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STUDENT_CONTENT_HIDDEN_EVENT,
  StudentContentModerationControls,
} from "./StudentContentModeration";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("StudentContentModerationControls", () => {
  it("posts the exact hide contract and announces an immediate item placeholder", async () => {
    const events: unknown[] = [];
    window.addEventListener(STUDENT_CONTENT_HIDDEN_EVENT, (event) => {
      events.push((event as CustomEvent).detail);
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StudentContentModerationControls targetKind="card" targetId="card-2" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "카드 신고 또는 숨기기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "숨기기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/student/hidden-content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetKind: "card", targetId: "card-2" }),
    });
    expect(events).toEqual([
      {
        targetKind: "card",
        targetId: "card-2",
        hiddenReason: "item",
      },
    ]);
  });

  it("posts the report reason, detail, and author-hide opt in", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ok: true,
            hiddenAuthor: true,
            authorStudentId: "student-2",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StudentContentModerationControls
        targetKind="comment"
        targetId="comment-2"
        authorStudentId="student-2"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "댓글 신고 또는 숨기기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "신고하기" }));
    fireEvent.change(screen.getByLabelText("신고 이유"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByLabelText(/자세한 내용/), {
      target: { value: "반복되는 욕설" },
    });
    fireEvent.click(screen.getByLabelText("이 작성자의 다른 콘텐츠도 숨기기"));
    fireEvent.click(screen.getByRole("button", { name: "신고하고 숨기기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      targetKind: "comment",
      targetId: "comment-2",
      reason: "other",
      detail: "반복되는 욕설",
      hideAuthor: true,
    });
  });
});
