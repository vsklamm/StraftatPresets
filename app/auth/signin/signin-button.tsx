"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";

export function DiscordSignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const retry = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await signIn("discord", { callbackUrl: callbackUrl || "/" });
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return <>
    <button className="discord-signin" type="button" disabled={pending} onClick={() => void retry()}>
      <span className="discord-signin-icon" aria-hidden="true" />
      {pending ? "Connecting..." : "Sign in with Discord"}
    </button>
    {failed ? <p role="alert">Discord sign-in could not be started. Please try again.</p> : null}
  </>;
}
