"use client";

import { useEffect, useState } from "react";
import { useMobileLayout } from "../../lib/use-mobile-layout";

const sections = [
  { id: "home", label: "В начало" },
  { id: "aromas", label: "Искусство аромата" },
  { id: "collection", label: "Коллекция" },
  { id: "workshop", label: "Мастерская ТИХО" },
  { id: "studio", label: "Твоя мастерская" },
  { id: "care", label: "Простой ритуал" },
] as const;
const mobileSections = [sections[0], sections[2], sections[1], ...sections.slice(3)];

export function SectionNavigation() {
  const mobile = useMobileLayout();
  const orderedSections = mobile ? mobileSections : sections;
  const [active, setActive] = useState<string>("home");
  useEffect(() => {
    if (!("requestAnimationFrame" in window)) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = window.innerHeight * .4;
      let current: string = "home";
      for (const section of orderedSections) {
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
  }, [orderedSections]);

  return <nav className="section-navigation" aria-label="Быстрый переход к разделу">
    {orderedSections.map((section, index) => <a key={section.id} href={`#${section.id}`} aria-label={section.label} aria-current={active === section.id ? "location" : undefined}>
      <span className="section-navigation-circle" aria-hidden="true">{index ? String(index).padStart(2, "0") : <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5m-5 5 5-5 5 5" /></svg>}</span>
      <span className="section-navigation-label" aria-hidden="true">{section.label}</span>
    </a>)}
  </nav>;
}
