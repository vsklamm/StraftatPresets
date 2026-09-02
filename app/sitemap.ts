import type { MetadataRoute } from "next";
import { tagCatalogEntries } from "@/src/domain/tag-catalog";
import { getApplicationServices } from "@/src/infrastructure/runtime";

export const revalidate = 3600;
const MAX_SITEMAP_PRESETS = 200;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://straftatpresets.com";
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  for (const tag of tagCatalogEntries) {
    entries.push({
      url: `${baseUrl}/?q=tag:${encodeURIComponent(tag.slug)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  try {
    const services = await getApplicationServices();
    const result = await services.repository.listDashboardPresets("popular", undefined, MAX_SITEMAP_PRESETS, 0);
    for (const preset of result.items) {
      entries.push({
        url: `${baseUrl}/p/${encodeURIComponent(preset.slug || preset.id)}`,
        lastModified: preset.updatedAt ? new Date(preset.updatedAt) : now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch {
    // Fallback for build or environments without D1 binding
  }

  return entries;
}
