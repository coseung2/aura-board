import "server-only";
import { resolveCanvaEmbedUrl, type CanvaEmbed } from "@/lib/canva";
import { getPreviewCache, setPreviewCache } from "@/lib/preview-cache";

export async function resolveCanvaEmbedUrlCached(
  url: string
): Promise<CanvaEmbed | null> {
  const cached = await getPreviewCache<CanvaEmbed>("canva-oembed", url);
  if (cached.hit) {
    return cached.status === "ok" ? cached.payload : null;
  }
  const embed = await resolveCanvaEmbedUrl(url);
  await setPreviewCache(
    "canva-oembed",
    url,
    embed,
    Boolean(embed),
    embed ? undefined : "not_found"
  );
  return embed;
}
