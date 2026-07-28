import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  anonymousAuthor: false,
  identityKind: "teacher" as "teacher" | "anon",
  sections: new Map<string, string>(),
  update: vi.fn(),
  findCard: vi.fn(),
  findAttachments: vi.fn(),
  transactionError: null as Error | null,
  enqueueBlobDeletion: vi.fn(),
  remove: vi.fn(),
  touch: vi.fn(),
}));

const card = {
  id: "card-1",
  boardId: "board-1",
  sectionId: null,
  authorId: null,
  studentAuthorId: null,
  externalAuthorKey: "guest-owner",
  attachments: [],
  commentVoteOptionCount: null,
  commentVoteOptionLabels: null,
  linkUrl: null,
  linkImage: null,
  imageUrl: null,
  thumbUrl: null,
  videoUrl: null,
  fileUrl: null,
};

const board = () => ({
  id: "board-1",
  classroomId: "classroom-1",
  anonymousAuthor: mocks.anonymousAuthor,
  classroom: { teacherId: "teacher-1" },
});

vi.mock("@/lib/db", () => {
  const tx = {
    section: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; boardId: string } }) =>
        mocks.sections.get(where.id) === where.boardId ? { id: where.id } : null,
      ),
    },
    card: { update: mocks.update },
    cardPollVote: { deleteMany: vi.fn() },
    cardAttachment: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    db: {
      card: {
        findUnique: mocks.findCard,
        delete: mocks.remove,
      },
      board: { findUnique: vi.fn(async () => board()) },
      cardAttachment: { findMany: mocks.findAttachments },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
        if (mocks.transactionError) throw mocks.transactionError;
        return operation(tx);
      }),
    },
  };
});

vi.mock("@/lib/identity", () => ({
  resolveIdentities: vi.fn(async () =>
    mocks.identityKind === "teacher"
      ? {
          teacher: {
            userId: "teacher-1",
            name: "Teacher",
            ownsBoardIds: new Set(["board-1"]),
          },
          student: null,
          parent: null,
          share: null,
          primary: "teacher",
        }
      : {
          teacher: null,
          student: null,
          parent: null,
          share: null,
          primary: "anon",
        },
  ),
}));

vi.mock("@/lib/share/with-share", () => ({
  resolveShareIdentity: vi.fn(),
  requireShareAuth: vi.fn(async (shareToken: string) => ({
    identity: {
      shareToken,
      boardId: "board-1",
      permission: "student",
      authorName: "Guest",
    },
  })),
}));

vi.mock("@/lib/canva", () => ({
  deriveCanvaThumbnailUrl: vi.fn(),
  isCanvaDesignUrl: vi.fn(() => false),
  proxiedCanvaThumbnailUrl: vi.fn(),
  expandCanvaShortLink: vi.fn(),
}));
vi.mock("@/lib/canva-preview-cache", () => ({ resolveCanvaEmbedUrlCached: vi.fn() }));
vi.mock("@/lib/file-attachment", () => ({
  MAX_ATTACHMENTS_PER_CARD: 10,
  isAllowedFileUrl: vi.fn(() => true),
  isAllowedStoredMime: vi.fn(() => true),
}));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: mocks.touch }));
vi.mock("@/lib/realtime-broadcast", () => ({
  announceCardChange: vi.fn(),
  announcePollChange: vi.fn(),
}));
vi.mock("@/lib/blob", () => ({
  extractVideoThumbnail: vi.fn(),
  resizeRemoteImageToWebPPreviewUrl: vi.fn(),
}));
vi.mock("@/lib/blob-cleanup", () => ({
  enqueueBlobDeletion: mocks.enqueueBlobDeletion,
}));

import { DELETE, PATCH } from "./route";

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/cards/card-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function shareDeleteRequest(guestId: string) {
  return new Request("http://localhost/api/cards/card-1", {
    method: "DELETE",
    headers: {
      "x-share-token": "share-token",
      "x-share-guest-id": guestId,
    },
  });
}

const context = { params: Promise.resolve({ id: "card-1" }) };

describe("card route integrity", () => {
  beforeEach(() => {
    mocks.anonymousAuthor = false;
    mocks.identityKind = "teacher";
    mocks.sections.clear();
    mocks.findCard.mockReset();
    mocks.findCard.mockResolvedValue(card);
    mocks.findAttachments.mockReset();
    mocks.findAttachments.mockResolvedValue([]);
    mocks.transactionError = null;
    mocks.enqueueBlobDeletion.mockReset();
    mocks.enqueueBlobDeletion.mockResolvedValue(undefined);
    mocks.update.mockReset();
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...card,
      ...data,
    }));
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue(card);
    mocks.touch.mockReset();
  });

  it("rejects a section from another board inside the mutation transaction", async () => {
    mocks.sections.set("section-other", "board-2");

    const response = await PATCH(patchRequest({ sectionId: "section-other" }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "sectionId does not belong to boardId" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a missing section", async () => {
    const response = await PATCH(patchRequest({ sectionId: "section-missing" }), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("enqueues replaced attachment URLs after the transaction succeeds", async () => {
    const oldAttachment = {
      id: "attachment-old",
      kind: "image",
      url: "https://storage.test/old.png",
      previewUrl: "https://storage.test/old-preview.webp",
      fileName: null,
      fileSize: null,
      mimeType: "image/png",
      order: 0,
    };
    const newAttachment = {
      ...oldAttachment,
      id: "attachment-new",
      url: "https://storage.test/new.png",
      previewUrl: "https://storage.test/new-preview.webp",
    };
    mocks.findCard.mockResolvedValue({ ...card, attachments: [oldAttachment] });
    mocks.findAttachments.mockResolvedValue([newAttachment]);

    const response = await PATCH(
      patchRequest({
        attachments: [
          {
            kind: "image",
            url: newAttachment.url,
            previewUrl: newAttachment.previewUrl,
            mimeType: newAttachment.mimeType,
          },
        ],
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueBlobDeletion).toHaveBeenCalledWith(
      [oldAttachment.url, oldAttachment.previewUrl],
      "card.update",
      "Card",
      "card-1",
    );
  });

  it("keeps the successful card response when cleanup reservation fails", async () => {
    const oldAttachment = {
      id: "attachment-old",
      kind: "image",
      url: "https://storage.test/old.png",
      previewUrl: null,
      fileName: null,
      fileSize: null,
      mimeType: "image/png",
      order: 0,
    };
    mocks.findCard.mockResolvedValue({ ...card, attachments: [oldAttachment] });
    mocks.findAttachments.mockResolvedValue([]);
    mocks.enqueueBlobDeletion.mockRejectedValueOnce(new Error("queue unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await PATCH(patchRequest({ attachments: [] }), context);

    expect(response.status).toBe(200);
    expect(mocks.touch).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[card.update] blob cleanup enqueue failed",
      expect.objectContaining({ cardId: "card-1", count: 1 }),
    );
    warn.mockRestore();
  });

  it("does not enqueue attachment URLs reused by the replacement", async () => {
    const keptUrl = "https://storage.test/kept.png";
    const removedUrl = "https://storage.test/removed.png";
    const addedUrl = "https://storage.test/added.png";
    mocks.findCard.mockResolvedValue({
      ...card,
      attachments: [
        { id: "kept", kind: "image", url: keptUrl, previewUrl: null },
        { id: "removed", kind: "image", url: removedUrl, previewUrl: null },
      ],
    });
    mocks.findAttachments.mockResolvedValue([
      { id: "kept-next", kind: "image", url: keptUrl, previewUrl: null },
      { id: "added", kind: "image", url: addedUrl, previewUrl: null },
    ]);

    const response = await PATCH(
      patchRequest({
        attachments: [
          { kind: "image", url: keptUrl, previewUrl: keptUrl },
          { kind: "image", url: addedUrl, previewUrl: addedUrl },
        ],
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueBlobDeletion).toHaveBeenCalledWith(
      [removedUrl],
      "card.update",
      "Card",
      "card-1",
    );
  });

  it("enqueues all removed attachment and legacy media URLs when cleared", async () => {
    const legacyUrls = {
      imageUrl: "https://storage.test/legacy-image.png",
      linkImage: "https://storage.test/legacy-link.png",
      videoUrl: "https://storage.test/legacy-video.mp4",
      fileUrl: "https://storage.test/legacy-file.pdf",
    };
    const oldAttachment = {
      id: "attachment-old",
      kind: "file",
      url: "https://storage.test/old-file.pdf",
      previewUrl: "https://storage.test/old-file-preview.webp",
    };
    const currentCard = { ...card, ...legacyUrls, attachments: [oldAttachment] };
    mocks.findCard.mockResolvedValue(currentCard);
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...currentCard,
      ...data,
    }));

    const response = await PATCH(
      patchRequest({
        attachments: [],
        imageUrl: null,
        linkImage: null,
        videoUrl: null,
        fileUrl: null,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.enqueueBlobDeletion).toHaveBeenCalledWith(
      [
        legacyUrls.imageUrl,
        legacyUrls.linkImage,
        legacyUrls.videoUrl,
        legacyUrls.fileUrl,
        oldAttachment.url,
        oldAttachment.previewUrl,
      ],
      "card.update",
      "Card",
      "card-1",
    );
  });

  it("does not enqueue cleanup for an unchanged payload", async () => {
    const existingAttachment = {
      id: "attachment-existing",
      kind: "image",
      url: "https://storage.test/existing.png",
      previewUrl: "https://storage.test/existing-preview.webp",
    };
    const currentCard = {
      ...card,
      imageUrl: "https://storage.test/legacy.png",
      attachments: [existingAttachment],
    };
    mocks.findCard.mockResolvedValue(currentCard);
    mocks.findAttachments.mockResolvedValue([existingAttachment]);
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...currentCard,
      ...data,
    }));

    const response = await PATCH(patchRequest({ title: "Updated title" }), context);

    expect(response.status).toBe(200);
    expect(mocks.enqueueBlobDeletion).not.toHaveBeenCalled();
  });

  it("does not enqueue cleanup when the transaction fails", async () => {
    mocks.findCard.mockResolvedValue({
      ...card,
      attachments: [
        {
          id: "attachment-old",
          kind: "image",
          url: "https://storage.test/old.png",
          previewUrl: null,
        },
      ],
    });
    mocks.transactionError = new Error("transaction failed");

    const response = await PATCH(patchRequest({ attachments: [] }), context);

    expect(response.status).toBe(500);
    expect(mocks.enqueueBlobDeletion).not.toHaveBeenCalled();
  });

  it("allows the matching share guest to delete their external card", async () => {
    mocks.identityKind = "anon";

    const response = await DELETE(shareDeleteRequest("guest-owner"), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "card-1" } });
  });

  it("denies another share guest even when the board displays authors anonymously", async () => {
    mocks.identityKind = "anon";
    mocks.anonymousAuthor = true;

    const response = await DELETE(shareDeleteRequest("guest-other"), context);

    expect(response.status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
