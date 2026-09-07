"use client";
/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useState } from "react";
import { Product, Scent } from "@/lib/catalog";
import { Modal } from "../components/modal";

export function ImagePreview({ file, src, alt = "" }: { file?: File | null; src?: string | null; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (!file) { setUrl(null); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url || src ? <img src={url || src || ""} alt={alt} /> : <span className="image-empty">Добавить фото</span>;
}

type DraftVariant = { id?: number; scentId: number; stock: number; expectedStock?: number; active: boolean; image: string | null; useMainImage: boolean; file?: File };

export function ProductEditor({ product, scents, onSave, onClose }: { product: Product; scents: Scent[]; onSave: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(product);
  const [image, setImage] = useState<File>();
  const [variants, setVariants] = useState<DraftVariant[]>(product.variants.map(v => ({ ...v, expectedStock: v.stock, useMainImage: false })));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState("");
  const updateVariant = (scentId: number, changes: Partial<DraftVariant>) => setVariants(current => current.map(v => v.scentId === scentId ? { ...v, ...changes } : v));
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const form = new FormData();
    for (const key of ["name", "notes", "price", "published"] as const) form.set(key, String(draft[key]));
    form.set("stock", String(variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : draft.stock));
    form.set("expectedStock", String(product.stock));
    form.set("variants", JSON.stringify(variants.map(({ scentId, stock, expectedStock, active, useMainImage }) => ({ scentId, stock, expectedStock, active, useMainImage }))));
    if (image) form.set("image", image);
    variants.forEach(v => { if (v.file) form.set(`variantImage:${v.scentId}`, v.file); });
    try { await onSave(form); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить товар"); }
    finally { setSaving(false); }
  };
  return <Modal className="product-editor" label="Редактирование формы свечи" onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={save}>
      <header><div><span className="admin-kicker">Форма свечи</span><h2>{product.id ? "Редактировать" : "Новая форма"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
      <fieldset disabled={saving} className="editor-fields">
        <label className="image-upload"><ImagePreview file={image} src={product.image} /><span>Основная фотография</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files?.[0])} /></label>
        <label>Название формы<input required maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Например, Ракушка" /></label>
        <label>Описание формы<textarea maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Размер, вес, детали свечи" /></label>
        <div className="editor-row"><label>Цена, ₽<input type="number" min="0" max="10000000" step="1" required value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} /></label><label>{variants.length ? "Всего свечей" : "Остаток исходного варианта"}<input type="number" min="0" max="1000000" step="1" required readOnly={variants.length > 0} value={variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : draft.stock} onChange={e => setDraft({ ...draft, stock: Number(e.target.value) })} /></label></div>
        <div className="variant-editor-heading"><h3>Ароматы этой формы</h3><p>Цвет берётся из общего справочника. Для каждого аромата загрузите фото свечи этого цвета и укажите количество.</p></div>
        {!product.hasVariants && product.id > 0 && <p className="editor-hint">У исходного варианта {product.stock} шт. Когда добавите ароматы, распределите доступные свечи по их остаткам.</p>}
        {variants.map(variant => {
          const scent = scents.find(s => s.id === variant.scentId);
          if (!scent) return null;
          return <section className={`variant-editor${variant.active ? "" : " variant-disabled"}`} key={variant.scentId}>
            <header><i className="admin-swatch" style={{ background: scent.color }} /><div><strong>{scent.name}</strong><small>{scent.colorName}{!scent.active ? " · аромат отключён" : ""}</small></div><label className="variant-toggle"><input type="checkbox" checked={variant.active} onChange={e => updateVariant(variant.scentId, { active: e.target.checked })} />На сайте</label></header>
            <div className="variant-editor-body"><label className="variant-upload"><ImagePreview file={variant.file ?? (variant.useMainImage ? image : null)} src={variant.useMainImage ? draft.image : variant.image} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => updateVariant(variant.scentId, { file: e.target.files?.[0], useMainImage: false })} /><span>Фото варианта</span></label><div><label>Остаток, шт.<input type="number" min="0" max="1000000" step="1" required value={variant.stock} onChange={e => updateVariant(variant.scentId, { stock: Number(e.target.value) })} /></label><label className="inline-check"><input type="checkbox" checked={variant.useMainImage} onChange={e => updateVariant(variant.scentId, { useMainImage: e.target.checked, file: undefined })} />Использовать основное фото</label>{!variant.id && <button type="button" className="text-action" onClick={() => setVariants(current => current.filter(v => v.scentId !== variant.scentId))}>Убрать вариант</button>}</div></div>
          </section>;
        })}
        {scents.length ? <div className="add-variant"><label className="sr-only" htmlFor="add-scent">Добавить аромат</label><select id="add-scent" value={adding} onChange={e => setAdding(e.target.value)}><option value="">Выберите аромат</option>{scents.filter(s => !variants.some(v => v.scentId === s.id)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.colorName}{!s.active ? " (отключён)" : ""}</option>)}</select><button type="button" disabled={!adding} onClick={() => { setVariants(current => [...current, { scentId: Number(adding), stock: 0, active: true, image: null, useMainImage: false }]); setAdding(""); }}>Добавить</button></div> : <p className="editor-hint">Сначала создайте ароматы в разделе «Ароматы». Эту форму можно сохранить и вернуться к вариантам позже.</p>}
        <label className="inline-check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />Опубликовать форму на сайте</label>
      </fieldset>
      {error && <p className="editor-error" role="alert">{error}</p>}
      <footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить форму"}</button></footer>
    </form>
  </Modal>;
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
      <div className="scent-editor-sample" style={{ background: draft.color }}><span>ТИХО</span></div>
      <label>Название аромата<input required maxLength={120} value={draft.name} placeholder="Например, Вишня и миндаль" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Описание<textarea maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Ноты через запятую<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="вишня, миндаль, ваниль" /></label>
      <div className="editor-row"><label>Цвет свечи<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label><label>Код цвета<input required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label></div>
      <label>Название цвета<input required maxLength={80} value={draft.colorName} onChange={e => setDraft({ ...draft, colorName: e.target.value })} placeholder="Например, Вишнёвый" /></label>
      <p className="editor-hint">Этот цвет соответствует одному аромату во всех формах. После смены цвета проверьте фотографии связанных вариантов.</p>
      <label className="inline-check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />Аромат доступен на сайте</label>
    </fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить аромат"}</button></footer>
  </form></Modal>;
}
