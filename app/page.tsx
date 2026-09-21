"use client";
/* eslint-disable @next/next/no-img-element -- preserve the composition of candle photographs */
import { CSSProperties, useEffect, useState } from "react";
import { ShoppingProvider, Catalog, Aroma, CartOverlay, CartTrigger } from "./components/storefront-commerce";
import { Atelier } from "./components/atelier";
import { LivingFlame } from "./components/living-flame";
import "./storefront.css";

type Content = Record<string, {value:string;kind:string}>;
export default function Home() {
  const [content,setContent]=useState<Content>({});
  const [light,setLight]=useState(28);
  const c=(key:string,fallback:string)=>content[`atelier.${key}`]?.value || fallback;
  const heroImage=c("image.hero","/assets/hero.png");
  const lightLabel=light<35?"Вечер":light<72?"Сумерки":"Тишина";
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
  <header className="header" id="header"><a className="wordmark" href="#home" aria-label="ТИХО — на главную">тихо<span className="brand-period">.</span></a><nav aria-label="Основная навигация"><a href="#collection">Коллекция</a><a href="#workshop">Мастерская</a><a href="#ritual">Об аромате</a></nav><CartTrigger /></header>
  <main className="motion-ready">
<section className="hero" id="home" style={{"--scene-brightness":1.12-light*.0064,"--night":light*.004} as CSSProperties} aria-labelledby="hero-title">
<div className="hero-image" id="hero-image"><img src={heroImage} alt="Горящая чёрная ребристая свеча на тёмном камне" width="1536" height="1024" fetchPriority="high" /></div><div className="hero-shade" aria-hidden="true"></div><div className="night-layer" aria-hidden="true"></div>
<div className="hero-content"><p className="eyebrow intro-enter"><span className="tiny-line"></span> СВЕЧИ РУЧНОЙ РАБОТЫ</p><h1 id="hero-title" className="intro-enter">{c("hero.title", "Пусть мир")}<br /><span>{c("hero.emphasis", "подождёт.")}</span></h1><p className="hero-description intro-enter">{c("hero.description", "Один огонь. Любимый аромат.\nИ вечер, который снова принадлежит вам.")}</p><a className="button button-light intro-enter" href="#collection">Найти свою свечу <span aria-hidden="true">↗</span></a></div>
<a className="hero-caption" href="#ritual"><span className="eyebrow">МАЛЕНЬКИЙ РИТУАЛ / ТИХО</span><span>Время для себя</span><span className="caption-notes">Живой свет · любимый аромат</span></a>
<div className="hero-bottom">{heroImage === "/assets/hero.png" && <LivingFlame />}<div className="light-control"><label htmlFor="evening-light">Приглушить мир</label><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></svg><input id="evening-light" type="range" min="0" max="100" value={light} onChange={e=>setLight(Number(e.target.value))} aria-valuetext={`${lightLabel}, приглушение ${light} процентов`} /><span id="light-label">{lightLabel}</span></div><a className="scroll-cue" href="#intro">Почувствовать тишину <span aria-hidden="true">↓</span></a></div>
</section>
<section className="introduction pad" id="intro" aria-labelledby="intro-title"><div className="intro-meta reveal"><span className="eyebrow">МАЛЕНЬКИЙ РИТУАЛ</span><span className="eyebrow">БОЛЬШЕ, ЧЕМ СВЕТ</span></div><h2 className="reveal" id="intro-title">Есть вещи, которые<br />возвращают <span>к себе.</span></h2><div className="intro-bottom reveal"><p>Тёплый свет на стене. Знакомый аромат.<br />Свеча, которую выбирают не по случаю —<br />а по ощущению.</p><a className="text-link" href="#collection">С этого начинается ТИХО <span aria-hidden="true">↘</span></a></div></section>
<Catalog />
<Aroma />
<section className="workshop pad" id="workshop" aria-labelledby="workshop-title"><div className="section-heading reveal"><p className="eyebrow">03 / МАСТЕРСКАЯ ТИХО</p><span className="eyebrow">СДЕЛАНО РУКАМИ. ВЫБРАНО СЕРДЦЕМ.</span></div><div className="workshop-grid"><div className="workshop-photo reveal"><img src={c("image.about", "/assets/workshop.webp")} alt="Ручная заливка свечи: тёплый воск, фитиль и руки мастера" width="1024" height="1536" loading="lazy" /><span>Всё начинается с прикосновения.</span></div><div className="workshop-copy"><h2 className="reveal" id="workshop-title">У тепла<br />есть <span>автор.</span></h2><p className="reveal">{c("about.lead", "ТИХО — мастерская свечей ручной работы. Нам близки простые формы, выразительные ароматы и вещи, рядом с которыми хочется задержаться.")}</p><p className="reveal">{c("about.text", "Мы создаём свечи для обычных вечеров, которые однажды становятся любимыми воспоминаниями.")}</p><div className="craft-list"><div className="reveal"><span>01</span><h3>Форма</h3><p>Рельеф, который хочется рассматривать. Свет, меняющий каждую грань.</p></div><div className="reveal"><span>02</span><h3>Аромат</h3><p>Композиция с характером — от первой ноты до мягкого шлейфа.</p></div><div className="reveal"><span>03</span><h3>Прикосновение</h3><p>Ручная работа, которая оставляет каждой свече её индивидуальность.</p></div></div></div></div></section>
<Atelier />
<section className="care pad" aria-labelledby="care-title"><div className="care-heading"><p className="eyebrow">ПРОСТОЙ РИТУАЛ</p><h2 id="care-title">Чтобы свет<br />радовал дольше.</h2></div><div className="care-items"><details><summary>Перед первым огнём <span aria-hidden="true">+</span></summary><p>Установите свечу на устойчивую негорючую подставку, вдали от сквозняков и предметов, которые могут загореться. Следуйте инструкции, приложенной к свече.</p></details><details><summary>Пока свеча горит <span aria-hidden="true">+</span></summary><p>Оставайтесь рядом. Берегите свечу от детей и животных и не перемещайте её, пока воск горячий.</p></details><details><summary>Когда вечер закончился <span aria-hidden="true">+</span></summary><p>Аккуратно погасите пламя и дайте воску полностью остыть. Храните свечу вдали от прямого солнца и источников тепла.</p></details></div></section>
<section className="closing pad"><p className="eyebrow reveal">ВАШ МАЛЕНЬКИЙ ПЛАН НА ВЕЧЕР</p><h2 className="reveal">Меньше спешки.<br /><span>Больше себя.</span></h2><a className="button button-light reveal" href="#collection">Выбрать свою свечу <span aria-hidden="true">↗</span></a></section>
</main>
<footer className="footer pad"><div className="footer-top"><span>Аромат. Свет. Тишина.</span><a href="#home">Вернуться наверх ↑</a></div><a className="footer-wordmark" href="#home" aria-label="ТИХО — наверх">тихо<span>.</span></a><div className="footer-bottom"><span>© ТИХО / TIXO, {new Date().getFullYear()}</span><a href="#workshop">Мастерская свечей ручной работы</a><span>Создано для ваших вечеров</span></div></footer>
<CartOverlay />
</div></ShoppingProvider>;
}
