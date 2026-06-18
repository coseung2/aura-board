import "server-only";

import { db } from "@/lib/db";

type CardAuthorRefs = {
  authorId: string | null;
  studentAuthorId: string | null;
};

export async function resolveCardAuthorLabels(card: CardAuthorRefs): Promise<{
  authorName: string | null;
  studentAuthorName: string | null;
}> {
  const [author, studentAuthor] = await Promise.all([
    card.authorId
      ? db.user.findUnique({
          where: { id: card.authorId },
          select: { name: true },
        })
      : Promise.resolve(null),
    card.studentAuthorId
      ? db.student.findUnique({
          where: { id: card.studentAuthorId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    authorName: author?.name ?? null,
    studentAuthorName: studentAuthor?.name ?? null,
  };
}
