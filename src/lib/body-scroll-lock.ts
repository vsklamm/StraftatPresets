"use client";

import { useEffect } from "react";

let openModalCount = 0;
let preservedScrollY = 0;

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (openModalCount === 0) {
    preservedScrollY = typeof window !== "undefined" ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }
  openModalCount++;
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
    if (typeof window !== "undefined") {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      if (currentScrollY !== preservedScrollY) {
        window.scrollTo({ top: preservedScrollY, behavior: "instant" as ScrollBehavior });
      }
    }
  }
}

export function getOpenModalCount(): number {
  return openModalCount;
}

export function resetModalCountForTesting(): void {
  openModalCount = 0;
  preservedScrollY = 0;
}

export function useBodyScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);
}
