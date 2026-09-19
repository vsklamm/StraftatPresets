"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MAX_USER_DISPLAY_NAME_CHARACTERS,
  type UserProfile,
  validateUserDisplayNameStructure,
} from "@/src/domain/user-profile";
import { StraftatText } from "@/app/straftat-text";

type AuthControlProps = {
  onProfileChange?: (profile: UserProfile) => void;
  nameDialogRequested?: boolean;
  onNameDialogClose?: () => void;
};

export function AuthControl({ onProfileChange, nameDialogRequested = false, onNameDialogClose }: AuthControlProps) {
  const { data: session, status } = useSession();

  if (status !== "authenticated") return null;
  return <AuthenticatedAuthControl
    key={session.user.id}
    session={session}
    onProfileChange={onProfileChange}
    nameDialogRequested={nameDialogRequested}
    onNameDialogClose={onNameDialogClose}
  />;
}

function AuthenticatedAuthControl({ session, onProfileChange, nameDialogRequested, onNameDialogClose }: {
  session: NonNullable<ReturnType<typeof useSession>["data"]>;
  onProfileChange?: (profile: UserProfile) => void;
  nameDialogRequested: boolean;
  onNameDialogClose?: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Profile could not be loaded.");
        return response.json() as Promise<{ profile: UserProfile }>;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setProfile(result.profile);
        onProfileChange?.(result.profile);
        if (!result.profile.hasConfiguredDisplayName) setIsNameDialogOpen(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [session.user.id, onProfileChange]);

  const visibleName = profile?.displayName ?? session.user.name ?? "Discord user";
  const closeNameDialog = () => {
    setIsNameDialogOpen(false);
    onNameDialogClose?.();
  };
  return <>
    <div className="user-menu" onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false); }}>
      <span className="credit-separator" aria-hidden="true" />
      <button className="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "Escape") setIsOpen(false); }}>
        <span><StraftatText text={visibleName} /></span>
      </button>
      {isOpen ? <div className="user-menu-popover" role="menu">
        <button type="button" role="menuitem" onClick={() => { setIsOpen(false); setIsNameDialogOpen(true); }}>Change name</button>
        <button className="logout-menu-item" type="button" role="menuitem" onClick={() => void signOut({ callbackUrl: window.location.origin })}>Log out</button>
      </div> : null}
    </div>
    {isNameDialogOpen || nameDialogRequested ? <DisplayNameDialog
      initialName={visibleName}
      isFirstChoice={!profile?.hasConfiguredDisplayName}
      onClose={closeNameDialog}
      onSaved={(saved) => {
        setProfile(saved);
        closeNameDialog();
        onProfileChange?.(saved);
      }}
    /> : null}
  </>;
}

function DisplayNameDialog({ initialName, isFirstChoice, onClose, onSaved }: {
  initialName: string;
  isFirstChoice: boolean;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const structural = validateUserDisplayNameStructure(displayName);
    if ("error" in structural) {
      setError(structural.error);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const result = await response.json() as { profile?: UserProfile; error?: string };
      if (!response.ok || !result.profile) throw new Error(result.error ?? "Display name could not be saved.");
      onSaved(result.profile);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Display name could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="auth-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="auth-dialog display-name-dialog" role="dialog" aria-modal="true" aria-labelledby="display-name-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="auth-dialog-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <h2 id="display-name-title">{isFirstChoice ? "Choose a display name" : "Change display name"}</h2>
        <p>This name appears on your presets. Change it anytime from the top-right menu.</p>
        <form autoComplete="off" onSubmit={submit}>
          <input
            ref={inputRef}
            aria-label="Display name"
            autoComplete="off"
            data-1p-ignore
            data-bwignore
            data-form-type="other"
            data-lpignore="true"
            maxLength={MAX_USER_DISPLAY_NAME_CHARACTERS}
            value={displayName}
            onChange={(event) => { setDisplayName(event.target.value); setError(""); }}
          />
          {error ? <small className="display-name-error" role="alert">{error}</small> : null}
          <button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</button>
        </form>
      </section>
    </div>,
    document.body
  );
}
