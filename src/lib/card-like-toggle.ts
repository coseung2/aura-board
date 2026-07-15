import type { Prisma } from "@prisma/client";

export type CardLikeActor =
  | { kind: "teacher"; id: string }
  | { kind: "student"; id: string }
  | { kind: "external"; id: string };

type CardLikeDelegate = {
  createMany(args: {
    data: Prisma.CardLikeUncheckedCreateInput;
    skipDuplicates: true;
  }): Promise<{ count: number }>;
  deleteMany(args: { where: Prisma.CardLikeWhereInput }): Promise<{ count: number }>;
};

export function getPrismaErrorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function cardLikeWhere(cardId: string, actor: CardLikeActor): Prisma.CardLikeWhereInput {
  if (actor.kind === "teacher") {
    return { cardId, likerUserId: actor.id };
  }
  if (actor.kind === "student") {
    return { cardId, likerStudentId: actor.id };
  }
  return { cardId, externalLikerKey: actor.id };
}

function cardLikeCreateData(
  cardId: string,
  actor: CardLikeActor,
): Prisma.CardLikeUncheckedCreateInput {
  if (actor.kind === "teacher") {
    return {
      cardId,
      likerKind: "teacher",
      likerUserId: actor.id,
      likerStudentId: null,
      externalLikerKey: null,
    };
  }
  if (actor.kind === "student") {
    return {
      cardId,
      likerKind: "student",
      likerUserId: null,
      likerStudentId: actor.id,
      externalLikerKey: null,
    };
  }
  return {
    cardId,
    likerKind: "external",
    likerUserId: null,
    likerStudentId: null,
    externalLikerKey: actor.id,
  };
}

async function ensureLiked(
  cardLike: CardLikeDelegate,
  cardId: string,
  actor: CardLikeActor,
): Promise<true> {
  // PostgreSQL translates skipDuplicates into ON CONFLICT DO NOTHING. That
  // keeps repeated/concurrent liked=true requests idempotent without first
  // raising a 23505 error that pollutes Supabase's Postgres error logs.
  await cardLike.createMany({
    data: cardLikeCreateData(cardId, actor),
    skipDuplicates: true,
  });
  return true;
}

/**
 * Applies a card-like mutation without throwing on same-user concurrent clicks.
 *
 * - desiredLiked=true/false is idempotent for new clients.
 * - desiredLiked=undefined preserves legacy "toggle" behavior, while duplicate
 *   concurrent creates collapse to "liked" at the database write boundary.
 */
export async function applyCardLikeMutation(
  cardLike: CardLikeDelegate,
  cardId: string,
  actor: CardLikeActor,
  desiredLiked: boolean | undefined,
): Promise<boolean> {
  const where = cardLikeWhere(cardId, actor);

  if (desiredLiked === false) {
    await cardLike.deleteMany({ where });
    return false;
  }

  if (desiredLiked === true) {
    return ensureLiked(cardLike, cardId, actor);
  }

  const removed = await cardLike.deleteMany({ where });
  if (removed.count > 0) {
    return false;
  }

  return ensureLiked(cardLike, cardId, actor);
}
