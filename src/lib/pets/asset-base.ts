/**
 * Where slime art is served from.
 *
 * Paths stay logical everywhere in the catalog (`shop/backgrounds/...`) and are
 * resolved once here. That keeps a storage migration a single-env-var change
 * instead of a rewrite of every catalog entry, and keeps local development
 * working against `public/` with no configuration at all.
 *
 * When `NEXT_PUBLIC_SLIME_ASSET_BASE_URL` is set, assets resolve to absolute
 * CDN URLs under a release-scoped prefix. Release prefixes are never overwritten,
 * which is what makes long-lived immutable caching safe there. When it is unset,
 * assets resolve to repo-relative paths under `/creatures/slimes`, which the
 * Expo client joins against its API base.
 */

/** Local origin-relative root, also the fallback when no CDN base is configured. */
export const SLIME_LOCAL_ASSET_ROOT = "/creatures/slimes";

/**
 * Release identifier for CDN-hosted art.
 *
 * A single value selects a complete asset set, so a deploy either sees the whole
 * new release or the whole previous one. Never point this at a mutable prefix.
 */
export const SLIME_ASSET_RELEASE = process.env.NEXT_PUBLIC_SLIME_ASSET_RELEASE?.trim() || "local";

function normalizedBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SLIME_ASSET_BASE_URL?.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(
      `NEXT_PUBLIC_SLIME_ASSET_BASE_URL must be an absolute http(s) URL, received: ${raw}`,
    );
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

const cdnBase = normalizedBase();

/** True when art is served from the CDN rather than this origin's `public/`. */
export const SLIME_ASSETS_ARE_REMOTE = cdnBase !== null;

/**
 * Resolve one logical asset path.
 *
 * `relativePath` is always relative to the slime asset root, with no leading
 * slash, for example `shop/backgrounds/cloud-garden/aura-package/...`.
 */
export function slimeAssetUrl(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "");
  if (!trimmed) throw new Error("slimeAssetUrl requires a non-empty relative path");
  return cdnBase
    ? `${cdnBase}/slimes/releases/${SLIME_ASSET_RELEASE}/${trimmed}`
    : `${SLIME_LOCAL_ASSET_ROOT}/${trimmed}`;
}

/**
 * Root prefix for callers that build paths by string concatenation.
 *
 * Prefer `slimeAssetUrl`. This exists so existing template literals keep working
 * without a mechanical rewrite of every catalog entry.
 */
export const SLIME_ASSET_ROOT = cdnBase
  ? `${cdnBase}/slimes/releases/${SLIME_ASSET_RELEASE}`
  : SLIME_LOCAL_ASSET_ROOT;
