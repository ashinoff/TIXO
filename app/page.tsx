"use client";
/* eslint-disable @next/next/no-img-element -- preserve the composition of candle photographs */
import { useEffect, useState } from "react";
import { ShoppingProvider, Catalog, ScentDiscovery, CartOverlay, CartTrigger } from "./components/storefront-commerce";
import { Atelier } from "./components/atelier";
import { LivingFlame } from "./components/living-flame";
import { EveningRitual } from "./components/evening-ritual";
import { SectionNavigation } from "./components/section-navigation";
import { ArrowIcon } from "./components/ui-icon";
import { MobileSectionStack, SectionAnchor } from "./components/mobile-section-stack";
import "./components/evening-ritual.css";
import "./components/section-navigation.css";
import "./storefront.css";
import "./components/commerce.css";
import "./components/mobile-section-stack.css";

type Content = Record<string, {value:string;kind:string}>;
export default function Home() {
  const [content,setContent]=useState<Content>({});
  const c=(key:string,fallback:string)=>content[`atelier.${key}`]?.value || fallback;
  const heroImage=c("image.hero","/assets/hero.png");
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/content",{signal:controller.signal}).then(r=>r.ok?r.json():{}).then(setContent).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    if(motion.matches || !("IntersectionObserver" in window))return;
    const elements=[...document.querySelectorAll<HTMLElement>(".tiho-site .reveal")];
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.remove("pending");observer.unobserve(entry.target);}
    }),{threshold:.08});
    elements.forEach(el=>{if(el.getBoundingClientRect().top>window.innerHeight){el.classList.add("pending");observer.observe(el);}});
    const stop=()=>{if(motion.matches){elements.forEach(el=>el.classList.remove("pending"));observer.disconnect();}};
    motion.addEventListener("change",stop);
    return ()=>{observer.disconnect();elements.forEach(el=>el.classList.remove("pending"));motion.removeEventListener("change",stop);};
  },[]);
  return <ShoppingProvider><div className="tiho-site">
  <a className="skip" href="#collection">Перейти к коллекции</a>
  <main className="motion-ready">
<MobileSectionStack />
<SectionAnchor section="home" />
<section className="hero" id="home" aria-labelledby="hero-title">
<header className="header" id="header"><a className="wordmark" href="#home" aria-label="ТИХО — на главную">тихо</a><nav aria-label="Основная навигация"><a href="#collection">Коллекция</a><a href="#workshop">Мастерская</a><a href="#aromas">Ароматы</a></nav><CartTrigger /></header>
<div className="hero-image" id="hero-image"><img src={heroImage} alt="Горящая чёрная ребристая свеча на тёмном камне" width="1536" height="1024" fetchPriority="high" /></div><div className="hero-shade" aria-hidden="true"></div>
<div className="hero-content"><p className="eyebrow intro-enter"><span className="tiny-line"></span> СВЕЧИ РУЧНОЙ РАБОТЫ</p><h1 id="hero-title" className="intro-enter">{c("hero.title", "Пусть мир")}<br /><span>{c("hero.emphasis", "подождёт.")}</span></h1><p className="hero-description intro-enter">{c("hero.description", "Один огонь. Любимый аромат.\nИ вечер, который снова принадлежит вам.")}</p><a className="button button-glass intro-enter" href="#collection">Найти свою свечу <span aria-hidden="true"><ArrowIcon /></span></a></div>
<a className="hero-caption" href="#aromas"><span className="eyebrow">МАЛЕНЬКИЙ РИТУАЛ / ТИХО</span><span>Время для себя</span><span className="caption-notes">Живой свет · любимый аромат</span></a>
{heroImage === "/assets/hero.png" && <LivingFlame />}
<div className="hero-bottom"><a className="scroll-cue" href="#aromas">Почувствовать тишину <span aria-hidden="true"><ArrowIcon direction="down" /></span></a></div>
</section>
<SectionAnchor section="aromas" />
<ScentDiscovery />
<SectionAnchor section="collection" />
<Catalog />
<SectionAnchor section="intro" />
<section className="introduction pad" id="intro" aria-labelledby="intro-quote"><div className="intro-meta reveal"><span className="eyebrow">МАЛЕНЬКИЙ РИТУАЛ</span><span className="eyebrow">БОЛЬШЕ, ЧЕМ СВЕТ</span></div><h2 className="reveal" id="intro-title">Есть вещи, которые<br />возвращают <span>к себе.</span></h2><div className="intro-bottom reveal"><p><span className="intro-sensations">Тёплый свет на стене. Знакомый аромат.<br /></span><span id="intro-quote">Свеча, которую выбирают не по случаю —<br />а по ощущению.</span></p><a className="text-link" href="#collection">С этого начинается ТИХО <span aria-hidden="true"><ArrowIcon direction="down-right" /></span></a></div></section>
<SectionAnchor section="workshop" />
<section className="workshop pad" id="workshop" aria-labelledby="workshop-title"><div className="section-heading reveal"><p className="eyebrow">03 / МАСТЕРСКАЯ ТИХО</p><span className="eyebrow">СДЕЛАНО РУКАМИ. ВЫБРАНО СЕРДЦЕМ.</span></div><div className="workshop-grid"><div className="workshop-photo reveal"><img src={c("image.about", "/assets/workshop.webp")} alt="Ручная заливка свечи: тёплый воск, фитиль и руки мастера" width="1024" height="1536" loading="lazy" /><span>Всё начинается с прикосновения.</span></div><div className="workshop-copy"><h2 className="reveal" id="workshop-title">У тепла<br />есть <span>автор.</span></h2><p className="reveal">{c("about.lead", "ТИХО — мастерская свечей ручной работы. Нам близки простые формы, выразительные ароматы и вещи, рядом с которыми хочется задержаться.")}</p><p className="reveal">{c("about.text", "Мы создаём свечи для обычных вечеров, которые однажды становятся любимыми воспоминаниями.")}</p><div className="craft-list"><div className="reveal"><span>01</span><h3>Форма</h3><p>Рельеф, который хочется рассматривать. Свет, меняющий каждую грань.</p></div><div className="reveal"><span>02</span><h3>Аромат</h3><p>Композиция с характером — от первой ноты до мягкого шлейфа.</p></div><div className="reveal"><span>03</span><h3>Прикосновение</h3><p>Ручная работа, которая оставляет каждой свече её индивидуальность.</p></div></div></div></div></section>
<SectionAnchor section="studio" />
<Atelier />
<SectionAnchor section="care" />
<EveningRitual />
</main>
<footer className="footer footer-ritual pad">
  <div className="footer-top"><span>Аромат. Свет. Тишина.</span><a href="#home">Вернуться к началу <span aria-hidden="true"><ArrowIcon direction="up" /></span></a></div>
  <div className="footer-signature"><a className="footer-wordmark" href="#home" aria-label="ТИХО — наверх">тихо</a><div><p>Для вечеров,<br />которые хочется повторить.</p><nav aria-label="Навигация в конце страницы"><a href="#collection">Коллекция <ArrowIcon /></a><a href="#studio">Твоя мастерская <ArrowIcon /></a></nav></div></div>
  <div className="footer-bottom"><span>© ТИХО / TIXO, {new Date().getFullYear()}</span><a href="#workshop">Мастерская свечей ручной работы</a><span>Создано для ваших вечеров</span></div>
</footer>
<CartOverlay />
<SectionNavigation />
</div></ShoppingProvider>;
}
