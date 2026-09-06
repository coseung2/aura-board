import { describe, expect, it } from "vitest";
import { extractAgentHtml } from "./code-content";

describe("Agent reply code formats", () => {
  it("reads the current JSON reply without corrupting script closures", () => {
    const code = '<html><body><script>console.log("ok")</script></body></html>';
    expect(extractAgentHtml(JSON.stringify({ message: "완료", code }))).toBe(code);
  });
  it("reads a legacy fenced reply and a JSON message containing a fence", () => {
    const message = "설명\n```html\n<div>미리보기</div>\n```";
    expect(extractAgentHtml(message)).toBe("<div>미리보기</div>");
    expect(extractAgentHtml(JSON.stringify({ message }))).toBe("<div>미리보기</div>");
  });
  it("reads raw HTML but not plain chat text or malformed JSON", () => {
    expect(extractAgentHtml("<!DOCTYPE html><html></html>")).toContain("DOCTYPE");
    expect(extractAgentHtml("<section>내용</section>")).toBe("<section>내용</section>");
    expect(extractAgentHtml("코드가 없는 설명")).toBeNull();
    expect(extractAgentHtml('{"code":')).toBeNull();
  });
});
