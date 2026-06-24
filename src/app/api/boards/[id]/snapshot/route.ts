import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { requireShareAuth } from "@/lib/share/with-share";
import type { SectionBreakoutGroupWire } from "@/lib/section-breakout";
import {
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";

type CardWire = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  sectionId: string | null;
  groupId: string | null;
  authorId: string | null;
  studentAuthorId: string | null;
  externalAuthorName: string | null;
  studentAuthorName: string | null;
  authorName: string | null;
  queueStatus: string | null;
  authors: Array<{
    id: string;
    studentId: string | null;
    displayName: string;
    order: number;
  }>;
  attachments: Array<{
    id: string;
    kind: string;
    url: string;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  createdAt: string;
};

type SectionWire = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  sortMode: string | null;
  activityTemplate: string | null;
  activityTemplateState: StreamActivityTemplateState;
  breakout: {
    groupCount: number;
    groupCapacity: number | null;
    joinMode: string;
    groups: SectionBreakoutGroupWire[];
  } | null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardIdOrSlug } = await params;
    const url = new URL(req.url);
    const clientHash = url.searchParams.get("hash");

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent().catch(() => null),
    ]);
    const shareToken = req.headers.get("x-share-token");

    const board = await db.board.findFirst({
      where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
      select: {
        id: true,
        layout: true,
        questionPrompt: true,
        questionVizMode: true,
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!user && !student) {
      const shareResult = await requireShareAuth(shareToken, "student");
      if (!("identity" in shareResult)) {
        return NextResponse.json(
          { error: shareResult.error },
          { status: shareResult.status },
        );
      }
      if (shareResult.identity.boardId !== board.id) {
        return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
      }
    } else {
      const role = await getEffectiveBoardRole(board.id, {
        userId: user?.id,
        studentId: student?.id,
      });
      if (!role) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [
      cardsRaw,
      sectionsRaw,
      breakoutConfigsRaw,
      breakoutGroupsRaw,
      responsesRaw,
    ] = await Promise.all([
      db.card.findMany({
        where: { boardId: board.id },
        orderBy: { order: "asc" },
        include: {
          author: { select: { name: true } },
          studentAuthor: { select: { name: true } },
          authors: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              studentId: true,
              displayName: true,
              order: true,
            },
          },
          attachments: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              kind: true,
              url: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              order: true,
            },
          },
        },
      }),
      db.section.findMany({ where: { boardId: board.id } }),
      db.sectionBreakoutConfig.findMany({
        where: { section: { boardId: board.id } },
      }),
      db.sectionBreakoutGroup.findMany({
        where: { section: { boardId: board.id } },
        orderBy: { order: "asc" },
        include: {
          _count: { select: { members: true } },
          members: {
            orderBy: [
              { student: { number: "asc" } },
              { student: { name: "asc" } },
            ],
            include: {
              student: { select: { id: true, name: true, number: true } },
            },
          },
        },
      }),
      board.layout === "question-board"
        ? db.boardResponse.findMany({
            where: { boardId: board.id },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
              student: { select: { id: true, name: true } },
              user: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const breakoutConfigBySection = new Map(
      breakoutConfigsRaw.map((row) => [row.sectionId, row]),
    );
    const breakoutGroupsBySection = new Map<
      string,
      (typeof breakoutGroupsRaw)[number][]
    >();
    for (const group of breakoutGroupsRaw) {
      const list = breakoutGroupsBySection.get(group.sectionId) ?? [];
      list.push(group);
      breakoutGroupsBySection.set(group.sectionId, list);
    }

    const cards: CardWire[] = cardsRaw.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      color: c.color,
      imageUrl: c.imageUrl,
      linkUrl: c.linkUrl,
      linkTitle: c.linkTitle,
      linkDesc: c.linkDesc,
      linkImage: c.linkImage,
      videoUrl: c.videoUrl,
      fileUrl: c.fileUrl,
      fileName: c.fileName,
      fileSize: c.fileSize,
      fileMimeType: c.fileMimeType,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      order: c.order,
      sectionId: c.sectionId,
      groupId: c.groupId ?? null,
      authorId: c.authorId,
      studentAuthorId: c.studentAuthorId,
      externalAuthorName: c.externalAuthorName,
      studentAuthorName: c.studentAuthor?.name ?? null,
      authorName: c.author?.name ?? null,
      queueStatus: c.queueStatus,
      authors: c.authors.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        displayName: a.displayName,
        order: a.order,
      })),
      attachments: c.attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        url: a.url,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        order: a.order,
      })),
      createdAt: c.createdAt.toISOString(),
    }));

    const sections: SectionWire[] = sectionsRaw
      .map((s) => ({
        id: s.id,
        title: s.title,
        order: s.order,
        pinned: s.pinned,
        sortMode: s.sortMode,
        activityTemplate: s.activityTemplate,
        activityTemplateState: normalizeStreamActivityTemplateState(
          s.activityTemplateState,
        ),
        breakout: buildSectionBreakoutSnapshot(
          s.id,
          breakoutConfigBySection,
          breakoutGroupsBySection,
        ),
      }))
      .sort(sortSections);

    const question =
      board.layout === "question-board"
        ? {
            prompt: board.questionPrompt,
            vizMode: board.questionVizMode,
            responses: responsesRaw.map((r) => ({
              id: r.id,
              text: r.text,
              createdAt: r.createdAt.toISOString(),
              studentId: r.studentId,
              userId: r.userId,
              authorName: r.student?.name ?? r.user?.name ?? "익명",
            })),
          }
        : null;

    const payload = { cards, sections, question };
    const hash = hashStable(payload);
    if (clientHash && clientHash === hash) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "Cache-Control": "no-store",
          ETag: hash,
        },
      });
    }

    return NextResponse.json(
      { ...payload, hash },
      {
        headers: {
          "Cache-Control": "no-store",
          ETag: hash,
        },
      },
    );
  } catch (e) {
    console.error("[GET /api/boards/:id/snapshot]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function hashStable(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

type SectionBreakoutConfigRow = {
  sectionId: string;
  groupCount: number;
  groupCapacity: number | null;
  joinMode: string;
};

type SectionBreakoutGroupRow = {
  id: string;
  sectionId: string;
  name: string;
  order: number;
  _count: { members: number };
  members: {
    id: string;
    studentId: string;
    student: { id: string; name: string; number: number | null };
  }[];
};

function buildSectionBreakoutSnapshot(
  sectionId: string,
  configBySection: Map<string, SectionBreakoutConfigRow>,
  groupsBySection: Map<string, SectionBreakoutGroupRow[]>,
): SectionWire["breakout"] {
  const config = configBySection.get(sectionId);
  if (!config) return null;
  return {
    groupCount: config.groupCount,
    groupCapacity: config.groupCapacity,
    joinMode: config.joinMode,
    groups: (groupsBySection.get(sectionId) ?? []).map((group) => ({
      id: group.id,
      sectionId: group.sectionId,
      name: group.name,
      order: group.order,
      memberCount: group._count.members,
      members: group.members.map((member) => ({
        id: member.id,
        studentId: member.studentId,
        studentName: member.student.name,
        studentNumber: member.student.number,
      })),
    })),
  };
}

function sortSections(a: SectionWire, b: SectionWire): number {
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  if (a.pinned && b.pinned) return a.order - b.order;
  return b.order - a.order;
}
