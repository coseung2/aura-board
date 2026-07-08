import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { generateCardNumber, generateCardSecret } from "./qr-token";

/**
 * Lazy-create a StudentAccount + StudentCard for a student on first access.
 * Idempotent under concurrent wallet/avatar requests.
 */
export async function ensureAccountFor(student: {
  id: string;
  classroomId: string;
}): Promise<{ accountId: string; cardId: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const account = await tx.studentAccount.upsert({
        where: { studentId: student.id },
        create: {
          studentId: student.id,
          classroomId: student.classroomId,
          balance: 0,
        },
        update: {},
        include: { cards: { take: 1 } },
      });
      if (account.cards[0]) {
        return { accountId: account.id, cardId: account.cards[0].id };
      }

      let cardNumber = generateCardNumber();
      // cardNumber is unique; retry on collision, which should be very rare.
      for (let i = 0; i < 5; i++) {
        const existingCard = await tx.studentCard.findUnique({
          where: { cardNumber },
        });
        if (!existingCard) break;
        cardNumber = generateCardNumber();
      }
      const card = await tx.studentCard.create({
        data: {
          accountId: account.id,
          cardNumber,
          qrSecret: generateCardSecret(),
        },
      });
      return { accountId: account.id, cardId: card.id };
    });
  } catch (error) {
    if (isUniqueRace(error)) {
      const existing = await db.studentAccount.findUnique({
        where: { studentId: student.id },
        include: { cards: { take: 1 } },
      });
      if (existing?.cards[0]) {
        return { accountId: existing.id, cardId: existing.cards[0].id };
      }
    }
    throw error;
  }
}

function isUniqueRace(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Lazy-ensure the classroom has a ClassroomCurrency row.
 */
export async function ensureClassroomCurrency(classroomId: string) {
  return db.classroomCurrency.upsert({
    where: { classroomId },
    create: { classroomId },
    update: {},
  });
}
