import type { Metadata } from "next";
import Home from "@/app/page";

const title = "How to import presets into STRAFTAT | STRAFTATpresets";
const description =
  "Import map playlists and weapon swaps (Swapper), and set up weapon chances (Randomizer) in STRAFTAT. Step-by-step instructions with screenshots.";
const previewImage = {
  url: "/guide/how-to-import-preview.jpg",
  width: 1200,
  height: 630,
  alt: "How to import presets into STRAFTAT: screenshots of map playlist import, Swapper import, and Randomizer weapon weights.",
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-to-import" },
  openGraph: {
    type: "website",
    siteName: "STRAFTATpresets",
    title,
    description,
    url: "/how-to-import",
    images: [previewImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [previewImage],
  },
};

export default function HowToImportPage() {
  return <Home />;
}
