import { describe, expect, it } from "vitest";
import {
  countParentFeedAttachments,
  resolveParentFeedAuthor,
} from "../parent-feed-presentation";

const card = {
  imageUrl: "https://example.test/image.jpg",
  videoUrl: null,
  fileUrl: null,
  externalAuthorName: "외부 작성자",
  studentAuthorName: "학생 작성자",
  authorName: "기본 작성자",
  attachments: [{ url: "https://example.test/image.jpg" }],
  sourceBoard: { anonymousAuthor: false },
};

describe("parent feed presentation", () => {
  it("uses the same author precedence and respects anonymous boards", () => {
    expect(resolveParentFeedAuthor(card, "자녀")).toBe("학생 작성자");
    expect(
      resolveParentFeedAuthor(
        { ...card, sourceBoard: { anonymousAuthor: true } },
        "자녀",
      ),
    ).toBe("익명");
  });

  it("does not double-count legacy media already present in attachments", () => {
    expect(countParentFeedAttachments(card)).toBe(1);
    expect(
      countParentFeedAttachments({
        ...card,
        videoUrl: "https://example.test/video.mp4",
      }),
    ).toBe(2);
  });
});
