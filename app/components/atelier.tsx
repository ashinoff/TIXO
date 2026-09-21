"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  atelierShapes,
  atelierColors,
  atelierTopNotes,
  atelierHeartNotes,
  atelierBaseNotes,
  type Recipe,
} from "@/lib/atelier";
import { useShopping } from "./storefront-commerce";

const initialRecipe: Recipe = {
  shape: "ribbed",
  color: "ivory",
  top: "bergamot",
  heart: "honey",
  base: "tonka",
};

const colorPositions: Record<Recipe["color"], string> = {
  black: "0%",
  ivory: "33.333333%",
  red: "66.666667%",
  rose: "100%",
};

const pigments: Record<Recipe["color"], string> = {
  black: "#28251f",
  ivory: "#e7d9bc",
  red: "#742930",
  rose: "#be9596",
};

const steps = ["Форма", "Цвет", "Аромат", "Результат"];
const chapters = [
  "01 / ЛИТЕЙНЫЙ СТОЛ",
  "02 / ПАЛИТРА МАСТЕРА",
  "03 / БИБЛИОТЕКА АРОМАТОВ",
  "04 / ВАШ АВТОРСКИЙ ЭСКИЗ",
];
const nextLabels = ["К цвету", "К аромату", "Моя свеча"];

function animateReveal(element: HTMLElement | null, duration: number, distance: number) {
  if (!element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.getAnimations().forEach(animation => animation.cancel());
  const animation = element.animate(
    [{ opacity: 0.3, transform: `translateY(${distance}px)` }, { opacity: 1, transform: "translateY(0)" }],
    { duration, easing: "cubic-bezier(.22,1,.36,1)" },
  );
  return () => animation.cancel();
}

function NoteChoices<T extends string>({
  title,
  legend,
  name,
  options,
  value,
  onChange,
}: {
  title: string;
  legend: string;
  name: string;
  options: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ingredient-group">
      <span className="ingredient-label">{title}</span>
      <fieldset className="ingredient-options">
        <legend className="sr-only">{legend}</legend>
        {(Object.keys(options) as T[]).map(option => (
          <label key={option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{options[option]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export function Atelier() {
  const { addCustom } = useShopping();
  const [recipe, setRecipe] = useState<Recipe>(initialRecipe);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const candleRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const recipeMounted = useRef(false);
  const stepMounted = useRef(false);

  useEffect(() => {
    if (!recipeMounted.current) { recipeMounted.current = true; return; }
    return animateReveal(candleRef.current, 650, 6);
  }, [recipe]);

  useEffect(() => {
    if (!stepMounted.current) { stepMounted.current = true; return; }
    return animateReveal(panelRefs.current[step], 470, 8);
  }, [step]);

  const updateRecipe = <K extends keyof Recipe>(field: K, value: Recipe[K]) => {
    setRecipe(previous => ({ ...previous, [field]: value }));
    setStatus("");
  };

  const goToStep = (next: number, focus = false) => {
    if (next < 0 || next >= steps.length) return;
    setStep(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % steps.length; break;
      case "ArrowLeft": next = (index + steps.length - 1) % steps.length; break;
      case "Home": next = 0; break;
      case "End": next = steps.length - 1; break;
      default: return;
    }
    event.preventDefault();
    goToStep(next, true);
  };

  const addRecipe = () => {
    try {
      // Keep an independent snapshot so later experiments never change the cart.
      const added = addCustom(Object.freeze({ ...recipe }));
      setStatus(added
        ? "Ваша композиция добавлена в корзину. Можно продолжить экспериментировать."
        : "Не удалось добавить свечу. Проверьте количество и текущий заказ в корзине.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось добавить свечу. Попробуйте ещё раз.");
    }
  };

  const summary = [
    ["Форма", atelierShapes[recipe.shape]],
    ["Цвет", atelierColors[recipe.color]],
    ["Начало", atelierTopNotes[recipe.top]],
    ["Сердце", atelierHeartNotes[recipe.heart]],
    ["Шлейф", atelierBaseNotes[recipe.base]],
  ];

  return (
    <section className="studio pad" id="studio" aria-labelledby="studio-title" data-step={step}>
      <div className="studio-heading">
        <div><p className="eyebrow">ВАШЕ МЕСТО В МАСТЕРСКОЙ</p><h2 id="studio-title">Побыть <span>мастером.</span></h2></div>
        <p>От первой формы до собственного аромата.<br />Создайте свечу, которой ещё нет в коллекции.</p>
      </div>
      <div className="studio-layout">
        <div className="studio-scene">
          {/* This photograph and the transparent candle atlas are art-directed assets. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="studio-backdrop" src="/assets/studio-workbench.png" alt="Рабочий стол со свечными формами, красителями и ароматическими ингредиентами" width="1536" height="1024" loading="lazy" />
          <div className="studio-scene-shade" />
          <div className="studio-scene-top"><span className="eyebrow" id="studio-scene-chapter">{chapters[step]}</span><span className="studio-live">Ваша свеча</span></div>
          <div
            ref={candleRef}
            id="studio-candle"
            className="candle-atlas"
            data-shape={recipe.shape}
            style={{ "--color-x": colorPositions[recipe.color] } as CSSProperties}
            role="img"
            aria-label={`${atelierShapes[recipe.shape]}, ${atelierColors[recipe.color]}`}
          />
          <div className="scene-recipe"><span id="scene-form">{atelierShapes[recipe.shape]}</span><p id="scene-ingredients">{[atelierTopNotes[recipe.top], atelierHeartNotes[recipe.heart], atelierBaseNotes[recipe.base]].join(" · ")}</p></div>
          <span className="scene-disclaimer">Визуализация будущей свечи</span>
        </div>
        <div className="studio-controls">
          <div className="studio-steps" role="tablist" aria-label="Этапы создания свечи">
            {steps.map((label, index) => (
              <button
                key={label}
                ref={element => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                aria-selected={step === index}
                aria-controls={`studio-panel-${index}`}
                id={`studio-step-${index}`}
                tabIndex={step === index ? 0 : -1}
                onClick={() => goToStep(index)}
                onKeyDown={event => handleTabKey(event, index)}
              ><span>0{index + 1}</span>{label}</button>
            ))}
          </div>
          <div ref={element => { panelRefs.current[0] = element; }} className="studio-panel" id="studio-panel-0" role="tabpanel" aria-labelledby="studio-step-0" hidden={step !== 0}>
            <p className="eyebrow">НАЧИНАЕМ С ЛИНИЙ</p><h3>Какой будет ваша свеча?</h3><p>Выберите форму — она появится на рабочем столе.</p>
            <fieldset className="shape-options">
              <legend className="sr-only">Форма свечи</legend>
              {(Object.keys(atelierShapes) as Recipe["shape"][]).map(shape => (
                <label key={shape}>
                  <input type="radio" name="candle-shape" value={shape} checked={recipe.shape === shape} onChange={() => updateRecipe("shape", shape)} />
                  <span className="shape-preview candle-atlas" data-shape={shape} aria-hidden="true" />
                  <span>{atelierShapes[shape]}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div ref={element => { panelRefs.current[1] = element; }} className="studio-panel" id="studio-panel-1" role="tabpanel" aria-labelledby="studio-step-1" hidden={step !== 1}>
            <p className="eyebrow">НЕМНОГО ЦВЕТА</p><h3>Придайте воску характер.</h3><p>Тёмный и выразительный или мягкий и светлый?</p>
            <fieldset className="color-options">
              <legend className="sr-only">Цвет свечи</legend>
              {(Object.keys(atelierColors) as Recipe["color"][]).map(color => (
                <label key={color}>
                  <input type="radio" name="candle-color" value={color} checked={recipe.color === color} onChange={() => updateRecipe("color", color)} />
                  <span className="pigment" style={{ "--pigment": pigments[color] } as CSSProperties} aria-hidden="true" />
                  <span>{atelierColors[color]}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div ref={element => { panelRefs.current[2] = element; }} className="studio-panel" id="studio-panel-2" role="tabpanel" aria-labelledby="studio-step-2" hidden={step !== 2}>
            <p className="eyebrow">СОБИРАЕМ КОМПОЗИЦИЮ</p><h3>Три ноты. Ваша история.</h3><p>Выберите по одной ноте для каждой главы аромата.</p>
            <NoteChoices title="01 / Начало" legend="Верхняя нота" name="recipe-top" options={atelierTopNotes} value={recipe.top} onChange={value => updateRecipe("top", value)} />
            <NoteChoices title="02 / Сердце" legend="Нота сердца" name="recipe-heart" options={atelierHeartNotes} value={recipe.heart} onChange={value => updateRecipe("heart", value)} />
            <NoteChoices title="03 / Шлейф" legend="Базовая нота" name="recipe-base" options={atelierBaseNotes} value={recipe.base} onChange={value => updateRecipe("base", value)} />
          </div>
          <div ref={element => { panelRefs.current[3] = element; }} className="studio-panel" id="studio-panel-3" role="tabpanel" aria-labelledby="studio-step-3" hidden={step !== 3}>
            <p className="eyebrow">ВАШ АВТОРСКИЙ ЭСКИЗ</p><h3>Так звучит ваша тишина.</h3>
            <dl className="recipe-summary" id="recipe-summary">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="custom-price">Индивидуальная свеча <span>Стоимость по запросу</span></div>
            <p className="recipe-note">Перед изготовлением мастер согласует форму, состав, сочетаемость нот и стоимость. Оттенок готовой свечи может отличаться от изображения.</p>
            <button type="button" className="button button-light" id="add-custom" onClick={addRecipe}>Добавить мою свечу в корзину <span aria-hidden="true">+</span></button>
            <p className="builder-status" id="builder-status" role="status">{status}</p>
            <p className="recipe-note">Оформите заявку в корзине — мастер свяжется с вами и обсудит вашу композицию.</p>
          </div>
          <div className="studio-navigation">
            <button type="button" id="studio-back" disabled={step === 0} onClick={() => goToStep(step - 1, true)}>← Назад</button>
            <button type="button" id="studio-next" hidden={step === 3} onClick={() => goToStep(step + 1, true)}>{nextLabels[step]} <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </div>
    </section>
  );
}
