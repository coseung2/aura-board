import "server-only";
import { resolveCanvaEmbedUrl, type CanvaEmbed } from "@/lib/canva";
import { getPreviewCache, setPreviewCache } from "@/lib/preview-cache";

// v1 cached Canva's temporary thumbnail URL for the generic 30-day positive
// TTL. Rotate the namespace so already-stale rows are bypassed immediately.
const CANVA_OEMBED_CACHE_KIND = "canva-oembed-v2";

export async function resolveCanvaEmbedUrlCached(
  url: string
): Promise<CanvaEmbed | null> {
  const cached = await getPreviewCache<CanvaEmbed>(CANVA_OEMBED_CACHE_KIND, url);
  if (cached.hit) {
    return cached.status === "ok" ? cached.payload : null;
  }
  const embed = await resolveCanvaEmbedUrl(url);
  await setPreviewCache(
    CANVA_OEMBED_CACHE_KIND,
    url,
    embed,
    Boolean(embed),
    embed ? undefined : "not_found"
  );
  return embed;
}
