import type { Metadata } from "next";
import { Geist, Jost } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";
import "./weapon-animations.css";

const geist = Geist({ subsets: ["latin"], display: "swap", fallback: ["Arimo Name Symbols", "Noto Name Symbols", "sans-serif"] });
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--font-jost", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://straftatpresets.com"),
  title: "StraftatPresets",
  description: "Browse, create, and share custom Randomizer Settings, 369-map playlists, and Swapper Settings for STRAFTAT. One-click copy codes for in-game duel match setups.",
  applicationName: "StraftatPresets",
  keywords: [
    "STRAFTAT",
    "STRAFTAT presets",
    "STRAFTAT Randomizer Settings",
    "STRAFTAT weapon randomizer",
    "STRAFTAT Map Playlists",
    "STRAFTAT Swapper Settings",
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
    title: "StraftatPresets — STRAFTAT Randomizer Settings, Map Playlists & Swapper Settings",
    description: "Browse, create, and share custom Randomizer Settings, 369-map playlists, and Swapper Settings for STRAFTAT. One-click copy codes for in-game duel match setups.",
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
    title: "StraftatPresets — STRAFTAT Randomizer Settings, Map Playlists & Swapper Settings",
    description: "Browse, create, and share custom Randomizer Settings, 369-map playlists, and Swapper Settings for STRAFTAT.",
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
      "description": "Community-made STRAFTAT Map Playlists, Randomizer Settings, and Swapper Settings with one-click copy codes for custom duel match setups.",
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
      "description": "Browse and share custom Randomizer Settings, Map Playlists, and Swapper Settings for STRAFTAT.",
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
        {/*
          Zod v4 probes runtime `new Function("")` capability by default to enable JIT code generation.
          Under strict production CSP (which disallows 'unsafe-eval'), the browser blocks the probe and
          registers a securitypolicyviolation issue in DevTools.
          Setting `globalThis.__zod_globalConfig = { jitless: true }` before client scripts execute tells
          Zod to short-circuit the probe (see node_modules/zod/src/v4/core/util.ts: allowsEval probe skip under jitless).
        */}
        <script
          dangerouslySetInnerHTML={{ __html: "globalThis.__zod_globalConfig={jitless:true};" }}
        />
      </head>
      <body className={`${geist.className} ${jost.variable}`} suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
