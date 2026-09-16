/** Pause decorative CSS animations when their container cannot be seen. */
export function observeAnimationVisibility(element: HTMLElement): () => void {
  const document = element.ownerDocument;
  let inView = typeof IntersectionObserver === "undefined";
  const update = () => {
    const paused = !inView || document.hidden;
    element.style.setProperty("--ambient-animation-state", paused ? "paused" : "running");
    element.toggleAttribute("data-animation-paused", paused);
  };
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === element) inView = entry.isIntersecting;
    }
    update();
  });
  update();
  observer?.observe(element);
  document.addEventListener("visibilitychange", update);
  return () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", update);
    element.style.removeProperty("--ambient-animation-state");
    element.removeAttribute("data-animation-paused");
  };
}
