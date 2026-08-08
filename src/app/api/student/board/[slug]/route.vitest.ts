import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  boardFindFirst: vi.fn(),
  boardFindUnique: vi.fn(),
  hiddenLookup: {
    hasAnyHide: true,
    isTargetHidden: (kind: string, id: string) => kind === "card" && id === "card-hidden",
    isAuthorHidden: (id: string | null | undefined) => id === "student-hidden",
  },
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudentIdentityRaw: vi.fn(async () => ({
    id: "student-viewer",
    name: "학생",
    classroomId: "classroom-1",
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: {
      findFirst: mocks.boardFindFirst,
      findUnique: mocks.boardFindUnique,
    },
  },
}));
vi.mock("@/lib/rbac", () => ({ getEffectiveBoardRole: vi.fn(async () => "viewer") }));
vi.mock("@/lib/card-author-labels", () => ({
  resolveCardAuthorLabels: vi.fn(async () => ({ authorName: "작성자", studentAuthorName: "학생" })),
}));
vi.mock("@/lib/content-safety-service", () => ({
  loadHiddenLookup: vi.fn(async () => mocks.hiddenLookup),
}));
vi.mock("@/lib/speed-game/runtime", () => ({ loadGameSnapshot: vi.fn() }));
vi.mock("@/lib/speed-game/student-snapshot", () => ({ sanitizeGameSnapshotForStudent: vi.fn() }));
vi.mock("@/lib/plant-schemas", () => ({ parseObservationPoints: vi.fn((value) => value) }));

import { GET } from "./route";

function card(id: string, studentAuthorId: string | null) {
  return {
    id,
    boardId: "board-1",
    title: "비공개 제목",
    content: "비공개 내용",
    color: "#fff",
    imageUrl: "https://example.com/image.png",
    thumbUrl: "https://example.com/thumb.png",
    linkUrl: "https://example.com/link",
    linkTitle: "링크 제목",
    linkDesc: "링크 설명",
    linkImage: "https://example.com/link.png",
    videoUrl: "https://example.com/video.mp4",
    fileUrl: "https://example.com/file.pdf",
    fileName: "비밀.pdf",
    fileSize: 10,
    fileMimeType: "application/pdf",
    canvaDesignId: "canva-secret",
    commentVoteOptionCount: 2,
    commentVoteOptionLabels: ["비밀 선택지"],
    groupId: "group-secret",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    order: 0,
    sectionId: null,
    authorId: null,
    externalAuthorKey: "external-key",
    externalAuthorName: "외부 작성자",
    studentAuthorId,
    queueStatus: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    attachments: [{ id: "attachment-1", url: "https://example.com/attachment" }],
    authors: [{ id: "author-1", displayName: "작성자" }],
    _count: { likes: 1, comments: 2 },
  };
}

describe("student board hidden card serialization", () => {
  beforeEach(() => {
    mocks.boardFindFirst.mockReset();
    mocks.boardFindUnique.mockReset();
    const board = {
      id: "board-1",
      slug: "board-1",
      title: "보드",
      layout: "cards",
      systemGameKind: null,
      description: null,
      classroomId: "classroom-1",
      anonymousAuthor: false,
      assignmentDeadline: null,
      assignmentAllowLate: false,
      thumbnailMode: null,
      thumbnailUrl: null,
      boardTheme: null,
      streamSectionsEnabled: false,
      cards: [card("card-hidden", "student-visible"), card("card-author-hidden", "student-hidden")],
      sections: [],
    };
    mocks.boardFindFirst.mockResolvedValue(board);
    mocks.boardFindUnique.mockResolvedValue(board);
  });

  it("keeps hidden cards as non-content placeholders with their undo reason", async () => {
    const response = await GET(new Request("http://localhost/api/student/board/board-1"), {
      params: Promise.resolve({ slug: "board-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards).toHaveLength(2);
    expect(body.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "card-hidden",
          title: "",
          content: "",
          attachments: [],
          authors: [],
          hiddenReason: "item",
        }),
        expect.objectContaining({
          id: "card-author-hidden",
          title: "",
          content: "",
          attachments: [],
          authors: [],
          hiddenReason: "author",
        }),
      ]),
    );
    expect(body.cards[0].imageUrl).toBeNull();
    expect(body.cards[0].fileName).toBeNull();
    expect(body.cards[0].canvaDesignId).toBeNull();
    expect(body.cards[0].commentVoteOptionLabels).toBeNull();
    expect(mocks.boardFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
  });
});
