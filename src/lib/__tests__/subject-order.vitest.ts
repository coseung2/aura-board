import { describe, it, expect } from "vitest";
import {
  isSubjectOrder,
  normalizeSubjectOrder,
  subjectOrderLabel,
  subjectOrderToAppendOrder,
  subjectOrderToBaseIndex,
  type SubjectOrder,
} from "../subject-order";

describe("normalizeSubjectOrder", () => {
  it('"asc" / "desc" 그대로 통과', () => {
    expect(normalizeSubjectOrder("asc")).toBe("asc");
    expect(normalizeSubjectOrder("desc")).toBe("desc");
  });

  it("null / undefined / 빈값 / 이상값은 asc로 fallback", () => {
    expect(normalizeSubjectOrder(null)).toBe("asc");
    expect(normalizeSubjectOrder(undefined)).toBe("asc");
    expect(normalizeSubjectOrder("")).toBe("asc");
    expect(normalizeSubjectOrder("ASC")).toBe("asc");
    expect(normalizeSubjectOrder("random")).toBe("asc");
    expect(normalizeSubjectOrder(123)).toBe("asc");
  });
});

describe("isSubjectOrder", () => {
  it("asc/desc만 true", () => {
    expect(isSubjectOrder("asc")).toBe(true);
    expect(isSubjectOrder("desc")).toBe(true);
  });
  it("그 외 false", () => {
    expect(isSubjectOrder("ASC")).toBe(false);
    expect(isSubjectOrder(null)).toBe(false);
    expect(isSubjectOrder(undefined)).toBe(false);
    expect(isSubjectOrder(1)).toBe(false);
  });
});

describe("subjectOrderToBaseIndex — unpinned order 매핑", () => {
  it("asc: 1번 학생이 보드 왼쪽 (order DESC로 표시) → baseIndex = N-1-i", () => {
    const order: SubjectOrder = "asc";
    expect(subjectOrderToBaseIndex(order, 0, 5)).toBe(4); // 1번
    expect(subjectOrderToBaseIndex(order, 1, 5)).toBe(3); // 2번
    expect(subjectOrderToBaseIndex(order, 2, 5)).toBe(2); // 3번
    expect(subjectOrderToBaseIndex(order, 3, 5)).toBe(1); // 4번
    expect(subjectOrderToBaseIndex(order, 4, 5)).toBe(0); // 5번
  });

  it("desc: N번 학생이 보드 왼쪽 (order ASC로 표시) → baseIndex = i", () => {
    const order: SubjectOrder = "desc";
    expect(subjectOrderToBaseIndex(order, 0, 5)).toBe(0); // 1번
    expect(subjectOrderToBaseIndex(order, 1, 5)).toBe(1); // 2번
    expect(subjectOrderToBaseIndex(order, 2, 5)).toBe(2); // 3번
    expect(subjectOrderToBaseIndex(order, 3, 5)).toBe(3); // 4번
    expect(subjectOrderToBaseIndex(order, 4, 5)).toBe(4); // 5번
  });

  it("학급 0명 방어 — baseIndex = 0", () => {
    expect(subjectOrderToBaseIndex("asc", 0, 0)).toBe(0);
    expect(subjectOrderToBaseIndex("desc", 0, 0)).toBe(0);
  });
});

describe("subjectOrderToAppendOrder", () => {
  it("기존 주제보다 작은 order 범위에 asc 학생 묶음을 붙인다", () => {
    expect(
      [0, 1, 2].map((index) =>
        subjectOrderToAppendOrder("asc", index, 3, -10),
      ),
    ).toEqual([-11, -12, -13]);
  });

  it("desc는 같은 범위를 사용하되 끝번호가 왼쪽에 오도록 배치한다", () => {
    expect(
      [0, 1, 2].map((index) =>
        subjectOrderToAppendOrder("desc", index, 3, -10),
      ),
    ).toEqual([-13, -12, -11]);
  });

  it("기존 주제가 없으면 -1 이하에서 시작한다", () => {
    expect(
      [0, 1].map((index) =>
        subjectOrderToAppendOrder("asc", index, 2, null),
      ),
    ).toEqual([-1, -2]);
  });
});

describe("subjectOrderLabel", () => {
  it("asc 라벨", () => {
    expect(subjectOrderLabel("asc").short).toBe("1번부터");
    expect(subjectOrderLabel("asc").long).toMatch(/1번부터/);
  });
  it("desc 라벨", () => {
    expect(subjectOrderLabel("desc").short).toBe("끝번호부터");
    expect(subjectOrderLabel("desc").long).toMatch(/끝번호부터/);
  });
});
