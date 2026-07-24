import { describe, expect, it } from "vitest";
import {
  canComposeComment,
  commentAudienceLabel,
  FAMILY_THREAD_PRIVATE_MESSAGE,
  commentsPath,
  initialCommentAudience,
  visibleCommentsForViewer,
} from "./comment-audience";

describe("mobile comment audience", () => {
  it("keeps public as an explicit API audience", () => {
    expect(commentsPath("card / 1", "public")).toBe(
      "/api/cards/card%20%2F%201/comments?audience=public",
    );
  });

  it("opens a parent card directly in the guardian thread", () => {
    expect(initialCommentAudience("parent")).toBe("guardian");
    expect(initialCommentAudience("student")).toBe("public");
  });

  it("uses relationship-focused labels for student comment tabs", () => {
    expect(commentAudienceLabel("public")).toBe("우리반 댓글");
    expect(commentAudienceLabel("guardian")).toBe("가족 댓글");
  });

  it("keeps the family thread's privacy message distinct from an empty state", () => {
    expect(FAMILY_THREAD_PRIVATE_MESSAGE).toBe(
      "가족 댓글은 게시글 작성자와 가족만 볼 수 있어요.",
    );
  });

  it("fails closed rather than showing public comments to a parent", () => {
    const items = [
      { id: "public", audience: "public" as const },
      { id: "guardian", audience: "guardian" as const },
      { id: "legacy" },
    ];

    expect(visibleCommentsForViewer("parent", true, items)).toEqual([
      { id: "guardian", audience: "guardian" },
    ]);
    expect(visibleCommentsForViewer("parent", false, items)).toEqual([]);
    expect(visibleCommentsForViewer("student", false, items)).toEqual(items);
  });

  it("allows parents to compose only in the guardian thread", () => {
    expect(canComposeComment("parent", "public")).toBe(false);
    expect(canComposeComment("parent", "guardian")).toBe(true);
    expect(canComposeComment("student", "public")).toBe(true);
    expect(canComposeComment("student", "guardian")).toBe(true);
  });
});
