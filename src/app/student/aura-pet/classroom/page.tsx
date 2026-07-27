import { redirect } from "next/navigation";
import Image from "next/image";
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
import { getTitleDefinition } from "@/lib/title-catalog";
import type { SlimeColor, SlimeFloor, SlimeShopItem } from "@/lib/pets/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ClassroomSlimeGalleryPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/aura-pet/classroom");

  const [duties, rosterRows] = await Promise.all([
    getStudentDuties(student.id),
    db.student.findMany({
      where: { classroomId: student.classroomId },
      select: {
        id: true,
        number: true,
        name: true,
        slimes: {
          where: { isRepresentative: true },
          select: {
            color: true,
            growthStage: true,
            equippedItemKeys: true,
            equippedTitleKey: true,
          },
          take: 1,
        },
      },
    }),
  ]);
  const roster = sortClassroomSlimeStudents(
    rosterRows.map((row) => {
      const representative = row.slimes[0];
      const equippedTitle = representative?.equippedTitleKey
        ? getTitleDefinition(representative.equippedTitleKey)
        : null;
      return {
        id: row.id,
        number: row.number,
        name: row.name,
        walkingTitle:
          representative && equippedTitle
            ? {
                key: equippedTitle.key,
                label: equippedTitle.label,
                imagePath: equippedTitle.imagePath,
              }
            : null,
        representative: representative
          ? {
              color: representative.color as SlimeColor,
              growthStage: representative.growthStage as 1 | 2 | 3,
              equippedItemKeys: representative.equippedItemKeys,
              equippedTitleKey: representative.equippedTitleKey ?? null,
            }
          : null,
      };
    }),
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
              const title = row.walkingTitle;
              const slime = row.representative
                ? getSlimeDefinition(row.representative.color)
                : null;
              const items = row.representative
                ? row.representative.equippedItemKeys
                    .map((key) => getSlimeShopItem(key))
                    .filter((item): item is SlimeShopItem => Boolean(item))
                : [];
              const equippedFloor = items.reduce<SlimeFloor>(
                (floor, item) => item.floor ?? floor,
                "none",
              );
              const hasPassiveDrink = items.some((item) => item.category === "drink");
              const action =
                equippedFloor === "water-puddle" || equippedFloor === "trampoline"
                  ? "floor-interaction"
                  : hasPassiveDrink
                    ? "drink"
                    : "idle";
              return (
                <li key={row.id} className={styles.student}>
                  <div className={styles.spriteSlot}>
                    {slime ? (
                      <SlimeCharacterSprite
                        slime={slime}
                        items={items}
                        className={styles.classroomSprite}
                        growthStage={row.representative?.growthStage}
                        action={action}
                        repeat={hasPassiveDrink}
                        equippedFloor={equippedFloor}
                      />
                    ) : (
                      <div className={styles.placeholder} aria-label="대표 슬라임 미지정" />
                    )}
                  </div>
                  <div className={styles.titleSlot}>
                    {title ? (
                      <div className={styles.walkingTitle} data-title={title.key}>
                        <Image
                          src={title.imagePath}
                          alt={`${title.label} 칭호`}
                          fill
                          sizes="180px"
                          className={styles.walkingTitleFrame}
                        />
                      </div>
                    ) : null}
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
