import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import Home from "@/app/page";
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import { getPublishedPresetPreview } from "@/src/infrastructure/d1-published-preset-preview";
import { presetUrlWithContext } from "@/src/application/preset-view";

export const dynamic = "force-dynamic";

type PresetPageProps = {
  params: Promise<{ presetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getPublishedPreview = cache(async (identifier: string) => {
  const { env } = await getCloudflareContext({ async: true });
  return getPublishedPresetPreview(env.DB, identifier);
});

function thumbnailUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function siteUrl(): URL {
  return new URL(process.env.NEXTAUTH_URL ?? "https://straftatpresets.com");
}

export async function generateMetadata({ params }: PresetPageProps): Promise<Metadata> {
  const { presetId } = await params;
  const preset = await getPublishedPreview(presetId);
  if (!preset) {
    return {
      title: "STRAFTATpresets",
      robots: { index: false, follow: false },
    };
  }

  const presetName = stripColorAndFormattingTags(preset.title);
  const authorName = stripColorAndFormattingTags(preset.authorName);
  const previewTitle = `${presetName} | STRAFTATpresets`;
  const description = `Preset by ${authorName}`;
  const image = preset.thumbnailKey ? thumbnailUrl(preset.thumbnailKey) : "/android-chrome-512x512.png";

  return {
    title: "STRAFTATpresets",
    description,
    alternates: { canonical: `/p/${encodeURIComponent(preset.slug)}` },
    openGraph: {
      type: "website",
      siteName: "STRAFTATpresets",
      title: previewTitle,
      description,
      url: `/p/${encodeURIComponent(preset.slug)}`,
      images: [{ url: image, alt: presetName }],
    },
    twitter: {
      card: preset.thumbnailKey ? "summary_large_image" : "summary",
      title: previewTitle,
      description,
      images: [image],
    },
  };
}

export default async function PresetPage({ params, searchParams }: PresetPageProps) {
  const { presetId } = await params;
  const preset = await getPublishedPreview(presetId);
  if (!preset) notFound();
  if (presetId !== preset.slug) {
    const url = siteUrl();
    for (const [key, values] of Object.entries(await searchParams)) {
      for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) url.searchParams.append(key, value);
    }
    permanentRedirect(presetUrlWithContext(preset, url));
  }

  const baseUrl = siteUrl();
  const presetName = stripColorAndFormattingTags(preset.title);
  const authorName = stripColorAndFormattingTags(preset.authorName);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: presetName,
    description: stripColorAndFormattingTags(preset.description),
    url: new URL(`/p/${encodeURIComponent(preset.slug)}`, baseUrl).toString(),
    author: { "@type": "Person", name: authorName },
    image: preset.thumbnailKey ? new URL(thumbnailUrl(preset.thumbnailKey), baseUrl).toString() : undefined,
    isPartOf: {
      "@type": "WebSite",
      name: "STRAFTATpresets",
      url: baseUrl.toString(),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Home />
    </>
  );
}
