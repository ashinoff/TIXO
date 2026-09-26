"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  atelierColors,
  atelierColorHex,
  type Recipe,
  type ScentRecipe,
} from "@/lib/atelier";
import { CandlePreview } from "./candle-preview";
import { WorkshopScene } from "./workshop-scene";
import { ArrowIcon } from "./ui-icon";
import "./workshop.css";
import { useShopping } from "./storefront-commerce";

const initialRecipe: ScentRecipe = {
  formId: 0,
  color: "ivory",
  scentId: 0,
};

const steps = ["Аромат", "Форма", "Цвет", "Результат"];
const nextLabels = ["К форме свечи", "Добавить цвет", "Моя свеча"];

export function Atelier() {
  const { addCustom, forms, formsLoading, formsError, loadForms, scents, loading, catalogError, loadCatalog, locked } = useShopping();
  const [recipe, setRecipe] = useState<ScentRecipe>(initialRecipe);
  const selectedForm = recipe.formId === 0 ? forms[0] : forms.find(form => form.id === recipe.formId);
  const selectedScent = recipe.scentId === 0 ? scents[0] : scents.find(scent => scent.id === recipe.scentId);
  const scentReady = !!selectedScent && !loading && !catalogError;
  const formName = selectedForm?.name ?? "Выберите форму";
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [scentSearch, setScentSearch] = useState("");
  const [formSearch, setFormSearch] = useState("");
  const visibleScents = scents.filter(scent => scent.name.toLocaleLowerCase().includes(scentSearch.trim().toLocaleLowerCase()));
  const visibleForms = forms.filter(form => form.name.toLocaleLowerCase().includes(formSearch.trim().toLocaleLowerCase()));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const updateRecipe = <K extends keyof ScentRecipe>(field: K, value: ScentRecipe[K]) => {
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
    if (!selectedForm || formsLoading || formsError || !scentReady || locked) return;
    try {
      // Keep an independent snapshot so later experiments never change the cart.
      const added = addCustom(Object.freeze({ ...recipe, formId: selectedForm.id, scentId: selectedScent!.id }));
      setStatus(added
        ? "Ваша композиция добавлена в корзину. Можно продолжить экспериментировать."
        : "Не удалось добавить свечу. Проверьте количество и текущий заказ в корзине.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось добавить свечу. Попробуйте ещё раз.");
    }
  };

  const summary = [
    ["Аромат", selectedScent?.name ?? "Выберите аромат"],
    ["Форма", formName],
    ["Цвет", atelierColors[recipe.color]],
  ];

  return (
    <section className="studio pad" id="studio" aria-labelledby="studio-title" data-step={step}>
      <div className="studio-heading">
        <div><p className="eyebrow">04 / СДЕЛАЙ САМ · В СВОЁМ РИТМЕ</p><h2 id="studio-title">Твоя <span>мастерская.</span></h2></div>
        <p>Сначала ощущение. Затем форма и цвет.<br /> Собери свечу, в которой всё — по-твоему.</p>
      </div>
      <div className="studio-layout">
        <WorkshopScene scent={selectedScent} />
        <div className="studio-scene">
          <div className="studio-still-life">
            {/* The stone and candle share one fixed coordinate system on every step. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="studio-plinth" src="/assets/workshop-stone.webp" alt="" width="1100" height="733" loading="lazy" />
            <div id="studio-candle" className="studio-form-preview" data-form-id={selectedForm?.id}>
              <CandlePreview silhouette={selectedForm?.silhouette} shape={selectedForm?.shape} color={atelierColorHex[recipe.color]} label={`${formName}, ${atelierColors[recipe.color]}`} />
            </div>
          </div>
          <div className="scene-recipe"><span id="scene-form">{formName}</span><p id="scene-ingredients">{atelierColors[recipe.color]} · {selectedScent?.name ?? "Выберите аромат"}</p></div>
          <span className="scene-disclaimer">Эскиз твоей будущей свечи</span>
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
          <div className="studio-panel" id="studio-panel-0" role="tabpanel" aria-labelledby="studio-step-0" hidden={step !== 0}>
            <p className="eyebrow">01 / НАЧНИ С ОЩУЩЕНИЯ</p><h3>Как звучит твоя тишина?</h3><p>Выбери аромат. Его история раскроется слева — от первой ноты до шлейфа.</p>
            {loading && <p role="status" className="builder-form-message">Загружаем ароматы…</p>}
            {catalogError && <div role="alert" className="builder-form-message">Не удалось загрузить ароматы.<button type="button" className="text-link" onClick={() => void loadCatalog()}>Попробовать ещё раз <ArrowIcon /></button></div>}
            {!loading && !catalogError && !scents.length && <p className="builder-form-message">Мастерская готовит новые ароматы. Загляните немного позже.</p>}
            {!loading && !catalogError && recipe.scentId !== 0 && !selectedScent && scents.length > 0 && <p role="status" className="builder-form-message">Этот аромат больше недоступен. Выберите другой.</p>}
            <label className="studio-search"><span className="sr-only">Найти аромат в мастерской</span><input type="search" placeholder="Найти свой аромат" value={scentSearch} onChange={event => setScentSearch(event.target.value)} /><span aria-hidden="true">⌕</span></label>
            <fieldset className="builder-scent-options studio-options-window" disabled={loading || !!catalogError}>
              <legend className="sr-only">Аромат авторской свечи</legend>
              {visibleScents.map(scent => <label key={scent.id}><input type="radio" name="recipe-scent" value={scent.id} checked={selectedScent?.id === scent.id} onChange={() => updateRecipe("scentId", scent.id)} /><span><small>{String(scents.indexOf(scent) + 1).padStart(2, "0")}</small>{scent.name}<i aria-hidden="true"><ArrowIcon /></i></span></label>)}
              {!!scents.length && !visibleScents.length && <p className="studio-search-empty">Такого аромата пока нет. Попробуй другое название.</p>}
            </fieldset>
            <p className="studio-selection">Твой аромат <strong>{selectedScent?.name ?? "Ещё не выбран"}</strong></p>

          </div>
          <div className="studio-panel" id="studio-panel-1" role="tabpanel" aria-labelledby="studio-step-1" hidden={step !== 1}>
            <p className="eyebrow">02 / ПРИДАЙ ОЩУЩЕНИЮ ФОРМУ</p><h3>Линии с характером.</h3><p>Выбери силуэт — твоя свеча появится на камне.</p>
            {formsLoading && <p role="status" className="builder-form-message">Загружаем формы мастерской…</p>}
            {formsError && <div role="alert" className="builder-form-message">{formsError}<button type="button" className="text-link" onClick={() => void loadForms()}>Попробовать ещё раз <ArrowIcon /></button></div>}
            {!formsLoading && !formsError && !forms.length && <p className="builder-form-message">Мастерская готовит новые формы. Загляните немного позже.</p>}
            {!formsLoading && !formsError && recipe.formId !== 0 && !selectedForm && forms.length > 0 && <p role="status" className="builder-form-message">Эта форма больше недоступна. Выберите другую.</p>}
            <label className="studio-search"><span className="sr-only">Найти форму в мастерской</span><input type="search" placeholder="Найти форму" value={formSearch} onChange={event => setFormSearch(event.target.value)} /><span aria-hidden="true">⌕</span></label>
            <fieldset className="shape-options workshop-form-options studio-options-window" disabled={formsLoading || !!formsError}>
              <legend className="sr-only">Форма свечи</legend>
              {visibleForms.map(form => (
                <label key={form.id}>
                  <input type="radio" name="candle-shape" value={form.id} checked={selectedForm?.id === form.id} onChange={() => updateRecipe("formId", form.id)} />
                  <span className="shape-preview workshop-shape-preview" aria-hidden="true"><CandlePreview silhouette={form.silhouette} shape={form.shape} color={atelierColorHex[recipe.color]} /></span>
                  <span>{form.name}</span>
                </label>
              ))}
              {!!forms.length && !visibleForms.length && <p className="studio-search-empty">Такой формы пока нет. Попробуй другое название.</p>}
            </fieldset>
            <p className="studio-selection">Твоя форма <strong>{formName}</strong></p>
          </div>
          <div className="studio-panel" id="studio-panel-2" role="tabpanel" aria-labelledby="studio-step-2" hidden={step !== 2}>
            <p className="eyebrow">03 / ТВОЯ ПАЛИТРА</p><h3>Последний оттенок.</h3><p>Тёмный и выразительный или мягкий и светлый?</p>
            <fieldset className="color-options">
              <legend className="sr-only">Цвет свечи</legend>
              {(Object.keys(atelierColors) as Recipe["color"][]).map(color => (
                <label key={color}>
                  <input type="radio" name="candle-color" value={color} checked={recipe.color === color} onChange={() => updateRecipe("color", color)} />
                  <span className="pigment" style={{ "--pigment": atelierColorHex[color] } as CSSProperties} aria-hidden="true" />
                  <span>{atelierColors[color]}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <div className="studio-panel" id="studio-panel-3" role="tabpanel" aria-labelledby="studio-step-3" hidden={step !== 3}>
            <p className="eyebrow">ТВОЙ АВТОРСКИЙ ЭСКИЗ</p><h3>Так звучит твоя тишина.</h3>
            <dl className="recipe-summary" id="recipe-summary">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <div className="custom-price">Индивидуальная свеча <span>Стоимость по запросу</span></div>
            <p className="recipe-note">Перед изготовлением мастер согласует детали изготовления и стоимость. Оттенок готовой свечи может отличаться от изображения.</p>
            <button type="button" className="button button-light" id="add-custom" disabled={!selectedForm || formsLoading || !!formsError || !scentReady || locked} onClick={addRecipe}>Добавить мою свечу в корзину <span aria-hidden="true">+</span></button>
            <p className="builder-status" id="builder-status" role="status">{formsLoading ? "Загружаем формы мастерской…" : formsError || (!selectedForm ? "Для заказа выберите доступную форму на втором шаге." : !scentReady ? "Для заказа выберите доступный аромат на первом шаге." : status)}</p>
            <p className="recipe-note">Оформите заявку в корзине — мастер свяжется с вами и обсудит вашу композицию.</p>
          </div>
          <div className="studio-navigation">
            <button type="button" id="studio-back" disabled={step === 0} onClick={() => goToStep(step - 1, true)}><ArrowIcon direction="left" /> Назад</button>
            <button type="button" id="studio-next" disabled={(step === 0 && !scentReady) || (step === 1 && (!selectedForm || formsLoading || !!formsError))} hidden={step === 3} onClick={() => goToStep(step + 1, true)}>{nextLabels[step]} <span aria-hidden="true"><ArrowIcon direction="right" /></span></button>
          </div>
        </div>
      </div>
    </section>
  );
}
