import { describe, it, expect } from "vitest";
import {
  pickAuthorName,
  formatAuthorList,
  type AuthorLike,
} from "../card-author";

const A = (order: number, displayName: string): AuthorLike => ({ order, displayName });

describe("pickAuthorName — legacy fallback chain", () => {
  it("prefers external over student over author", () => {
    expect(pickAuthorName("ex", "stu", "au")).toBe("ex");
    expect(pickAuthorName(null, "stu", "au")).toBe("stu");
    expect(pickAuthorName(null, null, "au")).toBe("au");
    expect(pickAuthorName(null, null, null)).toBe(null);
  });
  it("treats undefined like null", () => {
    expect(pickAuthorName(undefined, "stu", undefined)).toBe("stu");
  });
});

describe("formatAuthorList", () => {
  it("empty → fallback via pickAuthorName", () => {
    expect(formatAuthorList([], "ex", null, null)).toBe("ex");
    expect(formatAuthorList(null, null, "stu", null)).toBe("stu");
    expect(formatAuthorList(undefined, null, null, "au")).toBe("au");
    expect(formatAuthorList([], null, null, null)).toBe(null);
  });
  it("1 author — just the name", () => {
    expect(formatAuthorList([A(0, "김철수")], null, null, null)).toBe("김철수");
  });
  it("2 authors — polite pair label", () => {
    expect(formatAuthorList([A(0, "김철수"), A(1, "이영희")], null, null, null)).toBe(
      "김철수님과 이영희님"
    );
  });
  it("3 authors — first author plus remaining count", () => {
    expect(
      formatAuthorList(
        [A(0, "김철수"), A(1, "이영희"), A(2, "박민수")],
        null,
        null,
        null
      )
    ).toBe("김철수님과 2명");
  });
  it("4+ authors — first author plus remaining count", () => {
    expect(
      formatAuthorList(
        [A(0, "김"), A(1, "이"), A(2, "박"), A(3, "최")],
        null,
        null,
        null
      )
    ).toBe("김님과 3명");
    expect(
      formatAuthorList(
        [A(0, "a"), A(1, "b"), A(2, "c"), A(3, "d"), A(4, "e"), A(5, "f")],
        null,
        null,
        null
      )
    ).toBe("a님과 5명");
  });
  it("respects order — primary is smallest order", () => {
    expect(
      formatAuthorList([A(1, "이영희"), A(0, "김철수")], null, null, null)
    ).toBe("김철수님과 이영희님");
  });
  it("filters empty displayName", () => {
    expect(
      formatAuthorList([A(0, "김"), A(1, "   "), A(2, "박")], null, null, null)
    ).toBe("김님과 박님");
  });
  it("all empty strings → fallback", () => {
    expect(formatAuthorList([A(0, ""), A(1, "   ")], "ex", null, null)).toBe("ex");
  });
});
