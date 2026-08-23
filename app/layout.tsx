import type { Metadata } from "next";
import { Geist, Jost } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";
import "./weapon-animations.css";

const geist = Geist({ subsets: ["latin"], display: "swap" });
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--font-jost" });

export const metadata: Metadata = {
  title: "StraftatPresets",
  description: "Community-made STRAFTAT map playlists, randomizers and swapper settings.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.className} ${jost.variable}`} suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
