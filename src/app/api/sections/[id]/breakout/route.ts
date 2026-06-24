// GET  /api/sections/[id]/breakout
// POST   /api/sections/[id]/breakout  (teacher owner/editor)
// DELETE /api/sections/[id]/breakout  (teacher owner/editor)
//
// Reads/upserts a single section's breakout config + groups + the caller's
// membership. The response shape is shared by both verbs and by the
// membership endpoint so the client can drop it into state straight away.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole, requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import {
  DEFAULT_GROUP_CAPACITY,
  MAX_GROUP_CAPACITY,
  MAX_GROUP_COUNT,
  MIN_GROUP_CAPACITY,
  MIN_GROUP_COUNT,
  SECTION_BREAKOUT_JOIN_MODES,
  defaultGroupName,
  type SectionBreakoutConfigWire,
  type SectionBreakoutGroupWire,
  type SectionBreakoutMembershipWire,
} from "@/lib/section-breakout";

export type SectionBreakoutSnapshot = {
  config: SectionBreakoutConfigWire | null;
  groups: SectionBreakoutGroupWire[];
  membership: SectionBreakoutMembershipWire | null;
  canManage: boolean;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);
    if (!user && !student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { id: true, boardId: true },
    });
    if (!section) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const role = await getEffectiveBoardRole(section.boardId, {
      userId: user?.id,
      studentId: student?.id,
    });
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const snapshot = await loadSnapshot(sectionId, {
      callerRole: role,
      studentId: user ? null : (student?.id ?? null),
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[GET section breakout]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

const PostBody = z.object({
  groupCount: z.number().int().min(MIN_GROUP_COUNT).max(MAX_GROUP_COUNT),
  groupCapacity: z
    .number()
    .int()
    .min(MIN_GROUP_CAPACITY)
    .max(MAX_GROUP_CAPACITY)
    .nullable()
    .optional(),
  joinMode: z.enum(SECTION_BREAKOUT_JOIN_MODES).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const user = await getCurrentUser();

    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { id: true, boardId: true },
    });
    if (!section) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Teacher path only. requirePermission(..., "edit") enforces owner or
    // editor on the board — matches the existing breakout assignment flow.
    try {
      await requirePermission(section.boardId, user.id, "edit");
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
      throw e;
    }

    const body = await req.json().catch(() => ({}));
    const input = PostBody.parse(body);

    const groupCapacity = input.groupCapacity ?? DEFAULT_GROUP_CAPACITY;
    const joinMode = input.joinMode ?? "student_select";

    // Upsert config + reconcile group rows. One transaction so a partial
    // sync can't leave the section with config but no groups (or vice
    // versa).
    await db.$transaction(async (tx) => {
      await tx.sectionBreakoutConfig.upsert({
        where: { sectionId },
        create: {
          sectionId,
          groupCount: input.groupCount,
          groupCapacity,
          joinMode,
        },
        update: {
          groupCount: input.groupCount,
          groupCapacity,
          joinMode,
        },
      });

      await reconcileGroups(tx, sectionId, input.groupCount);
    });

    await touchBoardUpdatedAt(section.boardId);

    const snapshot = await loadSnapshot(sectionId, {
      callerRole: "owner",
      studentId: null,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST section breakout]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const user = await getCurrentUser();

    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { id: true, boardId: true },
    });
    if (!section) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await requirePermission(section.boardId, user.id, "edit");
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
      throw e;
    }

    await db.$transaction([
      db.sectionBreakoutMembership.deleteMany({ where: { sectionId } }),
      db.sectionBreakoutGroup.deleteMany({ where: { sectionId } }),
      db.sectionBreakoutConfig.deleteMany({ where: { sectionId } }),
    ]);

    await touchBoardUpdatedAt(section.boardId);

    const snapshot = await loadSnapshot(sectionId, {
      callerRole: "owner",
      studentId: null,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[DELETE section breakout]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// Reconcile SectionBreakoutGroup rows to match the requested groupCount.
//   - Grow: create rows for new orders.
//   - Shrink: delete the high-order rows; FK cascades (Card.groupId SetNull,
//     SectionBreakoutMembership cascade) keep things consistent.
//   - Existing rows: rename to match defaultGroupName (keeps names canonical
//     if a teacher resaves the config with the same groupCount).
async function reconcileGroups(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  sectionId: string,
  groupCount: number,
): Promise<void> {
  const existing = await tx.sectionBreakoutGroup.findMany({
    where: { sectionId },
    orderBy: { order: "asc" },
  });

  for (const g of existing) {
    const expected = defaultGroupName(g.order);
    if (g.name !== expected) {
      await tx.sectionBreakoutGroup.update({
        where: { id: g.id },
        data: { name: expected },
      });
    }
  }

  if (existing.length < groupCount) {
    for (let order = existing.length; order < groupCount; order++) {
      await tx.sectionBreakoutGroup.create({
        data: {
          sectionId,
          name: defaultGroupName(order),
          order,
        },
      });
    }
  } else if (existing.length > groupCount) {
    const toDelete = existing.slice(groupCount);
    await tx.sectionBreakoutGroup.deleteMany({
      where: { id: { in: toDelete.map((g) => g.id) } },
    });
  }
}

// loadSnapshot: read-only fetch of the wire shape. Shared by GET, POST, and
// the membership endpoint. callerRole is used only to set canManage.
export async function loadSnapshot(
  sectionId: string,
  opts: { callerRole: string; studentId: string | null },
): Promise<SectionBreakoutSnapshot> {
  const [config, groups, membership] = await Promise.all([
    db.sectionBreakoutConfig.findUnique({ where: { sectionId } }),
    db.sectionBreakoutGroup.findMany({
      where: { sectionId },
      orderBy: { order: "asc" },
      include: { _count: { select: { members: true } } },
    }),
    opts.studentId
      ? db.sectionBreakoutMembership.findUnique({
          where: { sectionId_studentId: { sectionId, studentId: opts.studentId } },
          include: { group: { select: { name: true, order: true } } },
        })
      : Promise.resolve(null),
  ]);

  const groupsWire: SectionBreakoutGroupWire[] = groups.map((g) => ({
    id: g.id,
    sectionId: g.sectionId,
    name: g.name,
    order: g.order,
    memberCount: g._count.members,
  }));

  const configWire: SectionBreakoutConfigWire | null = config
    ? {
        groupCount: config.groupCount,
        groupCapacity: config.groupCapacity,
        joinMode: (SECTION_BREAKOUT_JOIN_MODES as readonly string[]).includes(
          config.joinMode,
        )
          ? (config.joinMode as SectionBreakoutConfigWire["joinMode"])
          : "student_select",
      }
    : null;

  const membershipWire: SectionBreakoutMembershipWire | null = membership
    ? {
        id: membership.id,
        groupId: membership.groupId,
        groupName: membership.group.name,
        groupOrder: membership.group.order,
        joinedAt: membership.joinedAt.toISOString(),
      }
    : null;

  return {
    config: configWire,
    groups: groupsWire,
    membership: membershipWire,
    canManage:
      !opts.studentId &&
      (opts.callerRole === "owner" || opts.callerRole === "editor"),
  };
}
