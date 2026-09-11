import { expect, it } from "vitest";
import { commentRequest } from "../../apps/mobile/lib/comment-request";

it("reuses retries but separates changed content and targets", () => {
  const first = commentRequest(null, "card-a:hello");
  expect(commentRequest(first, "card-a:hello")).toBe(first);
  expect(commentRequest(first, "card-b:hello").id).not.toBe(first.id);
  expect(commentRequest(first, "card-a:changed").id).not.toBe(first.id);
});
