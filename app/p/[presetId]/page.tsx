import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Home from "@/app/page";
import { stripColorAndFormattingTags } from "@/src/domain/straftat-markup";
import { getApplicationServices } from "@/src/infrastructure/runtime";

export const dynamic = "force-dynamic";

type PresetPageProps = {
  params: Promise<{ presetId: string }>;
};

const getPublishedPreview = cache(async (identifier: string) => {
  const { repository } = await getApplicationServices();
  return repository.getPublishedPresetPreview(identifier);
});

function thumbnailUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function generateMetadata({ params }: PresetPageProps): Promise<Metadata> {
  const { presetId } = await params;
  const preset = await getPublishedPreview(presetId);
  if (!preset) {
    return {
      title: "StraftatPresets",
      robots: { index: false, follow: false },
    };
  }

  const presetName = stripColorAndFormattingTags(preset.title);
  const authorName = stripColorAndFormattingTags(preset.authorName);
  const previewTitle = `${presetName} | StraftatPresets`;
  const description = `Preset by ${authorName}`;
  const image = preset.thumbnailKey ? thumbnailUrl(preset.thumbnailKey) : "/android-chrome-512x512.png";

  return {
    title: "StraftatPresets",
    description,
    alternates: { canonical: `/p/${encodeURIComponent(preset.slug)}` },
    openGraph: {
      type: "website",
      siteName: "StraftatPresets",
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

export default async function PresetPage({ params }: PresetPageProps) {
  const { presetId } = await params;
  if (!await getPublishedPreview(presetId)) notFound();
  return <Home />;
}
