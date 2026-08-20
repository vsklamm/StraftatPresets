"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function AuthControl() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (status !== "authenticated") return null;

  return <div className="user-menu" onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false); }}>
    <span className="credit-separator" aria-hidden="true" />
    <button className="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "Escape") setIsOpen(false); }}>
      <span>{session.user.name ?? "Discord user"}</span>
    </button>
    {isOpen ? <div className="user-menu-popover" role="menu">
      <button type="button" role="menuitem" onClick={() => void signOut({ callbackUrl: window.location.origin })}>Log out</button>
    </div> : null}
  </div>;
}
