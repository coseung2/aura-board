import { redirect } from "next/navigation";
import Image from "next/image";
import { Prisma } from "@prisma/client";
import { StudentTopNav } from "@/components/StudentTopNav";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import { StudentPetSectionHeader } from "@/components/creatures/StudentPetSectionHeader";
import { db } from "@/lib/db";
import { getSlimeDefinition, getSlimeShopItem } from "@/lib/pets/catalog";
import {
  sortClassroomSlimeStudents,
} from "@/lib/pets/classroom-gallery";
import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type WalkingAchievementRow = {
  studentId: string;
  maxDailySteps: number | bigint;
  maxWeeklySteps: number | bigint;
  maxMonthlySteps: number | bigint;
};

const WALKING_TITLES = [
  {
    key: "monthly-300k",
    label: "국토대장정",
    image: "/walking/titles/monthly-300k-pixel-512.png",
    earned: (row: WalkingAchievementRow) => Number(row.maxMonthlySteps) >= 300_000,
  },
  {
    key: "weekly-75k",
    label: "위대한 행진",
    image: "/walking/titles/weekly-75k-pixel-512.png",
    earned: (row: WalkingAchievementRow) => Number(row.maxWeeklySteps) >= 75_000,
  },
  {
    key: "weekly-50k",
    label: "꾸준한 발걸음",
    image: "/walking/titles/weekly-50k-pixel-512.png",
    earned: (row: WalkingAchievementRow) => Number(row.maxWeeklySteps) >= 50_000,
  },
  {
    key: "daily-20k",
    label: "오늘의 질주",
    image: "/walking/titles/daily-20k-pixel-512.png",
    earned: (row: WalkingAchievementRow) => Number(row.maxDailySteps) >= 20_000,
  },
] as const;

export default async function ClassroomSlimeGalleryPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/aura-pet/classroom");

  const [duties, rosterRows, achievementRows] = await Promise.all([
    getStudentDuties(student.id),
    db.student.findMany({
      where: { classroomId: student.classroomId },
      select: {
        id: true,
        number: true,
        name: true,
        slimes: {
          where: { isRepresentative: true },
          select: { color: true, growthStage: true, equippedItemKeys: true },
          take: 1,
        },
      },
    }),
    db.$queryRaw<WalkingAchievementRow[]>(Prisma.sql`
      WITH daily AS (
        SELECT "studentId", MAX("steps")::bigint AS "maxDailySteps"
        FROM "StudentWalkingDailyStat"
        GROUP BY "studentId"
      ), weekly AS (
        SELECT "studentId", MAX("weeklySteps")::bigint AS "maxWeeklySteps"
        FROM (
          SELECT
            "studentId",
            DATE_TRUNC('week', "day") AS "weekStart",
            SUM("steps")::bigint AS "weeklySteps"
          FROM "StudentWalkingDailyStat"
          GROUP BY "studentId", DATE_TRUNC('week', "day")
        ) totals
        GROUP BY "studentId"
      ), monthly AS (
        SELECT "studentId", MAX("monthlySteps")::bigint AS "maxMonthlySteps"
        FROM (
          SELECT
            "studentId",
            DATE_TRUNC('month', "day") AS "monthStart",
            SUM("steps")::bigint AS "monthlySteps"
          FROM "StudentWalkingDailyStat"
          GROUP BY "studentId", DATE_TRUNC('month', "day")
        ) totals
        GROUP BY "studentId"
      )
      SELECT
        student."id" AS "studentId",
        COALESCE(daily."maxDailySteps", 0)::bigint AS "maxDailySteps",
        COALESCE(weekly."maxWeeklySteps", 0)::bigint AS "maxWeeklySteps",
        COALESCE(monthly."maxMonthlySteps", 0)::bigint AS "maxMonthlySteps"
      FROM "Student" student
      LEFT JOIN daily ON daily."studentId" = student."id"
      LEFT JOIN weekly ON weekly."studentId" = student."id"
      LEFT JOIN monthly ON monthly."studentId" = student."id"
      WHERE student."classroomId" = ${student.classroomId}
    `),
  ]);
  const achievementsByStudent = new Map(
    achievementRows.map((row) => [row.studentId, row]),
  );
  const roster = sortClassroomSlimeStudents(
    rosterRows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      representative: row.slimes[0]
          ? {
              color: row.slimes[0].color as SlimeColor,
              growthStage: row.slimes[0].growthStage as 1 | 2 | 3,
              equippedItemKeys: row.slimes[0].equippedItemKeys,
            }
        : null,
    })),
  );

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
      />
      <main className={styles.page}>
        <StudentPetSectionHeader
          active="classroom"
          actions={<span className={styles.count}>{roster.length}명</span>}
        />

        <section className={styles.stage} aria-label="우리 반 대표 펫 전시">
          <div className={styles.backgroundLayer} data-sprite-slot="background" aria-hidden="true" />
          <div className={styles.floorLayer} data-sprite-slot="floor" aria-hidden="true" />
          <ol className={styles.roster}>
            {roster.map((row) => {
              const walking = achievementsByStudent.get(row.id);
              const title = walking
                ? WALKING_TITLES.find((candidate) => candidate.earned(walking))
                : undefined;
              const slime = row.representative
                ? getSlimeDefinition(row.representative.color)
                : null;
              const items = row.representative
                ? row.representative.equippedItemKeys
                    .map((key) => getSlimeShopItem(key))
                    .filter((item): item is SlimeShopItem => Boolean(item))
                : [];
              return (
                <li key={row.id} className={styles.student}>
                  <div className={styles.titleSlot}>
                    {title ? (
                      <div className={styles.walkingTitle} data-title={title.key}>
                        <Image
                          src={title.image}
                          alt={`${title.label} 칭호`}
                          fill
                          sizes="180px"
                          className={styles.walkingTitleFrame}
                        />
                      </div>
                    ) : (
                      <div className={styles.titlePlaceholder}>칭호 도전 중</div>
                    )}
                  </div>
                  <div className={styles.spriteSlot}>
                    {slime ? (
                      <SlimeCharacterSprite
                        slime={slime}
                        items={items}
                        growthStage={row.representative?.growthStage}
                      />
                    ) : (
                      <div className={styles.placeholder} aria-label="대표 슬라임 미지정" />
                    )}
                  </div>
                  <strong>{row.number !== null ? `${row.number}번 ${row.name}` : row.name}</strong>
                  <span>{slime?.nameKo ?? "대표 미지정"}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </>
  );
}
