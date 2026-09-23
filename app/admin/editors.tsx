"use client";
/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useRef, useState } from "react";
import { candleShapes, type CandleShape, type Product, type Scent, type CandleColor, type CandleForm, type AromaProfile, emptyAromaProfile } from "@/lib/catalog";
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

export function ProductEditor({ product, forms, scents, colors, onSave, onClose }: { product: Product; forms: CandleForm[]; scents: Scent[]; colors: CandleColor[]; onSave: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(product); const [image, setImage] = useState<File>();
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const data = new FormData();
    for (const key of ["formId", "colorId", "scentId", "notes", "price", "stock", "published"] as const) data.set(key, String(draft[key] ?? ""));
    data.set("expectedStock", String(product.stock));
    if (image) data.set("image", image);
    try { await onSave(data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить свечу"); } finally { setSaving(false); }
  };
  const choices = [
    { key: "formId", label: "Форма", placeholder: "Выберите форму", options: forms },
    { key: "colorId", label: "Цвет", placeholder: "Выберите цвет", options: colors },
    { key: "scentId", label: "Аромат", placeholder: "Выберите аромат", options: scents },
  ] as const;
  return <Modal className="product-editor" label={product.id ? "Редактирование свечи" : "Новая свеча"} onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Свеча · {product.id ? `№ ${product.id}` : "новая позиция"}</span><h2>{product.id ? "Редактировать свечу" : "Новая свеча"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset disabled={saving} className="editor-fields">
      <div className="candle-selects">{choices.map(({ key, label, placeholder, options }) => <label key={key}>{label}<select required value={draft[key] ?? ""} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })}><option value="" disabled>{placeholder}</option>{options.filter(option => option.active || option.id === draft[key]).map(option => <option key={option.id} value={option.id}>{option.name}{!option.active ? " · отключён" : ""}</option>)}</select></label>)}</div>
      <p className="editor-hint">Новые варианты добавляются в разделах «Формы», «Цвета» и «Ароматы». Остаток относится только к выбранному сочетанию.</p>
      <label>Описание свечи<textarea maxLength={2000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Размер, вес, особенности — напишите своими словами" /></label>
      <label className="image-upload"><ImagePreview file={image} src={product.image} /><span>Фотография свечи · JPG, PNG или WebP, до 10 МБ</span><input type="file" aria-label="Фотография свечи" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0])} /></label>
      <div className="editor-row"><label>Цена, ₽<input type="number" min="0" max="10000000" step="1" required value={draft.price} onChange={event => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label>Остаток, шт.<input type="number" min="0" max="1000000" step="1" required value={draft.stock} onChange={event => setDraft({ ...draft, stock: Number(event.target.value) })} /></label></div>
      <label className="inline-check"><input type="checkbox" checked={draft.published} onChange={event => setDraft({ ...draft, published: event.target.checked })} />Показывать свечу на сайте</label>
    </fieldset>{error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving || choices.some(choice => !draft[choice.key])}>{saving ? "Сохраняем…" : "Сохранить свечу"}</button></footer>
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
      <p className="editor-hint">Аромат появится в списке при создании свечи. Главы «Начало», «Сердце» и «Шлейф» заполняются отдельно в разделе «Искусство аромата».</p>
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

export function FormEditor({ form, onSave, onClose }: { form: CandleForm; onSave: (form: CandleForm) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(form); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <Modal className="product-editor" label="Редактирование формы" onClose={() => { if (!saving) onClose(); }}><form onSubmit={async event => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить форму"); } finally { setSaving(false); } }}>
    <header><div><span className="admin-kicker">Справочник форм</span><h2>{form.id ? "Форма" : "Новая форма"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}><label>Название формы<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Например, Колонна" /></label><label>Силуэт для предпросмотра<select value={draft.shape} onChange={event => setDraft({ ...draft, shape: event.target.value as CandleShape })}>{Object.entries(candleShapes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className="editor-preview"><CandlePreview shape={draft.shape} color="#e8ddca" /></div><p className="editor-hint">Название появится в выпадающем списке свечи. Фотография выбирается отдельно для каждой свечи.</p><label className="inline-check"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Форма доступна на сайте</label></fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить форму"}</button></footer>
  </form></Modal>;
}

export function StockEditor({ product, onSave, onClose }: { product: Product; onSave: (stock: number) => Promise<void>; onClose: () => void }) {
  const [stock, setStock] = useState(product.stock); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <Modal className="product-editor stock-editor" label="Изменение остатка" onClose={() => { if (!saving) onClose(); }}><form onSubmit={async event => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave(stock); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить остаток"); } finally { setSaving(false); } }}>
    <header><div><span className="admin-kicker">Остаток · № {product.id}</span><h2>{product.name}</h2><p>{product.color?.name ?? "Цвет не выбран"} · {product.scent?.name ?? "Аромат не выбран"}</p></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}><p className="stock-current">Сейчас в наличии <strong>{product.stock} шт.</strong></p><label>Новое количество, шт.<input autoFocus type="number" min="0" max="1000000" step="1" required value={stock} onChange={event => setStock(Number(event.target.value))} /></label><p className="editor-hint">Укажите фактическое количество доступных свечей, без уже оформленных заказов. При новом заказе остаток уменьшается автоматически.</p><output className="stock-difference">{stock === product.stock ? "Без изменений" : `${stock > product.stock ? "+" : ""}${stock - product.stock} шт. к текущему остатку`}</output></fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить остаток"}</button></footer>
  </form></Modal>;
}

export function AromaProfileEditor({ scent, onSave }: { scent: Scent; onSave: (profile: AromaProfile) => Promise<void> }) {
  const [profile, setProfile] = useState<AromaProfile>(scent.profile ?? emptyAromaProfile()); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <form className="aroma-profile-editor" onSubmit={async event => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave(profile); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить главы аромата"); } finally { setSaving(false); } }}>
    <fieldset className="aroma-chapters" disabled={saving}>{([{ key: "top", title: "Начало", hint: "Первое впечатление" }, { key: "heart", title: "Сердце", hint: "Характер композиции" }, { key: "base", title: "Шлейф", hint: "Послевкусие" }] as const).map((chapter, index) => <section key={chapter.key} className="aroma-chapter"><header><span>0{index + 1}</span><h3>{chapter.title}</h3></header><p>{chapter.hint}</p><label>Ноты · {chapter.title.toLowerCase()}<input maxLength={240} value={profile[chapter.key].notes} onChange={event => setProfile({ ...profile, [chapter.key]: { ...profile[chapter.key], notes: event.target.value } })} placeholder="Например, бергамот · лимон" /></label><label>Описание · {chapter.title.toLowerCase()}<textarea maxLength={2000} rows={5} value={profile[chapter.key].description} onChange={event => setProfile({ ...profile, [chapter.key]: { ...profile[chapter.key], description: event.target.value } })} placeholder="Как раскрывается аромат на этом этапе" /></label></section>)}</fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}<footer><p>Изменения появятся в блоке «02 / Искусство аромата».</p><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить разбор аромата"}</button></footer>
  </form>;
}
