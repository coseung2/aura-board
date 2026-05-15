/**
 * Seed script — plant journal (PJ-1).
 *
 * Idempotent:
 *  - upserts 10 PlantSpecies by key
 *  - upserts their stages by (speciesId, order)
 *  - creates one "plant-roadmap" layout demo Board (b_plant)
 *  - allow-lists all 10 species to the demo classroom (if exists)
 *
 * Run: `npm run seed:plant` (see package.json addition)
 */
import { PrismaClient } from "@prisma/client";
import { PLANT_CATALOG } from "./plant-catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("🌿 Plant journal seed start");

  // Upsert species + stages
  for (const sp of PLANT_CATALOG) {
    const species = await prisma.plantSpecies.upsert({
      where: { key: sp.key },
      create: {
        key: sp.key,
        nameKo: sp.nameKo,
        emoji: sp.emoji,
        difficulty: sp.difficulty,
        season: sp.season,
        notes: sp.notes,
      },
      update: {
        nameKo: sp.nameKo,
        emoji: sp.emoji,
        difficulty: sp.difficulty,
        season: sp.season,
        notes: sp.notes,
      },
    });

    for (const st of sp.stages) {
      await prisma.plantStage.upsert({
        where: { speciesId_order: { speciesId: species.id, order: st.order } },
        create: {
          speciesId: species.id,
          order: st.order,
          key: st.key,
          nameKo: st.nameKo,
          icon: st.icon,
          description: st.description,
          observationPoints: JSON.stringify(st.observationPoints),
        },
        update: {
          key: st.key,
          nameKo: st.nameKo,
          icon: st.icon,
          description: st.description,
          observationPoints: JSON.stringify(st.observationPoints),
        },
      });
    }
  }

  // Ensure the base users/classroom/boards exist (re-use main seed if already run)
  const owner = await prisma.user.findUnique({ where: { id: "u_owner" } });
  if (!owner) {
    console.warn("⚠ u_owner not found — run `npm run seed` first for base data.");
    return;
  }

  // Demo classroom (if existing demo flow has a classroom, skip creation)
  const demoClassroom = await prisma.classroom.upsert({
    where: { code: "PLANT1" },
    create: {
      id: "c_plant_demo",
      name: "식물 관찰 시범반",
      code: "PLANT1",
      teacherId: owner.id,
    },
    update: { name: "식물 관찰 시범반", teacherId: owner.id },
  });

  // Demo students (3)
  const demoStudents = [
    { id: "s_plant_a", number: 1, name: "가온", textCode: "PLNT01", qrToken: "qr-plant-01" },
    { id: "s_plant_b", number: 2, name: "나리", textCode: "PLNT02", qrToken: "qr-plant-02" },
    { id: "s_plant_c", number: 3, name: "다온", textCode: "PLNT03", qrToken: "qr-plant-03" },
  ];
  for (const s of demoStudents) {
    await prisma.student.upsert({
      where: { id: s.id },
      create: { ...s, classroomId: demoClassroom.id },
      update: {},
    });
  }

  // Allow-list: all 10 species
  const allSpecies = await prisma.plantSpecies.findMany();
  for (const sp of allSpecies) {
    await prisma.classroomPlantAllow.upsert({
      where: {
        classroomId_speciesId: {
          classroomId: demoClassroom.id,
          speciesId: sp.id,
        },
      },
      create: { classroomId: demoClassroom.id, speciesId: sp.id },
      update: {},
    });
  }

  // Demo board (layout = "plant-roadmap")
  const board = await prisma.board.upsert({
    where: { id: "b_plant" },
    create: {
      id: "b_plant",
      slug: "plant-demo",
      title: "식물 관찰일지",
      layout: "plant-roadmap",
      description: "교사가 허용한 식물 중 하나를 선택해 단계별로 관찰을 기록해요.",
      classroomId: demoClassroom.id,
    },
    update: {
      slug: "plant-demo",
      title: "식물 관찰일지",
      layout: "plant-roadmap",
      classroomId: demoClassroom.id,
    },
  });

  // Board memberships (owner + editor + viewer) — reuse base users if seeded
  const memberRoles: Array<{ userId: string; role: string }> = [
    { userId: "u_owner", role: "owner" },
    { userId: "u_editor", role: "editor" },
    { userId: "u_viewer", role: "viewer" },
  ];
  for (const m of memberRoles) {
    const u = await prisma.user.findUnique({ where: { id: m.userId } });
    if (!u) continue;
    await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: board.id, userId: m.userId } },
      create: { boardId: board.id, userId: m.userId, role: m.role },
      update: { role: m.role },
    });
  }

  const totalStages = PLANT_CATALOG.reduce((a, s) => a + s.stages.length, 0);
  console.log(
    `✅ Plant journal seed — species=${PLANT_CATALOG.length}, stages=${totalStages}, classroom=${demoClassroom.code}, students=${demoStudents.length}, board=${board.slug}`
  );
}

main()
  .catch((e) => {
    console.error("❌ Plant seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
