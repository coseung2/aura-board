import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/landing", "/privacy", "/terms", "/support"].map((path) => ({
    url: `https://aura-board.com${path}`,
  }));
}
