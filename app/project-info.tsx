"use client";

import { useState } from "react";
import { APP_VERSION } from "@/src/lib/app-version";

const repositoryUrl = "https://github.com/vsklamm/StraftatPresets";

const sources = [
  { name: "STRAFTAT-Public", href: "https://github.com/Lemaitre-Logiciels/STRAFTAT-Public", icon: "github" },
  { name: "STRAFTOOLS", href: "https://github.com/clodcan/STRAFTOOLS", icon: "github" },
  { name: "StraftatFX", href: "https://github.com/MatthewKnorr/StraftatFX", icon: "github" },
  { name: "Background by Rowan Hawkes", href: "https://www.artstation.com/rowanhawkes6", icon: "art" },
];

function GitHubIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.41-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>;
}

function ArtworkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 17 4.5-4 3.2 2.7 2.5-2.2L19 17" /></svg>;
}

export function ProjectInfo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      className={`project-info-widget${isOpen ? " is-open" : ""}`}
      aria-label="Project information"
      onMouseLeave={() => setIsOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>(".project-info-trigger")?.focus();
        }
      }}
    >
      <button
        className="project-info-trigger"
        type="button"
        aria-expanded={isOpen}
        aria-controls="project-info-panel"
        aria-label="Open project information"
        onMouseEnter={() => setIsOpen(true)}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
      >
        <span>???</span>
      </button>
      <div id="project-info-panel" className="project-info-panel" aria-hidden={!isOpen}>
        <nav aria-label="StraftatPresets source and license">
          <a href={repositoryUrl} target="_blank" rel="noreferrer" tabIndex={isOpen ? 0 : -1}>
            <GitHubIcon />
            <span>Source code</span>
          </a>
          <a href={`${repositoryUrl}/blob/main/LICENSE`} target="_blank" rel="noreferrer" tabIndex={isOpen ? 0 : -1}>
            <GitHubIcon />
            <span>MIT license</span>
          </a>
        </nav>
        <div className="project-info-credits">
          <span className="project-info-label">Acknowledgements</span>
          <nav aria-label="Acknowledgements">
            {sources.map((source) => (
              <a key={source.href} href={source.href} target="_blank" rel="noreferrer" tabIndex={isOpen ? 0 : -1}>
                {source.icon === "github" ? <GitHubIcon /> : <ArtworkIcon />}
                <span>{source.name}</span>
              </a>
            ))}
          </nav>
        </div>
        <strong>v{APP_VERSION}</strong>
      </div>
    </aside>
  );
}
