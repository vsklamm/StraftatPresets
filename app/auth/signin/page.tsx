import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DiscordSignInButton } from "./signin-button";

export const metadata: Metadata = {
  title: "Sign in - STRAFTATpresets",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const message = error === "OAuthCallback" || error === "OAuthSignin"
    ? "Discord sign-in could not be completed. Please try again."
    : error === "AccessDenied"
      ? "Sign-in was declined or this account cannot access the site."
      : error ? "Sign-in could not be completed. Please try again." : "Sign in to submit and manage presets.";

  return <main className="auth-backdrop">
    <section className="auth-dialog" aria-labelledby="signin-title">
      <Link className="auth-dialog-close" href="/" aria-label="Return to presets">×</Link>
      <h2 id="signin-title">Sign in with Discord</h2>
      <p role={error ? "alert" : undefined}>{message}</p>
      <DiscordSignInButton callbackUrl={callbackUrl} />
    </section>
  </main>;
}
