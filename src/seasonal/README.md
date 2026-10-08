# Seasonal effects

The main page mounts `SeasonalEffects` and supplies `ready` once its preset view has loaded. This host and the small date registry are the only seasonal code in the initial page bundle.

`registry.ts` defines inclusive local calendar windows and lazy imports. Outside a window, the effect's JavaScript, CSS, rendering libraries and assets are not requested, and its controls are not mounted. URL parameters cannot override the calendar. A minute check unmounts the effect when its window ends.

Loading waits for page `load`, two animation frames for the main view to paint, any pending visible images, and browser idle time. Once the page is ready, a 1.5-second idle deadline prevents a busy browser from delaying automatic startup indefinitely. Browsers without idle callbacks use a deferred timer after paint. Offscreen lazy images do not block loading. The idle scheduler is cancelled if readiness or eligibility changes before loading finishes. Eligible effects start automatically unless the visitor saved a pause or motion/data-saving preferences disable animation.

Halloween owns its component, scoped CSS, scene and helpers in `halloween/`. Its existing models and static fallback live under `public/halloween/`; asset provenance and rebuilding instructions are documented there. Model fetches request low priority. Three.js is imported only when the effect can animate; reduced motion, data saving, pause, hidden tabs and preset dialogs retain their existing behavior.

To add an effect, create a folder here and register its ID, window and dynamic import. Export a default component accepting `SeasonalEffectProps`. `content` contains the page elements an effect may shake. Keep styles and rendering imports inside the lazy component, keep assets under a dedicated public folder, and clean up rendering, listeners and page transforms on unmount. Do not import seasonal assets or styles from the main layout.
