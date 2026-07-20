import "server-only";

import type { Prisma } from "@prisma/client";

import {
  isWalkingMonthlyCookieRewardOrdinal,
  WALKING_MONTHLY_COOKIE_ITEM_KEY,
  WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
  walkingMonthlyCookieRewardSourceRef,
} from "./reward-policy";

type WalkingAttendanceCookieRewardInput = {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  month: string;
  ordinal: number;
  attendedDay: string;
};

/** Grant one cookie for a monthly attendance milestone, once per ordinal. */
export async function awardWalkingAttendanceCookie(
  input: WalkingAttendanceCookieRewardInput,
): Promise<boolean> {
  if (!isWalkingMonthlyCookieRewardOrdinal(input.ordinal)) return false;

  const sourceRef = walkingMonthlyCookieRewardSourceRef(
    input.studentId,
    input.month,
    input.ordinal,
  );
  const existing = await input.tx.transaction.findFirst({
    where: {
      sourceType: WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
      sourceRef,
      type: "item_grant",
    },
    select: { id: true },
  });
  if (existing) return false;

  const account = await input.tx.studentAccount.findUnique({
    where: { id: input.accountId },
    select: { balance: true, studentId: true, classroomId: true },
  });
  if (
    !account ||
    account.studentId !== input.studentId ||
    account.classroomId !== input.classroomId
  ) {
    throw new Error("walking_cookie_reward_account_mismatch");
  }

  await input.tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "item_grant",
      amount: 0,
      balanceAfter: account.balance,
      note: `월간 걷기 출석 ${input.ordinal}일차 쿠키 보상 [${input.month}:${input.attendedDay}]`,
      sourceType: WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
      sourceRef,
      performedById: input.studentId,
      performedByKind: "system",
    },
  });
  await input.tx.studentCreatureItem.upsert({
    where: {
      studentId_itemKey: {
        studentId: input.studentId,
        itemKey: WALKING_MONTHLY_COOKIE_ITEM_KEY,
      },
    },
    create: {
      studentId: input.studentId,
      classroomId: input.classroomId,
      itemKey: WALKING_MONTHLY_COOKIE_ITEM_KEY,
      itemKind: "food",
      quantity: 1,
    },
    update: {
      itemKind: "food",
      quantity: { increment: 1 },
    },
  });
  return true;
}
