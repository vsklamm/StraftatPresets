type LinkWidths = { single: number; double: number };

export function countWrappedToolLinks(available: number, widths: readonly LinkWidths[]): number {
  let total = widths.reduce((sum, width) => sum + width.single, 0);
  let wrapped = 0;
  for (let index = widths.length - 1; index >= 0 && total > available; index--) {
    total -= widths[index].single - widths[index].double;
    wrapped++;
  }
  return wrapped;
}

export function fitHeaderToolLayout(available: number, widths: readonly LinkWidths[], communitySaving: number) {
  const wrapped = countWrappedToolLinks(available, widths);
  const deficit = widths.reduce((sum, width) => sum + width.double, 0) - available;
  const hideCommunity = deficit > 0;
  return { wrapped, hideCommunity, hideCredit: hideCommunity && deficit > communitySaving };
}

export function observeResponsiveToolLinks(nav: HTMLElement): () => void {
  const topbar = nav.parentElement;
  const header = nav.closest(".site-header");
  const wordmark = topbar?.querySelector<HTMLElement>(".wordmark");
  const metadata = topbar?.querySelector<HTMLElement>(".topbar-meta");
  if (!topbar || !header || !wordmark || !metadata) return () => {};
  const links = [...nav.querySelectorAll<HTMLElement>(".tool-tab-link")];
  let metrics: { widths: LinkWidths[]; fixed: number; communitySaving: number } | undefined;
  let frame = 0;
  let stopped = false;

  const fit = () => {
    frame = 0;
    if (header.classList.contains("is-compact") || getComputedStyle(nav).display === "none") return;
    if (!metrics) {
      const clone = nav.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-hide-community");
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      clone.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:-1000px;width:max-content;max-width:none;flex:none;transform:none;transition:none";
      const probes = [...clone.querySelectorAll<HTMLElement>(".tool-tab-link")];
      probes.forEach((probe) => probe.removeAttribute("data-wrapped"));
      topbar.appendChild(clone);
      const singles = probes.map((probe) => probe.getBoundingClientRect().width);
      const fixed = [...clone.children].filter((child) => !child.classList.contains("tool-tab-link"))
        .reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
        + (parseFloat(getComputedStyle(clone).columnGap) || 0) * (clone.children.length - 1);
      const community = clone.querySelector<HTMLElement>(".community-presets-tab-wrap");
      const communityWidth = community?.getBoundingClientRect().width ?? 0;
      clone.setAttribute("data-hide-community", "");
      const communitySaving = communityWidth - (community?.getBoundingClientRect().width ?? 0);
      probes.forEach((probe) => probe.setAttribute("data-wrapped", ""));
      const widths = probes.map((probe, index) => ({ single: singles[index], double: probe.getBoundingClientRect().width }));
      clone.remove();
      metrics = { widths, fixed, communitySaving };
    }
    const metadataClone = metadata.cloneNode(true) as HTMLElement;
    metadataClone.removeAttribute("data-hide-credit");
    metadataClone.setAttribute("aria-hidden", "true");
    metadataClone.inert = true;
    metadataClone.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:-1000px;width:max-content;max-width:none;flex:none;transform:none;transition:none";
    topbar.appendChild(metadataClone);
    const metadataWidth = metadataClone.getBoundingClientRect().width;
    metadataClone.remove();
    const style = getComputedStyle(topbar);
    const available = topbar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - wordmark.offsetWidth - metadataWidth - (parseFloat(style.columnGap) || 0) * 2 - metrics.fixed - 2;
    const { wrapped, hideCommunity, hideCredit } = fitHeaderToolLayout(available, metrics.widths, metrics.communitySaving);
    nav.toggleAttribute("data-hide-community", hideCommunity);
    metadata.toggleAttribute("data-hide-credit", hideCredit);
    links.forEach((link, index) => link.toggleAttribute("data-wrapped", index >= links.length - wrapped));
  };
  const schedule = () => {
    if (!stopped && !frame) frame = requestAnimationFrame(fit);
  };
  const refreshFonts = () => { metrics = undefined; schedule(); };
  const resize = new ResizeObserver(schedule);
  [topbar, wordmark, metadata].forEach((element) => resize.observe(element));
  const visibility = new MutationObserver(schedule);
  visibility.observe(header, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", schedule);
  document.fonts.addEventListener("loadingdone", refreshFonts);
  void document.fonts.ready.then(refreshFonts);
  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    visibility.disconnect();
    window.removeEventListener("resize", schedule);
    document.fonts.removeEventListener("loadingdone", refreshFonts);
  };
}
