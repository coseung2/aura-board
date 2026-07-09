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
import {
  saveBoardDefaultGroups,
  snapshotClassroomGroupsToBoard,
} from "@/lib/default-groups";
import {
  deriveGuesserSlot,
  normalizeKeyword,
  parseKeywords,
} from "@/lib/speed-game/score";

// Grid cell dims ??matches Card default width/height; render uses CSS grid so
// these are stored-only placeholders for future freeform fallback.
const ASSIGN_CARD_W = 240;
const ASSIGN_CARD_H = 160;
const KORDLE_DEFAULT_WORDS = [
  "planet",
  "school",
  "friend",
  "garden",
  "window",
  "silver",
];

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
    "plant-roadmap",
    "vibe-arcade",
    "vibe-gallery",
    "kordle",
    "question-board",
    "speed-game",
    "shadow-alliance",
  ]),
  description: z.string().max(2000).default(""),
  // BC-1: lesson vs play grouping. Defaults to LESSON to keep legacy clients working.
  category: z.enum(["LESSON", "PLAY"]).default("LESSON"),
  classroomId: z.string().optional(),
  thumbnailMode: z.enum(["default", "none", "custom"]).default("default"),
  // Public image URL for board thumbnail. Used when thumbnailMode="custom";
  // empty/null is normalized to null. Max 2000 chars to bound storage.
  thumbnailUrl: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v == null || v === "" ? null : v)),
  // BR-3: Breakout-specific config (only used when layout === "breakout").
  breakoutConfig: BreakoutConfigSchema.optional(),
  // AB-1: Assignment-specific fields (only used when layout === "assignment").
  assignmentGuideText: z.string().max(ASSIGNMENT_GUIDE_TEXT_MAX).optional(),
  assignmentAllowLate: z.boolean().optional(),
  assignmentDeadline: z.string().datetime().optional(),
  // 스피드게임 (2026-07-06) 설정. layout === 'speed-game' 일 때만 사용.
  // keywords: 라운드별 키워드. 1..100개, 각 1..80자.
  // answerMode: 'exact' | 'normalize-space' | 'teacher-approval'.
  // bonusRanks: '300,200,100' 형식 CSV.
  // timeLimitMs: 라운드당 시간 한도 (0 = 무제한).
  speedGameConfig: z
    .object({
      title: z.string().max(100).optional(),
      sourceWordSetId: z.string().nullable().optional(),
      keywords: z.array(z.string().min(1).max(80)).min(1).max(200),
      answerMode: z
        .enum(['exact', 'normalize-space', 'teacher-approval'])
        .default('normalize-space'),
      baseScore: z.number().int().min(0).max(100000).default(1000),
      minScore: z.number().int().min(0).max(100000).default(0),
      rankBonusFirst: z.number().int().min(0).max(100000).default(300),
      rankBonusSecond: z.number().int().min(0).max(100000).default(200),
      rankBonusThird: z.number().int().min(0).max(100000).default(100),
      groupCount: z.number().int().min(1).max(20).default(4),
      bonusRanks: z
        .string()
        .regex(/^(\d+)(,\d+){0,2}$/)
        .optional(),
      timeLimitMs: z.number().int().min(0).max(600000).default(0),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const input = CreateBoardSchema.parse(body);

    // BC-1 fix: validate classroom ownership up-front so every layout branch
    // (breakout, assignment, generic) inherits the same guard. Without this,
    // a client could post any classroomId and snapshot groups into a class they
    // do not own. Resolves to null when classroomId is omitted (e.g. teacher-only boards).
    let ownedClassroom: { id: string } | null = null;
    if (input.classroomId) {
      const classroom = await db.classroom.findUnique({
        where: { id: input.classroomId },
        select: { id: true, teacherId: true },
      });
      if (!classroom) {
        return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
      }
      if (classroom.teacherId !== user.id) {
        return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
      }
      ownedClassroom = { id: classroom.id };
    }

    const baseSlug = input.title
      ? input.title
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      : "board";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // ?? Breakout branch (BR-3) ??????????????????????????????????????????
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

      // Tier gating ??DB subscription + env override (Seed 14 async).
      const tier = await getCurrentTierAsync(user.id);
      if (!canUseTemplate(tier, template.requiresPro)) {
        return NextResponse.json(
          { error: "pro_required", templateKey: template.key },
          { status: 403 }
        );
      }

      // Deep-clone structure so template edits never retroactively affect this
      // board (decisions Q6 ??蹂듭궗 ?먯튃).
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
            category: input.category,
            classroomId: ownedClassroom?.id ?? null,
            thumbnailMode: input.thumbnailMode,
            thumbnailUrl: input.thumbnailUrl,
            members: {
              create: { userId: user.id, role: "owner" },
            },
          },
        });
        if (input.classroomId) {
          await snapshotClassroomGroupsToBoard(
            tx,
            input.classroomId,
            createdBoard.id,
          );
        }

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

        // Shared teacher-pool section ??board-level single.
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

    // ?? Assignment branch (AB-1) ?????????????????????????????????????????
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
            category: input.category,
            classroomId: classroom?.id ?? null,
            thumbnailMode: input.thumbnailMode,
            thumbnailUrl: input.thumbnailUrl,
            assignmentGuideText: input.assignmentGuideText ?? "",
            assignmentAllowLate: input.assignmentAllowLate ?? true,
            assignmentDeadline: input.assignmentDeadline ? new Date(input.assignmentDeadline) : null,
            members: { create: { userId: user.id, role: "owner" } },
          },
        });
        if (classroom) {
          await snapshotClassroomGroupsToBoard(tx, classroom.id, createdBoard.id);
        }
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

    // 스피드게임 (2026-07-06) — classroom 필수(빠른 게임은 학급 단위).
    // Board + SpeedGame + SpeedGameRound(N) + snapshotClassroomGroupsToBoard
    // 를 한 트랜잭션에서 만든다.
    if (input.layout === 'speed-game') {
      if (!ownedClassroom) {
        return NextResponse.json(
          { error: '스피드게임 보드는 학급을 선택해야 합니다.' },
          { status: 400 },
        );
      }
      if (!input.speedGameConfig) {
        return NextResponse.json(
          { error: 'speedGameConfig required for layout=speed-game' },
          { status: 400 },
        );
      }
      const cfg = input.speedGameConfig;
      // 키워드 1..100개, 각 1..80자, trim/dedupe 정규화.
      const keywords = parseKeywords(cfg.keywords);
      if (keywords.length < 1) {
        return NextResponse.json(
          { error: 'keywords_empty_after_normalize' },
          { status: 400 },
        );
      }
      if (keywords.length > 100) {
        return NextResponse.json(
          { error: 'too_many_keywords', max: 100 },
          { status: 400 },
        );
      }
      const title = input.title || cfg.title || '스피드게임';
      const bonusRanks =
        cfg.bonusRanks ??
        [cfg.rankBonusFirst, cfg.rankBonusSecond, cfg.rankBonusThird].join(',');

      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title,
            slug,
            layout: 'speed-game',
            description: input.description,
            // 스피드게임은 항상 PLAY 카테고리로 강제.
            category: 'PLAY',
            classroomId: ownedClassroom.id,
            thumbnailMode: input.thumbnailMode,
            thumbnailUrl: input.thumbnailUrl,
            members: {
              create: { userId: user.id, role: 'owner' },
            },
          },
        });
        const game = await tx.speedGame.create({
          data: {
            boardId: createdBoard.id,
            status: 'lobby',
            roundIndex: -1,
            answerMode: cfg.answerMode,
            baseScore: cfg.baseScore,
            minScore: cfg.minScore,
            bonusRanks,
            timeLimitMs: cfg.timeLimitMs,
          },
        });
        // 라운드 1..N (order 0-indexed, guesserSlot 자동 회전).
        for (let i = 0; i < keywords.length; i++) {
          const kw = keywords[i];
          await tx.speedGameRound.create({
            data: {
              gameId: game.id,
              order: i,
              keyword: kw,
              keywordNormalized: normalizeKeyword(kw),
              guesserSlot: deriveGuesserSlot(i),
            },
          });
        }
        const roster = await tx.student.findMany({
          where: { classroomId: ownedClassroom.id },
          orderBy: [{ number: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        const groupCount = Math.min(
          Math.max(cfg.groupCount, 1),
          Math.max(roster.length, 1),
        );
        const speedGameGroups = Array.from({ length: groupCount }, (_, index) => ({
          name: `${index + 1}모둠`,
          studentIds: [] as string[],
        }));
        roster.forEach((student, index) => {
          speedGameGroups[index % groupCount].studentIds.push(student.id);
        });
        await saveBoardDefaultGroups(tx, createdBoard.id, speedGameGroups);
        return createdBoard;
      });

      return NextResponse.json({ board });
    }

    if (input.layout === 'kordle') {
      if (!ownedClassroom) {
        return NextResponse.json(
          { error: "꼬들은 학급을 선택해야 합니다." },
          { status: 400 },
        );
      }

      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title: input.title || "꼬들",
            slug,
            layout: "kordle",
            description: input.description,
            category: "PLAY",
            classroomId: ownedClassroom.id,
            thumbnailMode: input.thumbnailMode,
            thumbnailUrl: input.thumbnailUrl,
            members: {
              create: { userId: user.id, role: "owner" },
            },
          },
        });
        const game = await tx.kordleGame.create({
          data: {
            boardId: createdBoard.id,
            title: createdBoard.title,
            mode: "CLASSIC",
            locale: "en-US",
            wordLength: 6,
            maxGuesses: 6,
          },
        });
        const words = await Promise.all(
          KORDLE_DEFAULT_WORDS.map((word) =>
            tx.kordleWord.upsert({
              where: {
                locale_normalized: {
                  locale: "en-US",
                  normalized: word,
                },
              },
              update: {
                isAllowed: true,
                isSolution: true,
                length: 6,
              },
              create: {
                text: word,
                normalized: word,
                length: 6,
                locale: "en-US",
                isAllowed: true,
                isSolution: true,
              },
            }),
          ),
        );
        await tx.kordlePuzzle.create({
          data: {
            gameId: game.id,
            solutionWordId: words[0].id,
            status: "LIVE",
            startsAt: new Date(),
          },
        });
        await snapshotClassroomGroupsToBoard(
          tx,
          ownedClassroom.id,
          createdBoard.id,
        );
        return createdBoard;
      });

      return NextResponse.json({ board });
    }

    if (input.layout === "shadow-alliance") {
      if (!ownedClassroom) {
        return NextResponse.json(
          { error: "그림자연합 보드는 학급을 선택해야 합니다." },
          { status: 400 },
        );
      }

      const board = await db.$transaction(async (tx) => {
        const createdBoard = await tx.board.create({
          data: {
            title: input.title || "그림자연합",
            slug,
            layout: "shadow-alliance",
            description: input.description,
            category: "PLAY",
            classroomId: ownedClassroom.id,
            thumbnailMode: input.thumbnailMode,
            thumbnailUrl: input.thumbnailUrl,
            members: { create: { userId: user.id, role: "owner" } },
          },
        });
        await snapshotClassroomGroupsToBoard(
          tx,
          ownedClassroom.id,
          createdBoard.id,
        );
        return createdBoard;
      });

      return NextResponse.json({ board });
    }

    // ?? Non-breakout layouts (unchanged) ????????????????????????????????
    // dj-queue: classroom required ??the role-grant chain keys off
    // board.classroomId, so a classroom-less DJ board would be teacher-only
    // and defeat the purpose.
    if (input.layout === "dj-queue" && !input.classroomId) {
      return NextResponse.json(
        { error: "DJ 보드는 학급을 선택해야 합니다." },
        { status: 400 }
      );
    }

    // columns + classroom: ?숈깮 ?대쫫 ?먮룞 ?뱀뀡?붾뒗 ???댁긽 湲곕낯???꾨땲??
    // 援먯궗媛 蹂대뱶???ㅼ뼱媛??"?쭛 ?숈깮 ?대쫫?쇰줈 移쇰읆 留뚮뱾湲? 踰꾪듉??紐낆떆?곸쑝濡?    // ?꾨Ⅴ硫?POST /api/boards/:id/sections/seed-students 媛 ?ㅽ뻾?쒕떎.
    // (?ъ슜??寃곗젙 2026-04-24 ???먮룞 ?앹꽦??媛뺤젣泥섎읆 ?먭뺨吏꾨떎???쇰뱶諛?
  const board = await db.$transaction(async (tx) => {
    const createdBoard = await tx.board.create({
      data: {
        title: input.title,
        slug,
        layout: input.layout,
        description: input.description,
        category: input.category,
        classroomId: ownedClassroom?.id ?? null,
        thumbnailMode: input.thumbnailMode,
        thumbnailUrl: input.thumbnailUrl,
        members: {
          create: { userId: user.id, role: "owner" },
        },
      },
    });
    if (input.classroomId) {
      await snapshotClassroomGroupsToBoard(
        tx,
        input.classroomId,
        createdBoard.id,
      );
    }
    return createdBoard;
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
