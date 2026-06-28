import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authorizeCardAccess, getCurrentCardActor } from '@/lib/card-engagement-actor';
import { announcePollChange } from '@/lib/realtime-broadcast';
import { resolveCommentVoteOptionLabels } from '../../poll-shared';

// comment-area poll (2026-06-28): teacher sets option count (2..6) at publish;
// student casts a single vote in the card's comment panel.
//
//   GET  /api/cards/[id]/poll
//        -> { enabled, optionCount, counts, total, selectedOption, canVote }
//        all actors can read; parent gets canVote=false.
//   POST /api/cards/[id]/poll  body { optionIndex }
//        -> same shape. student-only; upserts the viewer's vote and broadcasts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PostSchema = z.object({
  optionIndex: z.number().int().min(0).max(20),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const access = await authorizeCardAccess(cardId, actor, 'read');
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'not_found' ? 404 : 403 },
    );
  }

  return NextResponse.json(await buildPollState(cardId, actor));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // student-only. parent/teacher -> 403.
  if (actor.kind !== 'student') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const access = await authorizeCardAccess(cardId, actor, 'read');
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === 'not_found' ? 404 : 403 },
    );
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, commentVoteOptionCount: true, boardId: true },
  });
  if (!card) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const optionCount = card.commentVoteOptionCount ?? 0;
  if (optionCount < 2) {
    return NextResponse.json({ error: 'poll_disabled' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_optionIndex' }, { status: 400 });
  }
  if (parsed.data.optionIndex >= optionCount) {
    return NextResponse.json({ error: 'optionIndex_out_of_range' }, { status: 400 });
  }

  // upsert: same student switching option -> update.
  await db.cardPollVote.upsert({
    where: {
      cardId_voterStudentId: {
        cardId,
        voterStudentId: actor.id,
      },
    },
    create: {
      cardId,
      voterStudentId: actor.id,
      optionIndex: parsed.data.optionIndex,
    },
    update: {
      optionIndex: parsed.data.optionIndex,
    },
  });

  // Broadcast before returning so open comment panels reliably refetch.
  await announcePollChange(card.boardId, cardId);

  return NextResponse.json(await buildPollState(cardId, actor));
}

async function buildPollState(
  cardId: string,
  actor:
    | { kind: 'teacher'; id: string; name: string }
    | { kind: 'student'; id: string; name: string; classroomId: string }
    | { kind: 'parent'; id: string },
) {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      commentVoteOptionCount: true,
      commentVoteOptionLabels: true,
      boardId: true,
    },
  });
  if (!card) {
    return {
      enabled: false,
      optionCount: 0,
      counts: [] as number[],
      labels: [] as string[],
      voters: [] as Array<Array<{ id: string; name: string }>>,
      total: 0,
      selectedOption: null as number | null,
      canVote: false,
    };
  }

  const optionCount = card.commentVoteOptionCount ?? 0;
  const enabled = optionCount >= 2;

  if (!enabled) {
    return {
      enabled: false,
      optionCount: 0,
      counts: [] as number[],
      labels: [] as string[],
      voters: [] as Array<Array<{ id: string; name: string }>>,
      total: 0,
      selectedOption: null,
      canVote: false,
    };
  }

  const labels = resolveCommentVoteOptionLabels(
    card.commentVoteOptionLabels,
    optionCount,
  );
  const votes = await db.cardPollVote.findMany({
    where: { cardId },
    include: {
      voter: { select: { id: true, name: true, number: true } },
    },
  });

  const counts: number[] = new Array(optionCount).fill(0);
  const voters: Array<Array<{ id: string; name: string }>> = Array.from(
    { length: optionCount },
    () => [],
  );
  for (const vote of votes) {
    if (vote.optionIndex >= 0 && vote.optionIndex < optionCount) {
      counts[vote.optionIndex]++;
      voters[vote.optionIndex].push({
        id: vote.voter.id,
        name: vote.voter.name,
      });
    }
  }
  for (const list of voters) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  const total = counts.reduce((acc, n) => acc + n, 0);

  let selectedOption: number | null = null;
  if (actor.kind === 'student') {
    const myVote = await db.cardPollVote.findUnique({
      where: {
        cardId_voterStudentId: {
          cardId,
          voterStudentId: actor.id,
        },
      },
      select: { optionIndex: true },
    });
    const optionIndex = myVote?.optionIndex;
    selectedOption =
      optionIndex !== undefined && optionIndex >= 0 && optionIndex < optionCount
        ? optionIndex
        : null;
  }

  return {
    enabled: true,
    optionCount,
    counts,
    labels,
    voters,
    total,
    selectedOption,
    canVote: actor.kind === 'student',
  };
}
