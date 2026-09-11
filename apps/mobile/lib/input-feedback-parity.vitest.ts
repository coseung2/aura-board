import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { readingFeedbackNotice } from "./reading-feedback-notice";
import { readingFeedbackNotice as webNotice } from "../../../src/lib/reading-feedback-notice";

describe("standalone mobile feedback adapters", () => {
  it.each([null, 0, 4, 5, 10])("matches reading reward guidance for score %s", (score) => {
    expect(readingFeedbackNotice(score)).toBe(webNotice(score));
  });
  it("keeps comment reward polling identical without a runtime web import", () => {
    const compile = (path: string) => ts.transpileModule(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"), { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    expect(compile("../hooks/use-comment-reward-feedback.ts")).toBe(compile("../../../src/lib/use-comment-reward-feedback.ts"));
  });
});
