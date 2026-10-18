import type { MetadataRoute } from "next";
import { tagCatalogEntries } from "@/src/domain/tag-catalog";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listPublishedPresetUrls } from "@/src/infrastructure/d1-published-preset-preview";

export const dynamic = "force-dynamic";

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
    { url: `${baseUrl}/how-to-import`, changeFrequency: "monthly", priority: 0.7 },
  ];

  for (const tag of tagCatalogEntries) {
    entries.push({
      url: `${baseUrl}/?q=tag:${encodeURIComponent(tag.slug)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  const { env } = await getCloudflareContext({ async: true });
  for (const preset of await listPublishedPresetUrls(env.DB)) {
    entries.push({
      url: `${baseUrl}/p/${encodeURIComponent(preset.slug)}`,
      lastModified: new Date(preset.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}
