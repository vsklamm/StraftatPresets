import type { Metadata } from "next";
import { Geist, Jost } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";
import "./weapon-animations.css";

const geist = Geist({ subsets: ["latin"], display: "swap" });
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--font-jost", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://straftatpresets.com"),
  title: "StraftatPresets",
  description: "Browse, create, and share custom weapon randomizers, 369-map playlists, and swapper settings for STRAFTAT. One-click copy codes for in-game duel match setups.",
  applicationName: "StraftatPresets",
  keywords: [
    "STRAFTAT",
    "STRAFTAT presets",
    "STRAFTAT weapon randomizer",
    "STRAFTAT map playlists",
    "STRAFTAT swapper settings",
    "STRAFTAT custom game",
    "STRAFTAT codes",
    "STRAFTAT weapons",
    "STRAFTAT maps",
    "STRAFTAT duel presets",
    "STRAFTAT community",
    "STRAFTAT base64",
  ],
  authors: [{ name: "StraftatPresets Community" }],
  creator: "StraftatPresets",
  publisher: "StraftatPresets",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://straftatpresets.com",
    siteName: "StraftatPresets",
    title: "StraftatPresets — STRAFTAT Weapon Randomizer, Map Playlists & Swapper Presets",
    description: "Browse, create, and share custom weapon randomizers, 369-map playlists, and swapper settings for STRAFTAT. One-click copy codes for in-game duel match setups.",
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "StraftatPresets",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "StraftatPresets — STRAFTAT Weapon Randomizer, Map Playlists & Swapper Presets",
    description: "Browse, create, and share custom weapon randomizers, 369-map playlists, and swapper settings for STRAFTAT.",
    images: ["/android-chrome-512x512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "game",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://straftatpresets.com/#app",
      "name": "StraftatPresets",
      "url": "https://straftatpresets.com",
      "applicationCategory": "GameApplication",
      "operatingSystem": "Windows, Linux",
      "description": "Community-made STRAFTAT map playlists, weapon randomizers, and swapper presets with one-click copy codes for custom duel match setups.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "about": {
        "@type": "VideoGame",
        "name": "STRAFTAT",
        "gamePlatform": "PC game",
        "applicationCategory": "Game",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://straftatpresets.com/#website",
      "url": "https://straftatpresets.com",
      "name": "StraftatPresets",
      "description": "Browse and share custom weapon randomizers, map playlists, and swapper presets for STRAFTAT.",
      "publisher": {
        "@type": "Organization",
        "name": "StraftatPresets",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${geist.className} ${jost.variable}`} suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
