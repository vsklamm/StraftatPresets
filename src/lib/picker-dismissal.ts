import type { RefObject } from "react";

export function observePickerDismissal(
  containerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): () => void {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Node;
    if (containerRef.current && !containerRef.current.contains(target) && !triggerRef.current?.contains(target)) {
      onClose();
    }
  }
  window.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousedown", handleClickOutside);
  };
}
