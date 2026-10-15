"use client";

import { GitHubIcon, PictureIcon as ArtworkIcon } from "@/app/icons";
import { useState } from "react";
import { APP_VERSION } from "@/src/lib/app-version";

const repositoryUrl = "https://github.com/vsklamm/StraftatPresets";

const sources = [
  { name: "STRAFTAT-Public", href: "https://github.com/Lemaitre-Logiciels/STRAFTAT-Public", icon: "github" },
  { name: "STRAFTOOLS", href: "https://github.com/clodcan/STRAFTOOLS", icon: "github" },
  { name: "StraftatFX", href: "https://github.com/MatthewKnorr/StraftatFX", icon: "github" },
  { name: "MingCute icons", href: "https://github.com/mingcute-design/mingcute-icons", icon: "github" },
  { name: "Background by Rowan Hawkes", href: "https://www.artstation.com/rowanhawkes6", icon: "art" },
];

export function ProjectInfo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      className={`corner-control project-info-widget${isOpen ? " is-open" : ""}`}
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
        <nav aria-label="STRAFTATpresets source and license">
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
