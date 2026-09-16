"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Keep transient scrollbar state out of the dashboard's render tree. */
export function ScrollingContent({ className, children }: { className: string; children: ReactNode }) {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return <div className={`${className}${scrolling ? " is-scrolling" : ""}`} onScroll={() => {
    setScrolling(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setScrolling(false), 650);
  }}>{children}</div>;
}
