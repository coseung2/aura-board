import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { generateCardNumber, generateCardSecret } from "./qr-token";

/**
 * Resolve the wallet account needed by server-owned rewards without creating a
 * bank card. The database upsert is the concurrency gate for first use.
 */
export async function ensureAccountOnlyFor(student: {
  id: string;
  classroomId: string;
}): Promise<{ accountId: string }> {
  const account = await db.studentAccount.upsert({
    where: { studentId: student.id },
    create: {
      studentId: student.id,
      classroomId: student.classroomId,
      balance: 0,
    },
    update: {},
    select: { id: true, classroomId: true },
  });
  if (account.classroomId !== student.classroomId) {
    throw new Error("Student account classroom mismatch");
  }
  return { accountId: account.id };
}

/**
 * Lazy-create a StudentAccount + StudentCard for a student on first access.
 * Idempotent under concurrent wallet/avatar requests.
 */
export async function ensureAccountFor(student: {
  id: string;
  classroomId: string;
}): Promise<{ accountId: string; cardId: string }> {
  // The common classroom path already has a provisioned account/card. Avoid
  // opening an interactive upsert transaction for every comment or wallet read.
  const existingAccount = await db.studentAccount.findUnique({
    where: { studentId: student.id },
    select: {
      id: true,
      cards: { take: 1, select: { id: true } },
    },
  });
  if (existingAccount?.cards[0]) {
    return {
      accountId: existingAccount.id,
      cardId: existingAccount.cards[0].id,
    };
  }

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
