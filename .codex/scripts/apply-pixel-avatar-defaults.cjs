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

const seeds = [
  ["default-hair-01", "hair", "/avatar/parts/default-hair.png", "/avatar/thumbnails/default-hair.png"],
  ["default-top-01", "top", "/avatar/parts/default-top.png", "/avatar/thumbnails/default-top.png"],
  ["default-bottom-01", "bottom", "/avatar/parts/default-bottom.png", "/avatar/thumbnails/default-bottom.png"],
  ["default-shoes-01", "shoes", "/avatar/parts/default-shoes.png", "/avatar/thumbnails/default-shoes.png"],
];

// Non-sprite color/shape/species seeds — they stay in the shop catalog but
// must not be rendered as real sprite equipment layers.
const placeholderSeeds = [
  ["skin-rose-01", { color: "#f1a7a0", placeholder: true }],
  ["skin-olive-01", { color: "#c9a877", placeholder: true }],
  ["hair-choco-01", { color: "#5c3624", placeholder: true }],
  ["top-mint-01", { color: "#2fbf9f", placeholder: true }],
  ["bottom-navy-01", { color: "#334155", placeholder: true }],
  ["shoes-red-01", { color: "#ef4444", placeholder: true }],
  ["background-sunset-01", { colors: ["#ffb37b", "#ff6f91"], placeholder: true }],
  ["background-forest-01", { colors: ["#9ad3a3", "#3b7a4a"], placeholder: true }],
  ["accessory-glasses-01", { shape: "round", color: "#222", placeholder: true }],
  ["accessory-cap-01", { shape: "cap", color: "#3366cc", placeholder: true }],
  ["pet-cat-01", { species: "cat", color: "#ffb37b", placeholder: true }],
];

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
  const results = [];
  for (const [key, layer, url, thumbnailUrl] of seeds) {
    const existing = await prisma.avatarItem.findFirst({
      where: { classroomId: null, key },
      select: { id: true },
    });
    if (!existing) continue;
    const item = await prisma.avatarItem.update({
      where: { id: existing.id },
      data: {
        imageUrl: url,
        thumbnailUrl,
        metadata: equipmentMetadata(layer, url),
        archived: false,
      },
      select: { key: true, imageUrl: true, metadata: true },
    });
    results.push(item);
  }

  for (const [key, metadata] of placeholderSeeds) {
    const existing = await prisma.avatarItem.findFirst({
      where: { classroomId: null, key },
      select: { id: true },
    });
    if (!existing) continue;
    const item = await prisma.avatarItem.update({
      where: { id: existing.id },
      data: { metadata, archived: false },
      select: { key: true, metadata: true },
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
