"use client";

import { useEffect, useState } from "react";
import { scheduleSeasonalLoad } from "./load-after-page";
import { seasonalEffects, selectSeasonalEffect, type SeasonalEffect, type SeasonalEffectProps } from "./registry";
import type { ComponentType } from "react";

type LoadedEffect = { id: string; Component: ComponentType<SeasonalEffectProps>; content: HTMLElement[] };

/** The page supplies readiness; effects own their rendering, controls and cleanup. */
export function SeasonalEffects({ ready }: { ready: boolean }) {
  const [selection, setSelection] = useState<SeasonalEffect>();
  const [loaded, setLoaded] = useState<LoadedEffect>();
  useEffect(() => {
    const update = () => {
      setSelection(selectSeasonalEffect(seasonalEffects, new Date()));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => { window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const effect = selection;
    if (!effect || !ready || loaded?.id === effect.id) return;
    let cancelled = false;
    const stillEligible = () => selectSeasonalEffect(seasonalEffects, new Date()) === effect;
    const cancel = scheduleSeasonalLoad(() => {
      if (!stillEligible()) return;
      void effect.load().then(({ default: Component }) => {
        if (cancelled || !stillEligible()) return;
        const content = Array.from(document.querySelectorAll<HTMLElement>(".app-shell > .site-header, .app-shell > .workspace"));
        setLoaded({ id: effect.id, Component, content });
      }).catch(() => { /* Optional decoration must never break the page. */ });
    });
    return () => { cancelled = true; cancel(); };
  }, [selection, ready, loaded?.id]);

  if (!loaded || loaded.id !== selection?.id) return null;
  return <loaded.Component content={loaded.content} />;
}
