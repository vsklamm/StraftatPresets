import type { Metadata } from "next";
import Home from "@/app/page";

export const metadata: Metadata = {
  title: "How to import Map Playlists, Swapper and Randomizer Settings | StraftatPresets",
  description:
    "Visual step-by-step guides on how to import Swapper Settings, Map Playlists, and Randomizer Settings in STRAFTAT.",
  alternates: { canonical: "/how-to-import" },
  openGraph: {
    type: "website",
    siteName: "StraftatPresets",
    title: "How to import Map Playlists, Swapper and Randomizer Settings | StraftatPresets",
    description:
      "Visual step-by-step guides on how to import Swapper Settings, Map Playlists, and Randomizer Settings in STRAFTAT.",
    url: "/how-to-import",
  },
  twitter: {
    card: "summary",
    title: "How to import Map Playlists, Swapper and Randomizer Settings | StraftatPresets",
    description:
      "Visual step-by-step guides on how to import Swapper Settings, Map Playlists, and Randomizer Settings in STRAFTAT.",
  },
};

export default function HowToImportPage() {
  return <Home />;
}
