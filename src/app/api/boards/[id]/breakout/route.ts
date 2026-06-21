import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { groupSectionTitle } from "@/lib/breakout";

const CreateStreamBreakoutSchema = z.object({
  groupCount: z.number().int().min(1).max(10),
  groupCapacity: z.number().int().min(1).max(6),
  visibilityOverride: z.enum(["own-only", "peek-others"]).nullable().optional(),
  classroomId: z.string().nullable().optional(),
});

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "breakout"
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const input = CreateStreamBreakoutSchema.parse(await req.json());

    const source = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        sections: { orderBy: { order: "asc" } },
      },
    });
    if (!source) {
      return NextResponse.json({ error: "source_not_found" }, { status: 404 });
    }
    if (source.layout !== "stream") {
      return NextResponse.json({ error: "source_must_be_stream" }, { status: 400 });
    }

    await requirePermission(source.id, user.id, "edit");

    const sectionTitles =
      source.streamSectionsEnabled && source.sections.length > 0
        ? source.sections.map((section) => section.title)
        : ["활동"];
    const titlePrompt = source.streamTitlePrompt.trim();
    const contentPrompt = source.streamContentPrompt.trim();
    const defaultCards =
      titlePrompt || contentPrompt
        ? [
            {
              title: titlePrompt || "작성 안내",
              content: contentPrompt,
            },
          ]
        : [];
    const structure = {
      sectionsPerGroup: sectionTitles.map((title) => ({
        title,
        role: "group-copy" as const,
        defaultCards,
      })),
      sharedSections: [],
    };

    const targetTitle = `${source.title || "제목 없음"} 브레이크아웃`;
    const slug = `${slugify(targetTitle)}-${Date.now().toString(36)}`;

    const board = await db.$transaction(async (tx) => {
      const template = await tx.breakoutTemplate.create({
        data: {
          key: `stream-${source.id}-${Date.now().toString(36)}`,
          name: `${source.title || "스트림"} 양식`,
          description: "스트림 보드에서 만든 모둠별 복제 양식",
          scope: "teacher",
          ownerId: user.id,
          structure,
          recommendedVisibility: "own-only",
          defaultGroupCount: input.groupCount,
          defaultGroupCapacity: input.groupCapacity,
        },
      });

      const createdBoard = await tx.board.create({
        data: {
          title: targetTitle,
          slug,
          layout: "breakout",
          description: source.description,
          classroomId: input.classroomId ?? source.classroomId,
          thumbnailMode: source.thumbnailMode,
          thumbnailUrl: source.thumbnailUrl,
          boardTheme: source.boardTheme,
          members: {
            create: { userId: user.id, role: "owner" },
          },
        },
      });

      const assignment = await tx.breakoutAssignment.create({
        data: {
          boardId: createdBoard.id,
          templateId: template.id,
          deployMode: "link-fixed",
          groupCount: input.groupCount,
          groupCapacity: input.groupCapacity,
          visibilityOverride: input.visibilityOverride ?? null,
          status: "active",
        },
      });

      let sectionOrder = 0;
      for (let groupIndex = 1; groupIndex <= input.groupCount; groupIndex++) {
        for (const spec of structure.sectionsPerGroup) {
          const section = await tx.section.create({
            data: {
              boardId: createdBoard.id,
              title: groupSectionTitle(groupIndex, spec.title),
              order: sectionOrder++,
            },
          });
          let cardOrder = 0;
          for (const card of spec.defaultCards) {
            await tx.card.create({
              data: {
                boardId: createdBoard.id,
                sectionId: section.id,
                authorId: user.id,
                title: card.title,
                content: card.content,
                x: 0,
                y: 0,
                order: cardOrder++,
              },
            });
          }
        }
      }

      return { ...createdBoard, assignmentId: assignment.id };
    });

    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/boards/:id/breakout]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
