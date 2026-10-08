type LoadingImage = Pick<HTMLImageElement, "complete" | "addEventListener" | "removeEventListener"> & {
  getBoundingClientRect(): Pick<DOMRect, "top" | "bottom" | "left" | "right">;
};

export interface SeasonalLoadingHost {
  document: { readyState: DocumentReadyState; images: Iterable<LoadingImage> };
  innerWidth: number;
  innerHeight: number;
  addEventListener(type: "load", listener: () => void, options?: { once: boolean }): void;
  removeEventListener(type: "load", listener: () => void): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(id: number): void;
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
}

/** Call only once the main view is ready. Cancellation also covers a season ending mid-load. */
export function scheduleSeasonalLoad(load: () => void, host: SeasonalLoadingHost = window): () => void {
  let cancelled = false;
  let frame: number | undefined;
  let idle: number | undefined;
  let timeout: number | undefined;
  const imageListeners = new Map<LoadingImage, () => void>();
  const afterPaint = (next: () => void) => {
    frame = host.requestAnimationFrame(() => {
      frame = host.requestAnimationFrame(() => { frame = undefined; if (!cancelled) next(); });
    });
  };
  const whenIdle = () => {
    const run = () => { if (!cancelled) load(); };
    // Prefer idle time after the page is ready, but never wait indefinitely to start.
    if (host.requestIdleCallback) idle = host.requestIdleCallback(run, { timeout: 1500 });
    else timeout = host.setTimeout(run, 250);
  };
  const waitForImages = () => {
    const pending = Array.from(host.document.images).filter((image) => {
      if (image.complete) return false;
      const bounds = image.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.right > 0 && bounds.top < host.innerHeight && bounds.left < host.innerWidth;
    });
    if (!pending.length) { whenIdle(); return; }
    let remaining = pending.length;
    for (const image of pending) {
      const settled = () => {
        if (!imageListeners.has(image)) return;
        image.removeEventListener("load", settled);
        image.removeEventListener("error", settled);
        imageListeners.delete(image);
        if (--remaining === 0 && !cancelled) afterPaint(whenIdle);
      };
      imageListeners.set(image, settled);
      image.addEventListener("load", settled);
      image.addEventListener("error", settled);
      if (image.complete) settled();
    }
  };
  const loaded = () => { if (!cancelled) afterPaint(waitForImages); };
  if (host.document.readyState === "complete") loaded();
  else host.addEventListener("load", loaded, { once: true });

  return () => {
    cancelled = true;
    host.removeEventListener("load", loaded);
    if (frame !== undefined) host.cancelAnimationFrame(frame);
    if (idle !== undefined) host.cancelIdleCallback?.(idle);
    if (timeout !== undefined) host.clearTimeout(timeout);
    for (const [image, settled] of imageListeners) {
      image.removeEventListener("load", settled);
      image.removeEventListener("error", settled);
    }
    imageListeners.clear();
  };
}
