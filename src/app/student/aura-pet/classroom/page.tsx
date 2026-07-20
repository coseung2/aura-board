import { redirect } from "next/navigation";
import { StudentTopNav } from "@/components/StudentTopNav";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import { StudentPetSectionHeader } from "@/components/creatures/StudentPetSectionHeader";
import { db } from "@/lib/db";
import { getSlimeDefinition, getSlimeShopItem } from "@/lib/pets/catalog";
import {
  sortClassroomSlimeStudents,
  type ClassroomSlimeStudent,
} from "@/lib/pets/classroom-gallery";
import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";
import type { SlimeColor, SlimeShopItem } from "@/lib/pets/types";
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
          select: { color: true, equippedItemKeys: true },
          take: 1,
        },
      },
    }),
  ]);
  const roster = sortClassroomSlimeStudents<ClassroomSlimeStudent>(
    rosterRows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      representative: row.slimes[0]
        ? {
            color: row.slimes[0].color as SlimeColor,
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
                  <div className={styles.spriteSlot}>
                    {slime ? (
                      <SlimeCharacterSprite slime={slime} items={items} />
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
