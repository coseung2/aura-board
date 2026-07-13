/** Browser-safe Canva URL helpers. Keep server credentials and token logic out. */

export function isCanvaDesignUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === "canva.link" || host === "www.canva.link") return true;
    return (
      (host === "canva.com" || host === "www.canva.com") &&
      /\/design\/[A-Za-z0-9_-]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function extractCanvaDesignId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return null;
    return url.pathname.match(/\/design\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildCanvaEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return null;
    const match = url.pathname.match(
      /\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/(?:view|watch|edit|present)/,
    );
    if (!match) return null;
    const [, designId, shareToken] = match;
    const path = shareToken
      ? `/design/${designId}/${shareToken}/view`
      : `/design/${designId}/view`;
    return `https://www.canva.com${path}?embed&meta`;
  } catch {
    return null;
  }
}

export function hasCanvaShareToken(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return false;
    return /\/design\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/(?:view|watch|edit|present)/.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

export function deriveCanvaThumbnailUrl(
  rawUrl: string | null | undefined,
): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return null;
    if (
      !/\/design\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?\/(?:view|watch|edit)/.test(
        url.pathname,
      )
    ) {
      return null;
    }
    return `/api/canva/thumbnail?design=${encodeURIComponent(url.toString())}&w=640`;
  } catch {
    return null;
  }
}

export function proxiedCanvaThumbnailUrl(
  rawUrl: string | null | undefined,
  width: 160 | 320 | 640 = 640,
): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("/api/canva/thumbnail?")) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "canva.com" ||
      host.endsWith(".canva.com") ||
      host.endsWith(".canva-web-files.com");
    if (!allowed) return rawUrl;
    return `/api/canva/thumbnail?url=${encodeURIComponent(url.toString())}&w=${width}`;
  } catch {
    return rawUrl;
  }
}
