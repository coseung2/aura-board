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

type ClassroomPayoutInput = {
  classroomId: string;
  requestKey: string;
  performedById: string;
};

type ClassroomPayoutResult = {
  paidRoles: number;
  paidStudents: number;
  totalAmount: number;
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

/**
 * Pays every payable role in the classroom inside one transaction.
 *
 * 급여 지급은 학급 단위 동작이라 대시보드 지급 버튼은 역할별로 호출하지 않는다.
 * 역할마다 요청을 보내면 왕복이 역할 수만큼 늘고, 중간에 실패하면 일부만
 * 지급된 상태로 남는다. 하나의 트랜잭션으로 묶어 전부 지급되거나 전부 취소된다.
 *
 * 급여가 0이거나 담당 학생이 없는 역할은 조용히 건너뛴다. 지급할 역할이 하나도
 * 없으면 `no_assignees` 로 알린다.
 */
export async function payClassroomRoleSalaries(
  input: ClassroomPayoutInput,
): Promise<ClassroomPayoutResult> {
  const batchRef = batchSourceRef(input.classroomId, input.requestKey);

  try {
    return await db.$transaction(async (tx) => {
      const priorPayout = await tx.transaction.findFirst({
        where: { sourceType: SALARY_SOURCE_TYPE, sourceRef: batchRef },
        select: { id: true },
      });
      if (priorPayout) throw new RoleSalaryPayoutError("already_applied");

      const settings = await tx.classroomRoleSetting.findMany({
        where: {
          classroomId: input.classroomId,
          enabled: true,
          salaryAmount: { gt: 0 },
        },
        select: {
          salaryAmount: true,
          classroomRoleId: true,
          classroomRole: { select: { labelKo: true } },
        },
        orderBy: { classroomRoleId: "asc" },
      });
      if (settings.length === 0) throw new RoleSalaryPayoutError("no_assignees");

      const assignments = await tx.classroomRoleAssignment.findMany({
        where: {
          classroomId: input.classroomId,
          classroomRoleId: { in: settings.map((setting) => setting.classroomRoleId) },
        },
        select: {
          studentId: true,
          classroomRoleId: true,
          student: { select: { id: true, classroomId: true } },
        },
        orderBy: [{ classroomRoleId: "asc" }, { studentId: "asc" }],
      });
      if (assignments.length === 0) throw new RoleSalaryPayoutError("no_assignees");

      const amountByRole = new Map(
        settings.map((setting) => [setting.classroomRoleId, setting]),
      );

      let paidStudents = 0;
      let totalAmount = 0;
      const paidRoles = new Set<string>();

      for (const [index, assignment] of assignments.entries()) {
        const setting = amountByRole.get(assignment.classroomRoleId);
        if (!setting) continue;

        const account = await ensureAccountInTransaction(tx, assignment.student);
        const updated = await tx.studentAccount.update({
          where: { id: account.id },
          data: { balance: { increment: setting.salaryAmount } },
          select: { id: true, balance: true },
        });
        await tx.transaction.create({
          data: {
            accountId: updated.id,
            type: "deposit",
            amount: setting.salaryAmount,
            balanceAfter: updated.balance,
            note: `${setting.classroomRole.labelKo} 급여`,
            sourceType: SALARY_SOURCE_TYPE,
            // 첫 행이 배치 게이트를 잡고, 나머지는 파생 키를 쓴다.
            sourceRef:
              index === 0
                ? batchRef
                : `${batchRef}:${assignment.classroomRoleId}:${assignment.studentId}`,
            performedById: input.performedById,
            performedByKind: "teacher",
          },
        });

        paidStudents += 1;
        totalAmount += setting.salaryAmount;
        paidRoles.add(assignment.classroomRoleId);
      }

      return { paidRoles: paidRoles.size, paidStudents, totalAmount };
    });
  } catch (error) {
    if (error instanceof RoleSalaryPayoutError) throw error;
    if (isUniqueViolation(error)) {
      const applied = await db.transaction.findFirst({
        where: { sourceType: SALARY_SOURCE_TYPE, sourceRef: batchRef },
        select: { id: true },
      });
      if (applied) throw new RoleSalaryPayoutError("already_applied");
    }
    throw error;
  }
}
