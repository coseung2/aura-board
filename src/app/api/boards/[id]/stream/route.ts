import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import type { SectionBreakoutConfigWire, SectionBreakoutGroupWire } from "@/lib/section-breakout";
import {
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";

export const maxDuration = 60;

const POLL_INTERVAL_MS = 10_000;
const KEEPALIVE_INTERVAL_MS = 25_000;
const PERMISSION_RECHECK_INTERVAL_MS = 60_000;
const STREAM_TTL_MS = 55_000;

// Wire shape mirrors what `/api/boards/:id` and `board/[id]/page.tsx` already
// hand to ColumnsBoard, so the client can drop snapshots straight into state.
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
  authorId: string | null;
  studentAuthorId: string | null;
  externalAuthorName: string | null;
  studentAuthorName: string | null;
  authorName: string | null;
  queueStatus: string | null;
  // stream-board section breakout (2026-06-23): optional group tag. null
  // for whole-section cards. Server always emits the field so the
  // front-end can branch on `card.groupId !== null` without guarding
  // for `undefined`.
  groupId: string | null;
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
  sortMode: string | null;
  activityTemplate: string | null;
  activityTemplateState: StreamActivityTemplateState;
  // stream-board section breakout (2026-06-23): the section's breakout
  // config + group roster snapshot. null when the section is not in
  // breakout mode. The full membership list is intentionally omitted
  // from the public SSE — the caller can fetch it via
  // GET /api/sections/[id]/breakout. group member counts are included
  // so the front-end can show a roster badge per group.
  breakout: {
    groupCount: number;
    groupCapacity: number | null;
    joinMode: string;
    groups: SectionBreakoutGroupWire[];
  } | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boardIdOrSlug } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return new Response("Unauthorized", { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, layout: true },
  });
  if (!board) {
    return new Response("Not found", { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (!role) {
    return new Response("Forbidden", { status: 403 });
  }

  const boardId = board.id;
  const boardLayout = board.layout;
  const userId = user?.id ?? null;
  const studentId = student?.id ?? null;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let lastCardsHash = "";
      let lastSectionsHash = "";
      let lastQuestionHash = "";
      let lastPermissionCheck = Date.now();
      let lastKeepalive = Date.now();

      function finish() {
        if (cancelled) return;
        cancelled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          controller.close();
        } catch {}
      }

      function send(event: string, data: unknown) {
        if (cancelled) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cancelled = true;
        }
      }

      function sendComment(comment: string) {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`));
        } catch {
          cancelled = true;
        }
      }

      async function poll() {
        if (cancelled) return;
        try {
          const now = Date.now();

          if (now - lastPermissionCheck >= PERMISSION_RECHECK_INTERVAL_MS) {
            const r = await getEffectiveBoardRole(boardId, {
              userId,
              studentId,
            });
            if (!r) {
              send("forbidden", { reason: "permission_revoked" });
              finish();
              return;
            }
            lastPermissionCheck = now;
          }

          if (now - startedAt >= STREAM_TTL_MS) {
            send("end", { reason: "ttl", retryAfterMs: 15_000 });
            finish();
            return;
          }

          const [cardsRaw, sectionsRaw, configRows, groupRows] = await Promise.all([
            db.card.findMany({
              where: { boardId },
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
            db.section.findMany({
              where: { boardId },
              orderBy: { order: "asc" },
            }),
            // stream-board section breakout (2026-06-23): for every section
            // on the board, pull the breakout config (1:1) and the group
            // rows + member counts. Sections without breakout config get
            // `null` in the snapshot.
            db.sectionBreakoutConfig.findMany({
              where: { section: { boardId } },
            }),
            db.sectionBreakoutGroup.findMany({
              where: { section: { boardId } },
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
          ]);

          // Index the section-level breakout data by sectionId so the
          // SectionWire build is O(1) per section.
          const configBySection = new Map<string, typeof configRows[number]>();
          for (const c of configRows) configBySection.set(c.sectionId, c);
          const groupsBySection = new Map<string, typeof groupRows[number][]>();
          for (const g of groupRows) {
            const list = groupsBySection.get(g.sectionId) ?? [];
            list.push(g);
            groupsBySection.set(g.sectionId, list);
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
            authorId: c.authorId,
            studentAuthorId: c.studentAuthorId,
            externalAuthorName: c.externalAuthorName,
            studentAuthorName: c.studentAuthor?.name ?? null,
            authorName: c.author?.name ?? null,
            queueStatus: c.queueStatus,
            groupId: c.groupId ?? null,
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

          const sections: SectionWire[] = sectionsRaw.map((s) => ({
            id: s.id,
            title: s.title,
            order: s.order,
            sortMode: s.sortMode,
            activityTemplate: s.activityTemplate,
            activityTemplateState: normalizeStreamActivityTemplateState(
              s.activityTemplateState,
            ),
            // stream-board section breakout (2026-06-23): the section-level
            // breakout summary. `null` when the section is not in breakout
            // mode — keeps the wire shape additive (no new field on the
            // Section row, just an optional nested key).
            breakout: buildSectionBreakoutSnapshot(
              s.id,
              configBySection,
              groupsBySection,
            ),
          }));

          const cardsHash = hashStable(cards);
          const sectionsHash = hashStable(sections);

          if (cardsHash !== lastCardsHash || sectionsHash !== lastSectionsHash) {
            lastCardsHash = cardsHash;
            lastSectionsHash = sectionsHash;
            send("snapshot", { cards, sections });
          }

          // Question board 전용 snapshot: prompt/vizMode + 응답 200개.
          // 기존 cards/sections snapshot 과 독립적으로 전송해 hash 충돌 방지.
          if (boardLayout === "question-board") {
            const [boardMeta, responsesRaw] = await Promise.all([
              db.board.findUnique({
                where: { id: boardId },
                select: { questionPrompt: true, questionVizMode: true },
              }),
              db.boardResponse.findMany({
                where: { boardId },
                orderBy: { createdAt: "desc" },
                take: 200,
                include: {
                  student: { select: { id: true, name: true } },
                  user: { select: { id: true, name: true } },
                },
              }),
            ]);
            if (boardMeta) {
              const payload = {
                prompt: boardMeta.questionPrompt,
                vizMode: boardMeta.questionVizMode,
                responses: responsesRaw.map((r) => ({
                  id: r.id,
                  text: r.text,
                  createdAt: r.createdAt.toISOString(),
                  studentId: r.studentId,
                  userId: r.userId,
                  authorName: r.student?.name ?? r.user?.name ?? "익명",
                })),
              };
              const questionHash = hashStable(payload);
              if (questionHash !== lastQuestionHash) {
                lastQuestionHash = questionHash;
                send("question_snapshot", payload);
              }
            }
          }

          if (now - lastKeepalive >= KEEPALIVE_INTERVAL_MS) {
            sendComment("ping");
            lastKeepalive = now;
          }
        } catch (e) {
          console.error("[SSE board poll]", e);
          send("error", { reason: "poll_failed", retryAfterMs: 30_000 });
          finish();
          return;
        }

        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }

      poll();
    },
    cancel() {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function hashStable(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

// stream-board section breakout (2026-06-23): build a per-section breakout
// summary for the SSE snapshot. Returns null when the section has no
// breakout config so the wire is additive (no breakout on a section → no
// extra keys for the front-end to guard).
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
): {
  groupCount: number;
  groupCapacity: number | null;
  joinMode: string;
  groups: SectionBreakoutGroupWire[];
} | null {
  const cfg = configBySection.get(sectionId);
  if (!cfg) return null;
  const groups = (groupsBySection.get(sectionId) ?? []).map((g) => ({
    id: g.id,
    sectionId: g.sectionId,
    name: g.name,
    order: g.order,
    memberCount: g._count.members,
    members: g.members.map((member) => ({
      id: member.id,
      studentId: member.studentId,
      studentName: member.student.name,
      studentNumber: member.student.number,
    })),
  }));
  return {
    groupCount: cfg.groupCount,
    groupCapacity: cfg.groupCapacity,
    joinMode: cfg.joinMode,
    groups,
  };
}
