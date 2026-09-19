"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type GuideTopic = "randomizer" | "swapper" | "playlist";

export type GuideStep = {
  stepNumber: number;
  title: string;
  description: string;
  note?: string;
  imageSrc?: string;
};

export type GuideDefinition = {
  topic: GuideTopic;
  tabLabel: string;
  title: string;
  estimatedTime: string;
  steps: GuideStep[];
};

export const GUIDE_DEFINITIONS: Record<GuideTopic, GuideDefinition> = {
  randomizer: {
    topic: "randomizer",
    tabLabel: "Randomizer Settings",
    title: "How to Apply Randomizer Settings",
    estimatedTime: "~2–4 mins",
    steps: [
      {
        stepNumber: 1,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 2,
        title: "Open Randomizer Settings",
        description: "Press checkbox 'Randomise Weapons' in lobby settings and press button 'Randomizer Settings'.",
        imageSrc: "/guide/randomizer-settings.webp",
      },
      {
        stepNumber: 3,
        title: "Clear Weapons",
        description: "Press button 'Toggle' to uncheck all weapons (press again if it enables them).",
        imageSrc: "/guide/randomizer-toggle.webp",
      },
      {
        stepNumber: 4,
        title: "Set Weapon Weights",
        description: "For each weapon from the preset, check the box and enter the weight (yes... it takes time).",
        imageSrc: "/guide/randomizer-weights.webp",
      },
      {
        stepNumber: 5,
        title: "Save Preset",
        description: "Don't forget to press button 'Save Preset'.",
        note: "Do not select any other presets before saving, otherwise changes will be lost.",
        imageSrc: "/guide/randomizer-save.webp",
      },
    ],
  },
  swapper: {
    topic: "swapper",
    tabLabel: "Swapper Settings",
    title: "How to Import Swapper Settings",
    estimatedTime: "< 1 min",
    steps: [
      {
        stepNumber: 1,
        title: "Copy Preset",
        description: "Press button 'Copy' on this preset.",
        imageSrc: "/guide/copy-preset.webp",
      },
      {
        stepNumber: 2,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 3,
        title: "Open Swapper",
        description: "Press button 'Swapper Settings' (leave checkbox 'Randomise Weapons' unchecked).",
        imageSrc: "/guide/swapper-settings.webp",
      },
      {
        stepNumber: 4,
        title: "Import Preset",
        description: "Press button 'Import Preset'.",
        imageSrc: "/guide/swapper-import.webp",
      },
      {
        stepNumber: 5,
        title: "Select Preset",
        description: "Click on the imported preset in the list to select it.",
        imageSrc: "/guide/swapper-select.webp",
      },
    ],
  },
  playlist: {
    topic: "playlist",
    tabLabel: "Map Playlists",
    title: "How to Import Map Playlists",
    estimatedTime: "< 1 min",
    steps: [
      {
        stepNumber: 1,
        title: "Copy Preset",
        description: "Press button 'Copy' on this preset.",
        imageSrc: "/guide/copy-preset.webp",
      },
      {
        stepNumber: 2,
        title: "Open Maps Menu",
        description: "Press button 'Maps' in the top menu (to the left of 'HOME').",
        imageSrc: "/guide/maps-menu.webp",
      },
      {
        stepNumber: 3,
        title: "Import Playlist",
        description: "Press button 'Import' (the imported playlist appears at the end of the list).",
        imageSrc: "/guide/maps-import.webp",
      },
      {
        stepNumber: 4,
        title: "Host a Lobby",
        description: "Start hosting a lobby.",
        imageSrc: "/guide/host-lobby.webp",
      },
      {
        stepNumber: 5,
        title: "Open Match Maps",
        description: "Press button 'MAPS' at the bottom (to the right of 'START').",
        imageSrc: "/guide/match-maps.webp",
      },
      {
        stepNumber: 6,
        title: "Load Playlist",
        description: "Press button 'Load' and click on the imported Map Playlist.",
        imageSrc: "/guide/maps-load.webp",
      },
    ],
  },
};

export function GuideTriggerButton({
  topic,
  isOpen,
  onClick,
  label = "How to import?",
  isLoggedIn = false,
}: {
  topic: GuideTopic;
  isOpen?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  isLoggedIn?: boolean;
}) {
  const guideDef = GUIDE_DEFINITIONS[topic];
  return (
    <button
      className={`guide-trigger ${isLoggedIn ? "is-logged-in" : ""} ${isOpen ? "is-active" : ""}`}
      type="button"
      aria-expanded={isOpen}
      aria-controls="preset-import-guide-view"
      aria-label={`How to import ${guideDef.tabLabel}`}
      onClick={onClick}
    >
      <span className="guide-trigger-icon" aria-hidden="true">
        <HelpBookIcon />
      </span>
      <span className="guide-trigger-label">{label}</span>
    </button>
  );
}

type GuidePosition = {
  left: number;
  width: number;
  maxHeight: number;
};

function computeGuidePosition(): GuidePosition {
  if (typeof window === "undefined") {
    return {
      left: 16,
      width: 540,
      maxHeight: 640,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const edgeMargin = 16;
  const guideWidth = Math.min(540, viewportWidth - edgeMargin * 2);
  const maxHeight = Math.min(640, viewportHeight - edgeMargin * 2);

  // Measure the preset dialog and hero column (the image place)
  const heroEl = document.querySelector(".dialog-hero") as HTMLElement | null;
  const dialogEl = document.querySelector(".preset-dialog") as HTMLElement | null;
  const heroRect = heroEl?.getBoundingClientRect();
  const dialogRect = dialogEl?.getBoundingClientRect();

  // Anchor to the hero boundary (image place), leaving preset info (dialog-content) visible
  let targetRight: number;
  if (heroRect && heroRect.right > 0) {
    targetRight = heroRect.right;
  } else if (dialogRect && dialogRect.left > 0) {
    targetRight = dialogRect.left + 290;
  } else {
    targetRight = Math.round(viewportWidth * 0.45);
  }

  let left = Math.round(targetRight - guideWidth);

  // Clamp within viewport margins
  if (left < edgeMargin) {
    left = edgeMargin;
  }
  if (left + guideWidth > viewportWidth - edgeMargin) {
    left = viewportWidth - edgeMargin - guideWidth;
  }

  return { left, width: guideWidth, maxHeight };
}

export function PresetImportGuideView({
  topic,
  anchorEl,
  onClose,
}: {
  topic: GuideTopic;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const currentGuide = GUIDE_DEFINITIONS[topic] ?? GUIDE_DEFINITIONS.randomizer;

  const [position, setPosition] = useState<GuidePosition>(computeGuidePosition);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition(computeGuidePosition());
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Click outside / pointerdown outside
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !anchorEl?.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchorEl?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl, onClose]);

  // Handle focus leaving the popover
  const handleBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as Node | null;
    if (
      containerRef.current &&
      related &&
      !containerRef.current.contains(related) &&
      !anchorEl?.contains(related)
    ) {
      onClose();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <aside
      ref={containerRef}
      id="preset-import-guide-view"
      className="guide-floating-popover"
      role="dialog"
      aria-modal="true"
      aria-label={currentGuide.title}
      tabIndex={-1}
      onBlur={handleBlur}
      style={{
        position: "fixed",
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: `${position.maxHeight}px`,
        zIndex: 100,
      }}
    >
      <div className="guide-popover-content">
        <div className="guide-steps-grid">
          {currentGuide.steps.map((step) => (
            <div key={step.stepNumber} className="guide-step-item">
              <div className="guide-step-header">
                <span className="guide-step-num">{step.stepNumber}.</span>
                <strong className="guide-step-title">{step.title}</strong>
              </div>

              <div className="guide-screenshot-frame">
                {step.imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={step.imageSrc}
                    alt={`${step.title} screenshot`}
                    className="guide-screenshot-img"
                  />
                ) : (
                  <div className="guide-screenshot-placeholder" aria-hidden="true">
                    <CameraScanIcon />
                    <span>Screenshot</span>
                  </div>
                )}
              </div>

              <p className="guide-step-text">
                {step.description}
                {step.note ? <span className="guide-step-note">{step.note}</span> : null}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>,
    document.body
  );
}

function HelpBookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CameraScanIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
