import { db } from "../src/lib/db";
import { isCanvaDesignUrl, resolveCanvaEmbedUrl } from "../src/lib/canva";
import { resizeRemoteImageToWebPPreviewUrl } from "../src/lib/blob";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;

  const cards = await db.card.findMany({
    where: {
      linkUrl: { not: null },
      OR: [{ linkImage: null }, { linkImage: "" }],
    },
    select: { id: true, linkUrl: true },
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { updatedAt: "desc" },
  });

  let checked = 0;
  let updated = 0;
  let failed = 0;

  for (const card of cards) {
    if (!card.linkUrl || !isCanvaDesignUrl(card.linkUrl)) continue;
    checked += 1;
    try {
      const embed = await resolveCanvaEmbedUrl(card.linkUrl);
      if (!embed?.thumbnailUrl) {
        failed += 1;
        continue;
      }
      const previewUrl = await resizeRemoteImageToWebPPreviewUrl(
        embed.thumbnailUrl,
        `canva-previews/${card.id}-${Date.now()}.webp`,
        640,
        75
      );
      if (!dryRun) {
        await db.card.update({
          where: { id: card.id },
          data: { linkImage: previewUrl, canvaDesignId: embed.designId },
        });
      }
      updated += 1;
    } catch (e) {
      failed += 1;
      console.warn(
        `[backfill-canva-previews] failed card=${card.id}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  console.log(
    JSON.stringify({ dryRun, scanned: cards.length, checked, updated, failed }, null, 2)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
