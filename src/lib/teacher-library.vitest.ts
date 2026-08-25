import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sectionFindUnique: vi.fn(),
  collectionUpsert: vi.fn(),
  itemFindMany: vi.fn(),
  itemUpsert: vi.fn(),
  itemCreate: vi.fn(),
  itemUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    section: { findUnique: mocks.sectionFindUnique },
    teacherLibraryCollection: { upsert: mocks.collectionUpsert },
    teacherLibraryItem: {
      findMany: mocks.itemFindMany,
      upsert: mocks.itemUpsert,
      create: mocks.itemCreate,
      update: mocks.itemUpdate,
    },
  },
}));

vi.mock("@/lib/canva", () => ({
  resolveCanvaDesignId: vi.fn(async () => null),
}));

vi.mock("@/lib/media-storage", () => ({
  deletePublicObjects: vi.fn(async () => undefined),
  parseSupabasePublicObjectUrl: vi.fn(() => false),
  uploadPublicObject: vi.fn(),
}));

import { importSectionIntoTeacherLibrary } from "./teacher-library";

describe("teacher library section import", () => {
  beforeEach(() => {
    mocks.sectionFindUnique.mockReset();
    mocks.collectionUpsert.mockReset();
    mocks.itemFindMany.mockReset();
    mocks.itemUpsert.mockReset();
    mocks.itemCreate.mockReset();
    mocks.itemUpdate.mockReset();

    mocks.collectionUpsert.mockResolvedValue({ id: "collection-1", name: "주제" });
    mocks.itemFindMany.mockResolvedValue([]);
    mocks.itemUpsert.mockResolvedValue({});
    mocks.itemCreate.mockResolvedValue({});
    mocks.itemUpdate.mockResolvedValue({});
  });

  it("imports Canva URLs and legacy image-shaped attachments", async () => {
    mocks.sectionFindUnique.mockResolvedValue({
      id: "section-1",
      title: "주제",
      boardId: "board-1",
      cards: [
        {
          id: "card-1",
          title: "수업 자료",
          content: "",
          imageUrl: null,
          thumbUrl: null,
          fileUrl: "/uploads/legacy-image.png",
          fileName: "legacy-image.png",
          fileSize: 120,
          fileMimeType: "image/png",
          linkUrl: "https://www.canva.com/design/DESIGN123",
          linkImage: null,
          canvaDesignId: null,
          attachments: [
            {
              kind: "file",
              url: "/uploads/attachment-image.webp",
              previewUrl: null,
              fileName: "attachment-image.webp",
              fileSize: 80,
              mimeType: "image/webp",
            },
            {
              kind: "file",
              url: "/uploads/worksheet.pdf",
              previewUrl: null,
              fileName: "worksheet.pdf",
              fileSize: 90,
              mimeType: "application/pdf",
            },
          ],
        },
      ],
    });

    const result = await importSectionIntoTeacherLibrary({
      userId: "teacher-1",
      sectionId: "section-1",
    });

    expect(result).toMatchObject({ created: 3, reused: 0, failed: 0 });
    expect(mocks.itemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: "canva",
          canvaDesignId: "DESIGN123",
        }),
      }),
    );
    expect(mocks.itemCreate).toHaveBeenCalledTimes(2);
  });

  it("uses the post title and a renderable preview when the original image format is unsupported", async () => {
    mocks.sectionFindUnique.mockResolvedValue({
      id: "section-1",
      title: "주제",
      boardId: "board-1",
      cards: [
        {
          id: "card-1",
          title: "Canva 디자인",
          content: "우리 반 환경 포스터",
          imageUrl: null,
          thumbUrl: null,
          fileUrl: null,
          fileName: null,
          fileSize: null,
          fileMimeType: null,
          linkUrl: null,
          linkImage: null,
          canvaDesignId: null,
          attachments: [
            {
              kind: "image",
              url: "/uploads/original.heic",
              previewUrl: "/uploads/renderable-preview.jpg",
              fileName: "original.heic",
              fileSize: 240,
              mimeType: "image/heic",
            },
          ],
        },
      ],
    });

    const result = await importSectionIntoTeacherLibrary({
      userId: "teacher-1",
      sectionId: "section-1",
    });

    expect(result).toMatchObject({ created: 1, failed: 0 });
    expect(mocks.itemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "우리 반 환경 포스터",
          assetUrl: "/uploads/renderable-preview.jpg",
        }),
      }),
    );
  });

  it("looks up source keys once and writes independent items with bounded concurrency", async () => {
    const cards = Array.from({ length: 12 }, (_, index) => ({
      id: `card-${index}`,
      title: `자료 ${index}`,
      content: "",
      imageUrl: null,
      thumbUrl: null,
      fileUrl: null,
      fileName: null,
      fileSize: null,
      fileMimeType: null,
      linkUrl: `https://www.canva.com/design/DESIGN${index}`,
      linkImage: null,
      canvaDesignId: `DESIGN${index}`,
      attachments: [],
    }));
    mocks.sectionFindUnique.mockResolvedValue({
      id: "section-1",
      title: "주제",
      boardId: "board-1",
      cards,
    });
    let active = 0;
    let maxActive = 0;
    mocks.itemUpsert.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return {};
    });

    const startedAt = performance.now();
    const result = await importSectionIntoTeacherLibrary({
      userId: "teacher-1",
      sectionId: "section-1",
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result).toMatchObject({ created: 12, reused: 0, failed: 0 });
    expect(mocks.itemFindMany).toHaveBeenCalledOnce();
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(6);
    expect(elapsedMs).toBeLessThan(160);
  });

  it("groups duplicate Canva and image sources before parallel writes", async () => {
    const cards = ["first", "second"].map((id) => ({
      id: `card-${id}`,
      title: `자료 ${id}`,
      content: "",
      imageUrl: "/uploads/shared.png",
      thumbUrl: null,
      fileUrl: null,
      fileName: null,
      fileSize: 120,
      fileMimeType: "image/png",
      linkUrl: "https://www.canva.com/design/SHARED",
      linkImage: null,
      canvaDesignId: "SHARED",
      attachments: [],
    }));
    mocks.sectionFindUnique.mockResolvedValue({
      id: "section-1",
      title: "주제",
      boardId: "board-1",
      cards,
    });

    const result = await importSectionIntoTeacherLibrary({
      userId: "teacher-1",
      sectionId: "section-1",
    });

    expect(result).toMatchObject({ created: 2, reused: 2, failed: 0 });
    expect(mocks.itemUpsert).toHaveBeenCalledOnce();
    expect(mocks.itemCreate).toHaveBeenCalledOnce();
  });
});
