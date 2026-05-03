import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentTierAsync, canUseTemplate } from "@/lib/tier";
import {
  BreakoutConfigSchema,
  cloneStructure,
  groupSectionTitle,
} from "@/lib/breakout";
import {
  ASSIGNMENT_MAX_SLOTS,
  ASSIGNMENT_GUIDE_TEXT_MAX,
} from "@/lib/assignment-schemas";

// Grid cell dims — matches Card default width/height; render uses CSS grid so
// these are stored-only placeholders for future freeform fallback.
const ASSIGN_CARD_W = 240;
const ASSIGN_CARD_H = 160;

const CreateBoardSchema = z.object({
  title: z.string().max(200).default(""),
  layout: z.enum([
    "freeform",
    "grid",
    "stream",
    "columns",
    "assignment",
    "quiz",
    "drawing",
    "breakout",
    "assessment",
    "dj-queue",
    "vibe-arcade",
    "vibe-gallery",
    "question-board",
    "statistics",
  ]),
  description: z.string().max(2000).default(""),
  classroomId: z.string().optional(),
  // BR-3: Breakout-specific config (only used when layout === "breakout").
  breakoutConfig: BreakoutConfigSchema.optional(),
  // AB-1: Assignment-specific fields (only used when layout === "assignment").
  assignmentGuideText: z.string().max(ASSIGNMENT_GUIDE_TEXT_MAX).optional(),
  assignmentAllowLate: z.boolean().optional(),
  assignmentDeadline: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const input = CreateBoardSchema.parse(body);

    const baseSlug = input.title
      ? input.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : "board";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // ── Breakout branch (BR-3) ──────────────────────────────────────────
    if (input.layout === "breakout") {
      if (!input.breakoutConfig) {
        return NextResponse.json(
          { error: "breakoutConfig required for layout=breakout" },
          { status: 400 }
        );
      }
      const cfg = input.breakoutConfig;
      const template = await db.breakoutTemplate.findUnique({
        where: { id: cfg.templateId },
      });
      if (!template) {
        return NextResponse.json({ error: "template_not_found" }, { status: 404 });
      }

      // Tier gating — DB subscription + env override (Seed 14 async).
      const tier = await getCurrentTierAsync(user.id);
      if (!canUseTemplate(tier, template.requiresPro)) {
        return NextResponse.json(
          { error: "pro_required", templateKey: template.key },
          { status: 403 }
        );
      }

      // Deep-clone structure so template edits never retroactively affect this
      // board (decisions Q6 — 복사 원칙).
      const structure = cloneStructure(template.structure);

      const effectiveTitle = input.title || template.name;
      const groupCount = cfg.groupCount;

      // Single transaction: Board + Assignment + Sections + default Cards.
      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title: effectiveTitle,
            slug,
            layout: "breakout",
            description: input.description,
            classroomId: input.classroomId ?? null,
            members: {
              create: { userId: user.id, role: "owner" },
            },
          },
        });

        const assignment = await tx.breakoutAssignment.create({
          data: {
            boardId: createdBoard.id,
            templateId: template.id,
            deployMode: cfg.deployMode ?? "link-fixed",
            groupCount,
            groupCapacity: cfg.groupCapacity,
            visibilityOverride: cfg.visibilityOverride ?? null,
            status: "active",
          },
        });

        // Group sections: for each group 1..N, for each sectionsPerGroup spec,
        // create a Section. Default cards are inserted inside the spec loop.
        let orderCursor = 0;
        for (let g = 1; g <= groupCount; g++) {
          for (const spec of structure.sectionsPerGroup) {
            const section = await tx.section.create({
              data: {
                boardId: createdBoard.id,
                title: groupSectionTitle(g, spec.title),
                order: orderCursor++,
              },
            });
            if (spec.defaultCards && spec.defaultCards.length > 0) {
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
        }

        // Shared teacher-pool section — board-level single.
        if (structure.sharedSections) {
          for (const shared of structure.sharedSections) {
            await tx.section.create({
              data: {
                boardId: createdBoard.id,
                title: shared.title,
                order: orderCursor++,
              },
            });
          }
        }

        return { ...createdBoard, assignmentId: assignment.id };
      });

      return NextResponse.json({ board });
    }

    // ── Assignment branch (AB-1) ─────────────────────────────────────────
    // Board-first flow: classroomId optional at creation. When absent the
    // board is created empty (0 slots); teacher attaches a classroom later
    // from the in-board FAB, which calls `/api/boards/[id]/roster-sync` to
    // populate slots. Consistent with how every other layout is created.
    if (input.layout === "assignment") {
      let classroom: { id: string; students: { id: string; number: number | null; name: string }[] } | null = null;
      if (input.classroomId) {
        const c = await db.classroom.findUnique({
          where: { id: input.classroomId },
          include: {
            students: { orderBy: [{ number: "asc" }, { createdAt: "asc" }] },
          },
        });
        if (!c) {
          return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
        }
        if (c.teacherId !== user.id) {
          return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
        }
        const roster = c.students;
        if (roster.length > ASSIGNMENT_MAX_SLOTS) {
          return NextResponse.json(
            { error: "classroom_too_large", max: ASSIGNMENT_MAX_SLOTS, actual: roster.length },
            { status: 400 }
          );
        }
        const missingNumber = roster.filter((s) => s.number == null).map((s) => s.id);
        if (missingNumber.length > 0) {
          return NextResponse.json(
            { error: "student_missing_number", studentIds: missingNumber },
            { status: 400 }
          );
        }
        classroom = c;
      }

      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title: input.title,
            slug,
            layout: "assignment",
            description: input.description,
            classroomId: classroom?.id ?? null,
            assignmentGuideText: input.assignmentGuideText ?? "",
            assignmentAllowLate: input.assignmentAllowLate ?? true,
            assignmentDeadline: input.assignmentDeadline ? new Date(input.assignmentDeadline) : null,
            members: { create: { userId: user.id, role: "owner" } },
          },
        });
        if (classroom) {
          for (const s of classroom.students) {
            const n = s.number as number;
            const col = (n - 1) % 5;
            const row = Math.floor((n - 1) / 5);
            const card = await tx.card.create({
              data: {
                boardId: createdBoard.id,
                authorId: user.id,
                studentAuthorId: s.id,
                externalAuthorName: s.name,
                title: "",
                content: "",
                x: col * ASSIGN_CARD_W,
                y: row * ASSIGN_CARD_H,
                width: ASSIGN_CARD_W,
                height: ASSIGN_CARD_H,
              },
            });
            await tx.assignmentSlot.create({
              data: {
                boardId: createdBoard.id,
                studentId: s.id,
                slotNumber: n,
                cardId: card.id,
              },
            });
            // Seed the CardAuthor row so author source-of-truth lives on
            // the join table for these slot cards too.
            await tx.cardAuthor.create({
              data: {
                cardId: card.id,
                studentId: s.id,
                displayName: s.name,
                order: 0,
              },
            });
          }
        }
        return createdBoard;
      });

      return NextResponse.json({ board, slots: classroom?.students.length ?? 0 });
    }

    // ── Statistics branch (2026-05-03) ──────────────────────────────────
    if (input.layout === "statistics") {
      if (!input.classroomId) {
        return NextResponse.json(
          { error: "학급보드는 학급에 속해야 합니다" },
          { status: 400 }
        );
      }
      const classroom = await db.classroom.findUnique({
        where: { id: input.classroomId },
        include: { students: true },
      });
      if (!classroom) {
        return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
      }
      if (classroom.teacherId !== user.id) {
        return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
      }

      const groupCount = Math.min(Math.max(1, Math.ceil(classroom.students.length / 4)), 10);

      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title: input.title || "통계활용대회 학급보드",
            slug,
            layout: "statistics",
            description: input.description,
            classroomId: input.classroomId,
            members: { create: { userId: user.id, role: "owner" } },
          },
        });

        // Note: sections and missions are created lazily when a student
        // clicks "팀 만들기" — POST /api/boards/[id]/teams
        return createdBoard;
      });

      return NextResponse.json({ board });
    }

    // ── Non-breakout layouts (unchanged) ────────────────────────────────
    // dj-queue: classroom required — the role-grant chain keys off
    // board.classroomId, so a classroom-less DJ board would be teacher-only
    // and defeat the purpose.
    if (input.layout === "dj-queue" && !input.classroomId) {
      return NextResponse.json(
        { error: "DJ 큐 보드는 학급에 속해야 합니다" },
        { status: 400 }
      );
    }

    // columns + classroom: 학생 이름 자동 섹션화는 더 이상 기본이 아니다.
    // 교사가 보드에 들어가서 "🧑 학생 이름으로 칼럼 만들기" 버튼을 명시적으로
    // 누르면 POST /api/boards/:id/sections/seed-students 가 실행된다.
    // (사용자 결정 2026-04-24 — 자동 생성이 강제처럼 느껴진다는 피드백)
    const board = await db.board.create({
      data: {
        title: input.title,
        slug,
        layout: input.layout,
        description: input.description,
        classroomId: input.classroomId ?? null,
        members: {
          create: { userId: user.id, role: "owner" },
        },
      },
    });

    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/boards]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
