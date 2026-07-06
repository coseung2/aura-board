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
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
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

function equipmentMetadata(slot, spriteUrl, renderLayerKey) {
  return {
    spriteUrl,
    sprite: {
      frameWidth: 222,
      frameHeight: 444,
      columns: 8,
      rows: 2,
      layer: slot,
    },
    spriteVersion: "paperdoll-v1",
    templateKey: "aura-body-v1",
    slot,
    frameWidth: 222,
    frameHeight: 444,
    columns: 8,
    rows: 2,
    renderLayers: [
      {
        key: renderLayerKey,
        z: PAPERDOLL_LAYER_Z[renderLayerKey],
        spriteUrl,
      },
    ],
  };
}

const SYSTEM_ITEMS = [
  {
    key: "default-hair-01",
    data: {
      name: "기본 머리",
      description: "처음 캐릭터에 어울리는 기본 머리.",
      category: "hair",
      slot: "hair",
      rarity: "common",
      price: 0,
      imageUrl: "/avatar/parts/default-hair.png",
      thumbnailUrl: "/avatar/thumbnails/default-hair.png",
      metadata: equipmentMetadata("hair", "/avatar/parts/default-hair.png", "hair_front"),
      archived: false,
    },
  },
  {
    key: "default-top-01",
    data: {
      name: "기본 상의",
      description: "처음 캐릭터에 어울리는 파란 상의.",
      category: "top",
      slot: "top",
      rarity: "common",
      price: 0,
      imageUrl: "/avatar/parts/default-top.png",
      thumbnailUrl: "/avatar/thumbnails/default-top.png",
      metadata: equipmentMetadata("top", "/avatar/parts/default-top.png", "top_front"),
      archived: false,
    },
  },
  {
    key: "default-bottom-01",
    data: {
      name: "기본 하의",
      description: "처음 캐릭터에 어울리는 기본 하의.",
      category: "bottom",
      slot: "bottom",
      rarity: "common",
      price: 0,
      imageUrl: "/avatar/parts/default-bottom.png",
      thumbnailUrl: "/avatar/thumbnails/default-bottom.png",
      metadata: equipmentMetadata("bottom", "/avatar/parts/default-bottom.png", "bottom_front"),
      archived: false,
    },
  },
  {
    key: "default-shoes-01",
    data: {
      name: "기본 신발",
      description: "처음 캐릭터에 어울리는 기본 신발.",
      category: "shoes",
      slot: "shoes",
      rarity: "common",
      price: 0,
      imageUrl: "/avatar/parts/default-shoes.png",
      thumbnailUrl: "/avatar/thumbnails/default-shoes.png",
      metadata: equipmentMetadata("shoes", "/avatar/parts/default-shoes.png", "shoes"),
      archived: false,
    },
  },
  {
    key: "motion-bounce-01",
    data: {
      name: "통통 점프",
      description: "캐릭터가 가볍게 통통 뛰는 동작 모션.",
      category: "motion",
      slot: "motion",
      rarity: "rare",
      price: 300,
      imageUrl: null,
      thumbnailUrl: null,
      metadata: {
        animationKey: "bounce",
        motionClass: "character-motion-bounce",
        frameSequence: [0, 1, 2, 3, 4, 5, 6, 7],
        loop: true,
        fps: 12,
      },
      archived: false,
    },
  },
];

async function main() {
  const results = [];
  for (const seed of SYSTEM_ITEMS) {
    const existing = await prisma.avatarItem.findFirst({
      where: { classroomId: null, key: seed.key },
      select: { id: true },
    });
    const item = existing
      ? await prisma.avatarItem.update({
          where: { id: existing.id },
          data: seed.data,
          select: { id: true, key: true, name: true, category: true, slot: true, price: true },
        })
      : await prisma.avatarItem.create({
          data: { ...seed.data, classroomId: null, key: seed.key },
          select: { id: true, key: true, name: true, category: true, slot: true, price: true },
        });
    results.push(item);
  }

  console.log(JSON.stringify(results, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
