const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

const prisma = new PrismaClient();

// Paperdoll v2 layer keys + z values. The runtime compositor must only
// stack baked full-frame sheets in ascending z order; runtime x/y
// offsets are forbidden. Build-time anchors/masks stay private to the
// asset pipeline.
const PAPERDOLL_LAYER_Z = {
  hair_front: 75,
  top_front: 65,
  accessory_face: 70,
  bottom_front: 50,
  shoes: 45,
};

const SLOT_TO_RENDER_LAYER = {
  hair: "hair_front",
  top: "top_front",
  bottom: "bottom_front",
  shoes: "shoes",
  accessory: "accessory_face",
};

function equipmentMetadata(layer, spriteUrl) {
  return {
    spriteUrl,
    sprite: {
      frameWidth: 222,
      frameHeight: 444,
      columns: 8,
      rows: 2,
      layer,
    },
    spriteVersion: "paperdoll-v1",
    templateKey: "aura-body-v1",
    slot: layer,
    frameWidth: 222,
    frameHeight: 444,
    columns: 8,
    rows: 2,
    renderLayers: [
      {
        key: SLOT_TO_RENDER_LAYER[layer],
        z: PAPERDOLL_LAYER_Z[SLOT_TO_RENDER_LAYER[layer]],
        spriteUrl,
      },
    ],
  };
}

async function main() {
  const student = await prisma.student.findFirst({
    where: { name: "김병찬" },
    select: { id: true, name: true, number: true, classroomId: true },
    orderBy: [{ number: "asc" }],
  });
  if (!student) throw new Error("김병찬 학생을 찾지 못했습니다.");

  const item = await prisma.avatarItem.upsert({
    where: {
      classroomId_key: {
        classroomId: student.classroomId,
        key: "accessory-sunglasses-basic",
      },
    },
    create: {
      classroomId: student.classroomId,
      key: "accessory-sunglasses-basic",
      name: "픽셀 선글라스",
      description: "기본 스프라이트 위에 얹히는 검정 선글라스.",
      category: "accessory",
      slot: "accessory",
      rarity: "common",
      price: 0,
      imageUrl: "/avatar/parts/sunglasses-basic.png",
      thumbnailUrl: "/avatar/thumbnails/sunglasses-basic.png",
      metadata: equipmentMetadata("accessory", "/avatar/parts/sunglasses-basic.png"),
    },
    update: {
      imageUrl: "/avatar/parts/sunglasses-basic.png",
      thumbnailUrl: "/avatar/thumbnails/sunglasses-basic.png",
      metadata: equipmentMetadata("accessory", "/avatar/parts/sunglasses-basic.png"),
      archived: false,
    },
    select: { id: true, name: true },
  });

  await prisma.avatarInventoryItem.upsert({
    where: {
      studentId_itemId: {
        studentId: student.id,
        itemId: item.id,
      },
    },
    create: {
      studentId: student.id,
      itemId: item.id,
      acquiredVia: "manual",
      sourceRef: "codex-sunglasses-preview",
    },
    update: {},
  });

  const loadout = await prisma.avatarLoadout.upsert({
    where: { studentId: student.id },
    create: { studentId: student.id },
    update: {},
    select: { id: true },
  });

  await prisma.avatarLoadoutItem.upsert({
    where: {
      loadoutId_slot: {
        loadoutId: loadout.id,
        slot: "accessory",
      },
    },
    create: {
      loadoutId: loadout.id,
      slot: "accessory",
      itemId: item.id,
    },
    update: {
      itemId: item.id,
    },
  });

  console.log(JSON.stringify({ student, item }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
