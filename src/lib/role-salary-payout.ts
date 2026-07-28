import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateCardNumber, generateCardSecret } from "@/lib/qr-token";

const SALARY_SOURCE_TYPE = "classroom_role_salary";

export type RoleSalaryPayoutErrorCode =
  | "unknown_role"
  | "role_disabled"
  | "invalid_salary"
  | "no_assignees"
  | "already_applied";

export class RoleSalaryPayoutError extends Error {
  constructor(readonly code: RoleSalaryPayoutErrorCode) {
    super(code);
    this.name = "RoleSalaryPayoutError";
  }
}

type PayoutInput = {
  classroomId: string;
  roleKey: string;
  requestKey: string;
  performedById: string;
};

type PayoutResult = {
  roleKey: string;
  paidStudents: number;
  amount: number;
};

function batchSourceRef(classroomId: string, requestKey: string): string {
  return `${classroomId}:${requestKey}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  ) || (typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
}

async function ensureAccountInTransaction(
  tx: Prisma.TransactionClient,
  student: { id: string; classroomId: string },
): Promise<{ id: string }> {
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

  if (!account.cards[0]) {
    let cardNumber = generateCardNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const collision = await tx.studentCard.findUnique({ where: { cardNumber } });
      if (!collision) break;
      cardNumber = generateCardNumber();
    }
    await tx.studentCard.create({
      data: {
        accountId: account.id,
        cardNumber,
        qrSecret: generateCardSecret(),
      },
    });
  }

  return { id: account.id };
}

export async function payRoleSalaryBatch(input: PayoutInput): Promise<PayoutResult> {
  const batchRef = batchSourceRef(input.classroomId, input.requestKey);

  try {
    return await db.$transaction(async (tx) => {
      const role = await tx.classroomRoleDef.findUnique({
        where: { key: input.roleKey },
        select: { id: true, labelKo: true },
      });
      if (!role) throw new RoleSalaryPayoutError("unknown_role");

      const priorPayout = await tx.transaction.findFirst({
        where: {
          sourceType: SALARY_SOURCE_TYPE,
          sourceRef: batchRef,
        },
        select: { id: true },
      });
      if (priorPayout) throw new RoleSalaryPayoutError("already_applied");

      const setting = await tx.classroomRoleSetting.findUnique({
        where: {
          classroomId_classroomRoleId: {
            classroomId: input.classroomId,
            classroomRoleId: role.id,
          },
        },
        select: { enabled: true, salaryAmount: true },
      });
      if (!setting?.enabled) throw new RoleSalaryPayoutError("role_disabled");
      if (setting.salaryAmount <= 0) throw new RoleSalaryPayoutError("invalid_salary");

      const assignments = await tx.classroomRoleAssignment.findMany({
        where: { classroomId: input.classroomId, classroomRoleId: role.id },
        select: {
          studentId: true,
          student: { select: { id: true, classroomId: true } },
        },
        orderBy: { studentId: "asc" },
      });
      if (assignments.length === 0) throw new RoleSalaryPayoutError("no_assignees");

      const amount = setting.salaryAmount;
      const note = `${role.labelKo} 급여`;

      for (const [index, assignment] of assignments.entries()) {
        const account = await ensureAccountInTransaction(tx, assignment.student);
        const updated = await tx.studentAccount.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
          select: { id: true, balance: true },
        });
        await tx.transaction.create({
          data: {
            accountId: updated.id,
            type: "deposit",
            amount,
            balanceAfter: updated.balance,
            note,
            sourceType: SALARY_SOURCE_TYPE,
            sourceRef: index === 0 ? batchRef : `${batchRef}:${assignment.studentId}`,
            performedById: input.performedById,
            performedByKind: "teacher",
          },
        });
      }

      return {
        roleKey: input.roleKey,
        paidStudents: assignments.length,
        amount,
      };
    });
  } catch (error) {
    if (error instanceof RoleSalaryPayoutError) throw error;
    if (isUniqueViolation(error)) {
      const applied = await db.transaction.findFirst({
        where: {
          sourceType: SALARY_SOURCE_TYPE,
          sourceRef: batchRef,
        },
        select: { id: true },
      });
      if (applied) throw new RoleSalaryPayoutError("already_applied");
    }
    throw error;
  }
}
