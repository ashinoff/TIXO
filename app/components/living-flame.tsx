"use client";

import { useEffect } from "react";

/** Animate the flame already present in the photograph, keeping its wick fixed. */
export function LivingFlame({ nextSection = "aromas" }: { nextSection?: string }) {

  useEffect(() => {
    const container = document.getElementById("hero-image");
    const photo = container?.querySelector<HTMLImageElement>("img");
    if (!container || !photo) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    canvas.id = "flame-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.prepend(canvas);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sourceWidth = 1536;
    const sourceHeight = 1024;
    const quality = Math.min(1, Math.max(0.65, window.innerWidth / sourceWidth));
    canvas.width = Math.round(sourceWidth * quality);
    canvas.height = Math.round(sourceHeight * quality);

    let active = !motion.matches;
    let visible = true;
    let loaded = false;
    let disposed = false;
    let pageVisible = true;
    let lastDraw = 0;
    let frame: number | null = null;

    const cancelFrame = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };

    const shouldAnimate = () => loaded && active && visible && pageVisible && !document.hidden && !disposed;

    const draw = (timestamp: number) => {
      if (!loaded || disposed) return;
      const time = timestamp * 0.001;
      context.setTransform(quality, 0, 0, quality, 0, 0);
      context.drawImage(photo, 0, 0, sourceWidth, sourceHeight);

      // Stretch adjacent photographed strips around their moving centre. The
      // outer edges and the wick stay anchored, leaving the candle untouched.
      for (let y = 112; y < 266; y += 2) {
        const rise = Math.max(0, (266 - y) / 154);
        const envelope = Math.sin(Math.PI * Math.min(1, (y - 112) / 154));
        const sway = (Math.sin(time * 2.8 + rise * 2.5) * 4.2 + Math.sin(time * 5.3) * 1.6) * rise * envelope;
        const centre = 1103;
        const left = 1027;
        const right = 1183;
        context.drawImage(photo, left, y, centre - left, 2, left, y, centre - left + sway, 2);
        context.drawImage(photo, centre, y, right - centre, 2, centre + sway, y, right - centre - sway, 2);
      }

      context.globalCompositeOperation = "screen";
      context.globalAlpha = 0.02 + (Math.sin(time * 3.4) + 1) * 0.018;
      context.drawImage(photo, 1056, 127, 97, 145, 1056, 127, 97, 145);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    };

    const tick = (timestamp: number) => {
      frame = null;
      if (!shouldAnimate()) return;
      if (timestamp - lastDraw >= 32) {
        draw(timestamp);
        lastDraw = timestamp;
      }
      schedule();
    };

    function schedule() {
      // One pending frame at most, even when several visibility events coincide.
      if (frame === null && shouldAnimate()) frame = window.requestAnimationFrame(tick);
    }

    const sync = () => {
      cancelFrame();
      if (!loaded || disposed) return;
      if (shouldAnimate()) {
        lastDraw = 0;
        schedule();
      } else {
        draw(0);
      }
    };

    const load = () => {
      if (disposed || loaded || !photo.naturalWidth) return;
      loaded = true;
      draw(0);
      canvas.classList.add("ready");
      sync();
    };

    const fail = () => {
      if (disposed) return;
      loaded = false;
      cancelFrame();
      canvas.classList.remove("ready");
    };

    const onMotionChange = () => {
      active = !motion.matches;
      sync();
    };
    const onPageHide = () => { pageVisible = false; cancelFrame(); };
    const onPageShow = () => { pageVisible = true; sync(); };

    photo.addEventListener("load", load);
    photo.addEventListener("error", fail);
    motion.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    const hero = document.getElementById("home") ?? container;
    const nextAnchor = document.querySelector<HTMLElement>(`[data-section-anchor="${nextSection}"]`);
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(() => {
        // A sticky hero is still geometrically on screen after the next panel covers it.
        visible = hero.getBoundingClientRect().bottom > 0 && (!nextAnchor || nextAnchor.getBoundingClientRect().top > 0);
        sync();
      })
      : null;
    observer?.observe(hero);
    if (nextAnchor) observer?.observe(nextAnchor);

    // decode also handles cached photographs whose load event has already fired.
    if (photo.complete && photo.naturalWidth) void photo.decode().then(load).catch(fail);

    return () => {
      disposed = true;
      cancelFrame();
      observer?.disconnect();
      photo.removeEventListener("load", load);
      photo.removeEventListener("error", fail);
      motion.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      canvas.remove();
    };
  }, [nextSection]);

  return null;
}
