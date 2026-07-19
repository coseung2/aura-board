import "server-only";
import { Prisma } from "@prisma/client";
import { ensureAccountFor } from "@/lib/bank";
import { db } from "@/lib/db";
import { awardActivePetEvolutionXp, getStudentPetEffects } from "./service";

const WALKING_MILESTONES = [
  { steps: 3_000, baseAmount: 20 },
  { steps: 6_000, baseAmount: 40 },
  { steps: 10_000, baseAmount: 70 },
] as const;

type WalkingStudent = { id: string; classroomId: string };
type WalkingRow = { day: string; steps: number };

export type WalkingReward = {
  day: string;
  milestone: number;
  amount: number;
  newlyAwarded: boolean;
};

async function awardOneWalkingMilestone(input: {
  student: WalkingStudent;
  accountId: string;
  day: string;
  milestone: number;
  amount: number;
}): Promise<WalkingReward> {
  const sourceRef = `${input.student.id}:${input.day}:${input.milestone}`;
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { sourceType_sourceRef: { sourceType: "walking_milestone", sourceRef } },
        select: { amount: true },
      });
      if (existing) return { day: input.day, milestone: input.milestone, amount: existing.amount, newlyAwarded: false };
      const account = await tx.studentAccount.update({
        where: { id: input.accountId }, data: { balance: { increment: input.amount } }, select: { balance: true },
      });
      await tx.transaction.create({ data: {
        accountId: input.accountId,
        type: "deposit",
        amount: input.amount,
        balanceAfter: account.balance,
        note: `${input.day} ${input.milestone.toLocaleString()}걸음 보상`,
        sourceType: "walking_milestone",
        sourceRef,
        performedById: input.student.id,
        performedByKind: "owner",
      } });
      return { day: input.day, milestone: input.milestone, amount: input.amount, newlyAwarded: true };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await db.transaction.findUniqueOrThrow({
      where: { sourceType_sourceRef: { sourceType: "walking_milestone", sourceRef } }, select: { amount: true },
    });
    return { day: input.day, milestone: input.milestone, amount: existing.amount, newlyAwarded: false };
  }
}

export async function awardWalkingMilestones(student: WalkingStudent, rows: WalkingRow[]) {
  const { accountId } = await ensureAccountFor(student);
  const effects = await getStudentPetEffects(db, student.id);
  const rewards: WalkingReward[] = [];
  for (const row of rows) {
    for (const milestone of WALKING_MILESTONES) {
      if (row.steps < milestone.steps) continue;
      const amount = Math.round(milestone.baseAmount * (1 + effects.walkingRewardBps / 10_000));
      const reward = await awardOneWalkingMilestone({
        student, accountId, day: row.day, milestone: milestone.steps, amount,
      });
      rewards.push(reward);
      await awardActivePetEvolutionXp({
        studentId: student.id,
        sourceType: "walking_milestone",
        sourceRef: `${row.day}:${milestone.steps}`,
        baseXp: 5,
      });
    }
  }
  return rewards;
}
