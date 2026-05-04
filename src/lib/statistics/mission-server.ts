import type { Prisma } from "@prisma/client";
import { STATISTICS_MISSION_COUNT } from "./mission-constants";

type MissionTx = Prisma.TransactionClient;

export async function ensureStatisticsMissions(
  tx: MissionTx,
  sectionId: string
) {
  const missions = await tx.mission.findMany({
    where: { sectionId },
    orderBy: { stepNumber: "asc" },
  });

  if (missions.length === 0) {
    await Promise.all(
      Array.from({ length: STATISTICS_MISSION_COUNT }, (_, index) =>
        tx.mission.create({
          data: {
            sectionId,
            stepNumber: index + 1,
            status: "not_started",
            content: {},
            version: 0,
          },
        })
      )
    );
    return;
  }

  const stepSet = new Set(missions.map((mission) => mission.stepNumber));
  const stepThree = missions.find((mission) => mission.stepNumber === 3);
  const stepThreeContent =
    stepThree?.content &&
    typeof stepThree.content === "object" &&
    !Array.isArray(stepThree.content)
      ? (stepThree.content as Record<string, unknown>)
      : {};
  const stepThreeIsClassification = Boolean(
    stepThreeContent.questionClassification
  );
  const needsInsertedClassification =
    stepSet.has(3) &&
    !stepSet.has(STATISTICS_MISSION_COUNT) &&
    missions.some((mission) => mission.stepNumber > 3) &&
    !stepThreeIsClassification;

  if (needsInsertedClassification) {
    for (let step = STATISTICS_MISSION_COUNT - 1; step >= 3; step -= 1) {
      await tx.mission.updateMany({
        where: { sectionId, stepNumber: step },
        data: { stepNumber: step + 1 },
      });
    }
    await tx.mission.create({
      data: {
        sectionId,
        stepNumber: 3,
        status: "not_started",
        content: {},
        version: 0,
      },
    });
    return;
  }

  await Promise.all(
    Array.from({ length: STATISTICS_MISSION_COUNT }, async (_, index) => {
      const stepNumber = index + 1;
      if (stepSet.has(stepNumber)) return null;
      return tx.mission.create({
        data: {
          sectionId,
          stepNumber,
          status: "not_started",
          content: {},
          version: 0,
        },
      });
    })
  );
}
