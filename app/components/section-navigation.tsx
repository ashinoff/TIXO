"use client";

import { useEffect, useState } from "react";

const sections = [
  { id: "home", number: "", label: "В начало" },
  { id: "aromas", number: "01", label: "Искусство аромата" },
  { id: "collection", number: "02", label: "Коллекция" },
  { id: "workshop", number: "03", label: "Мастерская ТИХО" },
  { id: "studio", number: "04", label: "Твоя мастерская" },
  { id: "care", number: "05", label: "Простой ритуал" },
] as const;

export function SectionNavigation() {
  const [active, setActive] = useState<string>("home");
  useEffect(() => {
    if (!("requestAnimationFrame" in window)) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = window.innerHeight * .4;
      let current: string = "home";
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= marker) current = section.id;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    const main = document.querySelector(".tiho-site main");
    if (main) observer?.observe(main);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, []);

  return <nav className="section-navigation" aria-label="Быстрый переход к разделу">
    {sections.map(section => <a key={section.id} href={`#${section.id}`} aria-label={section.label} aria-current={active === section.id ? "location" : undefined}>
      <span className="section-navigation-circle" aria-hidden="true">{section.number || <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m-5 5 5-5 5 5" /></svg>}</span>
      <span className="section-navigation-label" aria-hidden="true">{section.label}</span>
    </a>)}
  </nav>;
}
