import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  cloneTeacherBoard,
  type BoardCloneSource,
} from "./clone";

const boardCreate = vi.fn();
const sectionCreate = vi.fn();
const cardCreate = vi.fn();
const attachmentFindMany = vi.fn();
const attachmentCreateMany = vi.fn();

const tx = {
  board: { create: boardCreate },
  section: { create: sectionCreate },
  card: { create: cardCreate },
  cardAttachment: {
    findMany: attachmentFindMany,
    createMany: attachmentCreateMany,
  },
} as unknown as PrismaClient;

function source(): BoardCloneSource {
  return {
    id: "source-1",
    slug: "shared-board",
    title: "공유 보드",
    layout: "columns",
    description: "설명",
    category: "LESSON",
    thumbnailMode: "default",
    thumbnailUrl: null,
    anonymousAuthor: false,
    eventPosterUrl: null,
    applicationStart: null,
    applicationEnd: null,
    eventStart: null,
    eventEnd: null,
    venue: null,
    maxSelections: null,
    videoPolicy: "optional",
    videoProviders: "youtube",
    maxVideoDurationSec: null,
    maxVideoSizeMb: null,
    allowTeam: false,
    maxTeamSize: null,
    customQuestions: "[]",
    announceMode: "private",
    requireApproval: false,
    askName: true,
    askGradeClass: true,
    askStudentNumber: true,
    askContact: false,
    assignmentGuideText: "",
    assignmentAllowLate: true,
    assignmentDeadline: null,
    questionPrompt: null,
    questionVizMode: "word-cloud",
    streamTitlePrompt: "",
    streamContentPrompt: "",
    streamSectionsEnabled: true,
    subjectOrder: "desc",
    boardTheme: "pastel-mint",
    auraEvaluationEnabled: false,
    auraSubject: null,
    auraUnit: null,
    auraCriterion: null,
    sections: [
      {
        id: "section-1",
        title: "첫 주제",
        order: 0,
        pinned: true,
        sortMode: "manual",
        activityTemplate: null,
        activityTemplateState: null,
      },
    ],
    cards: [
      {
        id: "card-1",
        sectionId: "section-1",
        authorId: "teacher-source",
        studentAuthorId: null,
        externalAuthorName: null,
        externalAuthorKey: null,
        title: "원본 게시물",
        content: "복사되면 안 됨",
        color: null,
        imageUrl: null,
        thumbUrl: null,
        linkUrl: null,
        linkTitle: null,
        linkDesc: null,
        linkImage: null,
        videoUrl: null,
        fileUrl: null,
        fileName: null,
        fileSize: null,
        fileMimeType: null,
        canvaDesignId: null,
        x: 0,
        y: 0,
        width: 240,
        height: 160,
        order: 0,
        guidePinned: false,
        queueStatus: null,
        authors: [],
      },
    ],
  };
}

describe("cloneTeacherBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boardCreate.mockResolvedValue({
      id: "copy-1",
      slug: "shared-board-copy",
      title: "공유 보드 (복사본)",
      layout: "columns",
    });
    sectionCreate.mockResolvedValue({ id: "copy-section-1" });
  });

  it("creates a private classroom copy with structure but no cards or attachments", async () => {
    const result = await cloneTeacherBoard(tx, source(), "teacher-copy", {
      classroomId: "classroom-1",
      copyCards: false,
    });

    expect(result.id).toBe("copy-1");
    expect(boardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "LESSON",
        subjectOrder: "desc",
        classroomId: "classroom-1",
        shareMode: "private",
        shareToken: null,
        shareShortCode: null,
        accessToken: null,
        members: { create: { userId: "teacher-copy", role: "owner" } },
      }),
    });
    expect(sectionCreate).toHaveBeenCalledTimes(1);
    expect(cardCreate).not.toHaveBeenCalled();
    expect(attachmentFindMany).not.toHaveBeenCalled();
    expect(attachmentCreateMany).not.toHaveBeenCalled();
  });
});
