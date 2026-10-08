"use client";

import { useEffect, useRef, useState } from "react";
import type { SeasonalEffectProps } from "../registry";
import styles from "./effect.module.css";

const PAUSED_KEY = "straftat:halloween-paused:v1";

type SceneController = Awaited<ReturnType<typeof import("./scene").createHalloweenScene>>;

export default function HalloweenEffect({ content }: SeasonalEffectProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const scene = useRef<SceneController | null>(null);
  const updateRunning = useRef<() => void>(() => {});
  const pausedRef = useRef(false);

  useEffect(() => {
    const element = root.current!;
    const target = canvas.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    let inView = false;
    let loading = false;
    let failed = false;
    let dead = false;
    let abort: AbortController | null = null;
    let shakes: Animation[] = [];
    const shakeTargets = content;
    let charging = false;
    const charge = (strength: number, phase: number) => {
      if (strength === 0) {
        if (charging) for (const part of shakeTargets) part.style.removeProperty("translate");
        charging = false;
        return;
      }
      charging = true;
      const amplitude = strength * 4;
      const translate = `${Math.sin(phase * 1.3) * amplitude}px ${Math.cos(phase * 1.7) * amplitude * .65}px`;
      for (const part of shakeTargets) part.style.translate = translate;
    };
    const stopShake = () => {
      for (const shake of shakes) shake.cancel();
      shakes = [];
      charge(0, 0);
    };
    const detonate = () => {
      if (dead || pausedRef.current || motion.matches || document.hidden
        || document.documentElement.classList.contains("modal-open")) return;
      stopShake();
      // Move the header and cards independently, preserving the fixed backdrop's
      // viewport anchor. Preset dialogs are portaled outside these elements.
      const keyframes = [[0, 0], [-4, 2.5], [3.2, -2], [-2.2, 1.4], [1, -.6], [0, 0]]
        .map(([x, y]) => ({ translate: `${x}px ${y}px` }));
      shakes = shakeTargets.map((part) => part.animate(keyframes, { duration: 200, easing: "linear" }));
    };
    try { pausedRef.current = localStorage.getItem(PAUSED_KEY) === "1"; } catch { /* Storage may be disabled. */ }
    setPaused(pausedRef.current);

    const unavailable = () => {
      failed = true;
      stopShake();
      element.removeAttribute("data-rendering");
      element.removeAttribute("data-cinematic");
      if (!dead) setAvailable(false);
    };
    const update = () => {
      if (dead) return;
      setReducedMotion(motion.matches || Boolean(connection?.saveData));
      const permitted = !motion.matches && !connection?.saveData && !failed;
      const visible = inView && !document.hidden && !document.documentElement.classList.contains("modal-open");
      const running = permitted && visible && !pausedRef.current;
      if (!running) {
        stopShake();
        element.removeAttribute("data-cinematic");
      }
      if (!permitted) {
        abort?.abort();
        scene.current?.dispose();
        scene.current = null;
        element.removeAttribute("data-rendering");
      }
      scene.current?.setRunning(running);
      element.toggleAttribute("data-rendering", running && scene.current !== null);
      if (!running || scene.current || loading) return;
      loading = true;
      const controller = new AbortController();
      abort = controller;
      // Neither Three.js nor the GLB is requested before this decoration can run.
      void import("./scene").then(async ({ createHalloweenScene }) => {
        if (controller.signal.aborted || dead) return;
        const created = await createHalloweenScene(target, controller.signal, unavailable, detonate, (active) => {
          element.toggleAttribute("data-cinematic", active && !dead);
        }, charge);
        if (controller.signal.aborted || dead) { created.dispose(); return; }
        scene.current = created;
      }).catch(() => {
        if (!controller.signal.aborted && !dead) unavailable();
      }).finally(() => {
        loading = false;
        if (!dead) update();
      });
    };
    updateRunning.current = update;
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
    const modalObserver = new MutationObserver(update);
    observer.observe(element);
    modalObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    connection?.addEventListener("change", update);
    update();
    return () => {
      dead = true;
      stopShake();
      observer.disconnect();
      modalObserver.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      connection?.removeEventListener("change", update);
      abort?.abort();
      scene.current?.dispose();
      scene.current = null;
      updateRunning.current = () => {};
    };
  }, [content]);

  const toggle = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    try { localStorage.setItem(PAUSED_KEY, pausedRef.current ? "1" : "0"); } catch { /* In-memory pause still works. */ }
    updateRunning.current();
  };
  const toggleLabel = paused ? "Continue Halloween animation" : "Pause Halloween animation";
  return (
    <>
      <div ref={root} className={styles.backdrop} data-seasonal-effect="halloween" aria-hidden="true">
        <div className={styles.still} />
        <canvas ref={canvas} />
      </div>
      {available && !reducedMotion ? (
        <button className={`corner-control ${styles.toggle}`} type="button" onClick={toggle} aria-pressed={paused} aria-label={toggleLabel} title={toggleLabel}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
            {paused ? <path d="M6 3.5 16 10 6 16.5Z" /> : <><rect x="5" y="4" width="3" height="12" rx=".5" /><rect x="12" y="4" width="3" height="12" rx=".5" /></>}
          </svg>
        </button>
      ) : null}
    </>
  );
}
