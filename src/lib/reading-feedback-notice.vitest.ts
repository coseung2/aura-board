import { expect, it } from "vitest";
import { readingFeedbackNotice } from "./reading-feedback-notice";
it("explains mission eligibility without claiming an automatic currency payment", () => {
  expect(readingFeedbackNotice(4)).toContain("5점 이상");
  expect(readingFeedbackNotice(5)).toContain("미션 현황");
  expect(readingFeedbackNotice(9)).not.toContain("지급됐");
  expect(readingFeedbackNotice(null)).not.toContain("null");
});
