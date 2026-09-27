"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { productImages, type Product } from "@/lib/catalog";
import { Modal } from "../components/modal";
import { ArrowIcon } from "../components/ui-icon";
import { CandlePreview } from "../components/candle-preview";

export function CatalogOrder({ products, onSave, onClose, onReload }: {
  products: Product[]; onSave: (ids: number[], expectedIds: number[]) => Promise<void>;
  onClose: () => void; onReload: () => Promise<Product[]>;
}) {
  const [items, setItems] = useState(products);
  const [expectedIds, setExpectedIds] = useState(() => products.map(item => item.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const move = (id: number, position: number) => setItems(current => {
    const from = current.findIndex(item => item.id === id);
    const next = [...current]; const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, position)), 0, item);
    return next;
  });
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить порядок"); }
    finally { setBusy(false); }
  };
  return <Modal className="product-editor catalog-order-editor" label="Порядок каталога" onClose={() => { if (!busy) onClose(); }}>
    <header><div><span className="admin-kicker">Витрина</span><h2>Порядок каталога</h2></div><button type="button" aria-label="Закрыть порядок каталога" disabled={busy} onClick={onClose}>×</button></header>
    <p className="editor-hint">Сдвигайте свечи стрелками или укажите номер места. На сайте они появятся в этом порядке. Скрытые позиции сохраняют своё место, новые добавляются в конец.</p>
    {error && <div className="editor-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void perform(async () => { const fresh = await onReload(); setItems(fresh); setExpectedIds(fresh.map(item => item.id)); })}>Обновить список</button></div>}
    <ol className="catalog-order-list" aria-label="Свечи по порядку">
      {items.map((item, index) => <li key={item.id} data-product-id={item.id}>
        <span className="catalog-order-number">{index + 1}</span>
        <div className="catalog-order-photo">{productImages(item)[0] ? <img src={productImages(item)[0]} alt="" loading="lazy" /> : <CandlePreview shape={item.form?.shape ?? item.shape} silhouette={item.form?.silhouette} color={item.color?.hex} twoTone={item.form?.twoTone} accentColor={item.accentColor?.hex} label={item.name} />}</div>
        <div className="catalog-order-name"><strong>{item.name}</strong><span>{[item.color?.name, item.accentColor?.name, item.scent?.name].filter(Boolean).join(" · ") || `Свеча № ${item.id}`}</span><small>{!item.published || item.form?.active === false || item.color?.active === false || item.accentColor?.active === false || item.scent?.active === false ? "Скрыта на сайте" : item.stock ? "На сайте" : "Нет в наличии"}</small></div>
        <div className="catalog-order-controls">
          <button type="button" aria-label={`Поднять свечу № ${item.id}`} disabled={busy || index === 0} onClick={() => move(item.id, index - 1)}><ArrowIcon direction="up" /></button>
          <button type="button" aria-label={`Опустить свечу № ${item.id}`} disabled={busy || index === items.length - 1} onClick={() => move(item.id, index + 1)}><ArrowIcon direction="down" /></button>
          <label>Место<input key={`${item.id}:${index}`} aria-label={`Место свечи № ${item.id}`} type="number" min="1" max={items.length} step="1" defaultValue={index + 1} disabled={busy} onBlur={event => {
            const value = Number(event.currentTarget.value);
            if (Number.isInteger(value) && value >= 1 && value <= items.length) move(item.id, value - 1);
            else event.currentTarget.value = String(index + 1);
          }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} /></label>
        </div>
      </li>)}
    </ol>
    <footer><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="save" type="button" disabled={busy} onClick={() => void perform(() => onSave(items.map(item => item.id), expectedIds))}>{busy ? "Сохраняем…" : "Сохранить порядок"}</button></footer>
  </Modal>;
}
