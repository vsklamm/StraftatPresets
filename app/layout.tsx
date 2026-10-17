import type { Metadata } from "next";
import { Geist, Jost } from "next/font/google";
import { Providers } from "@/app/providers";
import { SITE_TITLE, SITE_DESCRIPTION } from "@/src/lib/site-metadata";
import "./globals.css";
import "./weapon-animations.css";

const geist = Geist({ subsets: ["latin"], display: "swap", fallback: ["Arimo Name Symbols", "Noto Name Symbols", "sans-serif"] });
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--font-jost", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "https://straftatpresets.com"),
  title: "STRAFTATpresets",
  description: SITE_DESCRIPTION,
  applicationName: "STRAFTATpresets",
  authors: [{ name: "STRAFTATpresets Community" }],
  creator: "STRAFTATpresets",
  publisher: "STRAFTATpresets",
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
    siteName: "STRAFTATpresets",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "STRAFTATpresets",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
      "name": "STRAFTATpresets",
      "url": "https://straftatpresets.com",
      "applicationCategory": "GameApplication",
      "operatingSystem": "Windows, Linux",
      "description": SITE_DESCRIPTION,
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
      "name": "STRAFTATpresets",
      "description": SITE_DESCRIPTION,
      "publisher": {
        "@type": "Organization",
        "name": "STRAFTATpresets",
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
