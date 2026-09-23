"use client";
/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useRef, useState } from "react";
import { candleShapes, productShape, type CandleShape, type Product, type Scent, type CandleColor } from "@/lib/catalog";
import { Modal } from "../components/modal";
import { CandlePreview } from "../components/candle-preview";

export function ImagePreview({ file, src, alt = "" }: { file?: File | null; src?: string | null; alt?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!file) { if (src) element.src = src; return; }
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, src]);
  return file || src ? <img ref={ref} src={src || undefined} alt={alt} /> : <span className="image-empty">Добавить фото</span>;
}

type DraftVariant = { id?: number; scentId: number; colorId: number; stock: number; expectedStock?: number; active: boolean; image: string | null; useMainImage: boolean; file?: File };
const combinationKey = (v: {scentId:number;colorId:number}) => `${v.scentId}:${v.colorId}`;

export function ProductEditor({ product, scents, colors, onSave, onClose }: { product: Product; scents: Scent[]; colors: CandleColor[]; onSave: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(product); const [image, setImage] = useState<File>();
  const [variants, setVariants] = useState<DraftVariant[]>(product.variants.map(v => ({ ...v, expectedStock: v.stock, useMainImage: false })));
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const [addingScent, setAddingScent] = useState(""); const [addingColor, setAddingColor] = useState("");
  const [previewColor, setPreviewColor] = useState(colors.find(c => c.active)?.hex ?? "#f7f5ef");
  const updateVariant = (key: string, changes: Partial<DraftVariant>) => setVariants(current => current.map(v => combinationKey(v) === key ? { ...v, ...changes } : v));
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const form = new FormData();
    for (const key of ["name", "notes", "price", "published"] as const) form.set(key, String(draft[key]));
    form.set("stock", String(variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : draft.stock));
    form.set("expectedStock", String(product.stock)); form.set("shape", productShape(draft));
    form.set("variants", JSON.stringify(variants.map(({ scentId, colorId, stock, expectedStock, active, useMainImage }) => ({ scentId, colorId, stock, expectedStock, active, useMainImage }))));
    if (image) form.set("image", image);
    variants.forEach(v => { if (v.file) form.set(`variantImage:${combinationKey(v)}`, v.file); });
    try { await onSave(form); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить форму"); } finally { setSaving(false); }
  };
  const canAdd = !!addingScent && !!addingColor && !variants.some(v => v.scentId === Number(addingScent) && v.colorId === Number(addingColor));
  return <Modal className="product-editor" label="Редактирование формы свечи" onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Форма свечи</span><h2>{product.id ? "Редактировать" : "Новая форма"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset disabled={saving} className="editor-fields">
      <div className="editor-preview"><CandlePreview shape={productShape(draft)} color={previewColor} label="Предпросмотр формы и цвета" /><div className="editor-preview-colors" role="group" aria-label="Цвет предпросмотра">{colors.filter(c => c.active).map(c => <button type="button" key={c.id} style={{ background: c.hex }} aria-label={c.name} aria-pressed={previewColor === c.hex} onClick={() => setPreviewColor(c.hex)} />)}</div></div>
      <label>Форма для предпросмотра<select value={productShape(draft)} onChange={e => setDraft({ ...draft, shape: e.target.value as CandleShape })}>{Object.entries(candleShapes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className="image-upload"><ImagePreview file={image} src={product.image} /><span>Фотография формы (необязательно)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files?.[0])} /></label>
      <label>Название формы<input required maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Например, Ракушка" /></label>
      <label>Описание формы<textarea maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Размер, вес, детали свечи" /></label>
      <div className="editor-row"><label>Цена, ₽<input type="number" min="0" max="10000000" step="1" required value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} /></label><label>{variants.length ? "Всего свечей" : "Общий остаток, шт."}<input type="number" min="0" max="1000000" step="1" required readOnly={variants.length > 0} value={variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : draft.stock} onChange={e => setDraft({ ...draft, stock: Number(e.target.value) })} /></label></div>
      {!variants.length && <p className="editor-hint">Все включённые цвета и ароматы доступны независимо. Остаток общий для всех сочетаний: продажа любой свечи уменьшает его на одну штуку.</p>}
      <details className="stock-details" open={product.hasVariants || undefined}><summary>Отдельные остатки по цвету и аромату</summary><div className="variant-editor-heading"><p>Для готовых свечей добавьте сочетания цвета и аромата, их фотографии и количество. Покупателю будут доступны только эти сочетания.</p></div>
      {!product.hasVariants && <p className="editor-hint">При переходе на отдельные остатки распределите общее количество между сочетаниями.</p>}
      {variants.map(variant => {
        const scent = scents.find(v => v.id === variant.scentId); const color = colors.find(v => v.id === variant.colorId); const key = combinationKey(variant);
        return <section className={`variant-editor${variant.active ? "" : " variant-disabled"}`} key={key}>
          <header><i className="admin-swatch" style={{ background: color?.hex }} /><div><strong>{scent?.name ?? "Аромат недоступен"}</strong><small>{color?.name ?? "Цвет недоступен"}{!scent?.active || !color?.active ? " · отключён" : ""}</small></div><label className="variant-toggle"><input type="checkbox" checked={variant.active} onChange={e => updateVariant(key, { active: e.target.checked })} />На сайте</label></header>
          <div className="variant-editor-body"><label className="variant-upload"><ImagePreview file={variant.file ?? (variant.useMainImage ? image : null)} src={variant.useMainImage ? draft.image : variant.image} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => updateVariant(key, { file: e.target.files?.[0], useMainImage: false })} /><span>Фото сочетания</span></label><div><label>Остаток, шт.<input type="number" min="0" max="1000000" step="1" required value={variant.stock} onChange={e => updateVariant(key, { stock: Number(e.target.value) })} /></label><label className="inline-check"><input type="checkbox" checked={variant.useMainImage} onChange={e => updateVariant(key, { useMainImage: e.target.checked, file: undefined })} />Использовать основное фото</label>{!variant.id && <button type="button" className="text-action" onClick={() => setVariants(current => current.filter(v => combinationKey(v) !== key))}>Убрать вариант</button>}</div></div>
        </section>;
      })}
      <div className="add-variant independent-variant"><label>Аромат<select value={addingScent} onChange={e => setAddingScent(e.target.value)}><option value="">Выберите аромат</option>{scents.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Цвет<select value={addingColor} onChange={e => setAddingColor(e.target.value)}><option value="">Выберите цвет</option>{colors.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="button" disabled={!canAdd} onClick={() => { setVariants(current => [...current, { scentId: Number(addingScent), colorId: Number(addingColor), stock: 0, active: true, image: null, useMainImage: false }]); setAddingColor(""); }}>Добавить сочетание</button></div>
      {(!colors.length || !scents.length) && <p className="editor-hint">Создайте цвета и ароматы в соответствующих разделах мастерской.</p>}
      </details><label className="inline-check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />Опубликовать форму на сайте</label>
    </fieldset>{error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить форму"}</button></footer>
  </form></Modal>;
}

export function ScentEditor({ scent, onSave, onClose }: { scent: Scent; onSave: (scent: Scent) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(scent);
  const [notes, setNotes] = useState(scent.notes.join(", "));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave({ ...draft, notes: notes.split(",").map(n => n.trim()).filter(Boolean) }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить аромат"); } finally { setSaving(false); } };
  return <Modal className="product-editor scent-editor" label="Редактирование аромата" onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Общий справочник</span><h2>{scent.id ? "Аромат" : "Новый аромат"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}>

      <label>Название аромата<input required maxLength={120} value={draft.name} placeholder="Например, Вишня и миндаль" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Описание<textarea maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Ноты через запятую<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="вишня, миндаль, ваниль" /></label>
      <p className="editor-hint">Аромат доступен в разных цветах. Палитра редактируется отдельно в разделе «Цвета».</p>
      <label className="inline-check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />Аромат доступен на сайте</label>
    </fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить аромат"}</button></footer>
  </form></Modal>;
}

export function ColorEditor({ color, onSave, onClose }: { color: CandleColor; onSave: (color: CandleColor) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(color); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить цвет"); } finally { setSaving(false); } };
  return <Modal className="product-editor color-editor" label="Редактирование цвета" onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Палитра мастерской</span><h2>{color.id ? "Цвет" : "Новый цвет"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}><div className="scent-editor-sample" style={{ background: draft.hex }}><span>ТИХО</span></div><label>Название цвета<input required maxLength={80} value={draft.name} placeholder="Например, Слоновая кость" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><div className="editor-row"><label>Цвет свечи<input type="color" value={draft.hex} onChange={e => setDraft({ ...draft, hex: e.target.value })} /></label><label>Код цвета<input required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={draft.hex} onChange={e => setDraft({ ...draft, hex: e.target.value })} /></label></div><p className="editor-hint">Цвет не связан с ароматом. Он появится в палитре и отдельном фильтре галереи.</p><label className="inline-check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />Цвет доступен на сайте</label></fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить цвет"}</button></footer>
  </form></Modal>;
}
