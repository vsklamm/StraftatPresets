"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  GUIDE_DEFINITIONS,
  ORDERED_GUIDE_TOPICS,
  type GuideDefinition,
  type GuideStep,
  type GuideTopic,
} from "@/src/domain/import-guides";

export {
  GUIDE_DEFINITIONS,
  ORDERED_GUIDE_TOPICS,
  type GuideDefinition,
  type GuideStep,
  type GuideTopic,
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
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
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

export function PresetImportGuideModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog-stage guide-dialog-stage"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <section
          ref={dialogRef}
          tabIndex={-1}
          className="preset-dialog guide-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="How to import Map Playlists, Swapper and Randomizer Settings"
        >
          <button
            className="dialog-close"
            type="button"
            aria-label="Close guide"
            onClick={onClose}
          >
            ×
          </button>
          <div className="guide-modal-content">
            <header className="guide-modal-header">
              <h1 className="guide-modal-title">
                How to import Map Playlists, Swapper and Randomizer Settings
              </h1>
            </header>
            {ORDERED_GUIDE_TOPICS.map((topic) => {
              const guide = GUIDE_DEFINITIONS[topic];
              return (
                <section key={topic} className="guide-modal-group">
                  <div className="guide-group-header">
                    <h2 className="guide-group-title">{guide.tabLabel}</h2>
                    <span className="guide-group-time">{guide.estimatedTime}</span>
                  </div>
                  <div className="guide-steps-grid">
                    {guide.steps.map((step) => (
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
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
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
                          {step.note ? (
                            <span className="guide-step-note">{step.note}</span>
                          ) : null}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}
