"use client";
/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useRef, useState } from "react";
import { type CandleShape, type Product, type Scent, type CandleColor, type CandleForm, type AromaProfile, emptyAromaProfile, productImages, MAX_PRODUCT_IMAGES } from "@/lib/catalog";
import { aromaPortraits } from "@/lib/aroma-portraits";
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
  const [draft, setDraft] = useState(product);
  const [photos, setPhotos] = useState<{ src?: string; file?: File }[]>(() => productImages(product).map(src => ({ src })));
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const data = new FormData();
    for (const key of ["formId", "colorId", "scentId", "notes", "price", "stock", "published"] as const) data.set(key, String(draft[key] ?? ""));
    data.set("expectedStock", String(product.stock));
    let upload = 0;
    data.set("photos", JSON.stringify(photos.map(photo => { if (photo.file) { data.append("images", photo.file); return { upload: upload++ }; } return { url: photo.src }; })));
    data.set("expectedImages", JSON.stringify(productImages(product)));
    try { await onSave(data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить свечу"); } finally { setSaving(false); }
  };
  const selectedForm = forms.find(form => form.id === draft.formId);
  const selectedColor = colors.find(color => color.id === draft.colorId);
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
      <div className="candle-image-field"><h3>Фотографии свечи <small>{photos.length} / {MAX_PRODUCT_IMAGES}</small></h3>
        {!!photos.length && <div className="editor-photo-grid">{photos.map((photo, index) => <div className="editor-photo" key={photo.src ?? `${photo.file?.name}-${index}`}><ImagePreview file={photo.file} src={photo.src} alt={`Фото свечи ${index + 1}`} /><span className="photo-role">{index === 0 ? "Главное фото" : `Фото ${index + 1}`}</span><div className="editor-photo-actions"><button type="button" disabled={index === 0} onClick={() => setPhotos([photo, ...photos.filter((_, i) => i !== index)])}>{index === 0 ? "Главное" : "Сделать главным"}</button><button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => setPhotos(photos.filter((_, i) => i !== index))}>Убрать фото</button></div></div>)}</div>}
        {!photos.length && <div className="candle-editor-silhouette"><CandlePreview shape={selectedForm?.shape} silhouette={selectedForm?.silhouette} color={selectedColor?.hex} label={selectedForm?.name ?? "Форма свечи"} /></div>}
        <label className="photo-upload-label">Добавить фотографии<input type="file" multiple aria-label="Фотографии свечи" accept="image/jpeg,image/png,image/webp" disabled={photos.length >= MAX_PRODUCT_IMAGES} onChange={event => {
          const files = Array.from(event.target.files ?? []); event.target.value = "";
          if (photos.length + files.length > MAX_PRODUCT_IMAGES) { setError(`Можно добавить до ${MAX_PRODUCT_IMAGES} фотографий.`); return; }
          if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size)) { setError("Фото: JPG, PNG или WebP, до 10 МБ каждое."); return; }
          setError(""); setPhotos([...photos, ...files.map(file => ({ file }))]);
        }} /></label><p className="image-field-hint">Главное фото показывается в галерее и корзине, остальные — в карточке свечи. До {MAX_PRODUCT_IMAGES} фото, JPG, PNG или WebP, до 10 МБ каждое. Без фотографий показывается силуэт формы в цвете свечи.</p>
      </div>
      <div className="editor-row"><label>Цена, ₽<input type="number" min="0" max="10000000" step="1" required value={draft.price} onChange={event => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label>Остаток, шт.<input type="number" min="0" max="1000000" step="1" required value={draft.stock} onChange={event => setDraft({ ...draft, stock: Number(event.target.value) })} /></label></div>
      <label className="inline-check"><input type="checkbox" checked={draft.published} onChange={event => setDraft({ ...draft, published: event.target.checked })} />Показывать свечу на сайте</label>
    </fieldset>{error && <p className="editor-error" role="alert">{error}</p>}<footer><button type="button" className="cancel" disabled={saving} onClick={onClose}>Отмена</button><button className="save" disabled={saving || choices.some(choice => !draft[choice.key])}>{saving ? "Сохраняем…" : "Сохранить свечу"}</button></footer>
  </form></Modal>;
}

export function ScentEditor({ scent, onSave, onClose }: { scent: Scent; onSave: (scent: Scent, file?: File) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState({ ...scent, profile: scent.profile ?? emptyAromaProfile() });
  const [imageFile, setImageFile] = useState<File>();
  const [notes, setNotes] = useState(scent.notes.join(", "));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { await onSave({ ...draft, notes: notes.split(",").map(n => n.trim()).filter(Boolean) }, imageFile); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить аромат"); } finally { setSaving(false); } };
  return <Modal className="product-editor scent-editor" label="Редактирование аромата" onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Общий справочник</span><h2>{scent.id ? "Аромат" : "Новый аромат"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}>

      <label>Название аромата<input required maxLength={120} value={draft.name} placeholder="Например, Вишня и миндаль" onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <div className="scent-portrait-editor"><div className="scent-editor-photo"><ImagePreview file={imageFile} src={draft.image} alt={`Изображение аромата ${draft.name}`} /></div><label>Изображение из библиотеки<select value={imageFile ? "" : draft.image ?? ""} onChange={event => { setDraft({ ...draft, image: event.target.value || null }); setImageFile(undefined); }}><option value="">{imageFile ? "Будет загружено новое фото" : "Без изображения"}</option>{draft.image && !aromaPortraits.some(portrait => portrait.image === draft.image) && <option value={draft.image}>Загруженное изображение</option>}{aromaPortraits.map(portrait => <option key={portrait.slug} value={portrait.image}>{portrait.name}</option>)}</select></label><label>Загрузить своё изображение<input key={draft.image ?? "empty"} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Фото аромата" onChange={event => { const file = event.target.files?.[0]; if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError("Фото: JPG, PNG или WebP, до 10 МБ"); event.target.value = ""; return; } setError(""); setImageFile(file); }} /></label>{(imageFile || draft.image) && <button type="button" className="text-action" onClick={() => { setImageFile(undefined); setDraft({ ...draft, image: null }); }}>Убрать изображение аромата</button>}<p className="editor-hint">Изображение появляется в блоке «02 / ИСКУССТВО АРОМАТА» после первого экрана. Выберите готовый образ или загрузите JPG, PNG, WebP до 10 МБ. Главы аромата ниже описывают вашу композицию.</p></div>
      <label>Описание<textarea maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Ноты через запятую<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="вишня, миндаль, ваниль" /></label>
      <p className="editor-hint">Этот аромат можно выбрать для готовой и авторской свечи. Главы ниже используются в блоках «Искусство аромата» и «Побыть мастером».</p><AromaProfileFields profile={draft.profile} onChange={profile => setDraft({ ...draft, profile })} />
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

function SilhouettePreview({ file, src, shape }: { file?: File; src?: string | null; shape?: CandleShape | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!file || !ref.current) return;
    const url = URL.createObjectURL(file);
    const element = ref.current.querySelector<HTMLElement>(".wax-uploaded");
    element?.style.setProperty("--silhouette", `url(${JSON.stringify(url)})`);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div ref={ref} className="editor-preview silhouette-preview"><CandlePreview silhouette={file ? "about:blank" : src} shape={shape} color="#8a7050" label="Предпросмотр силуэта формы" /></div>;
}

export function FormEditor({ form, onSave, onClose }: { form: CandleForm; onSave: (data: FormData) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(form); const [file, setFile] = useState<File>(); const [remove, setRemove] = useState(false);
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const data = new FormData(); data.set("name", draft.name); data.set("active", String(draft.active)); data.set("removeSilhouette", String(remove));
    if (file) data.set("silhouette", file);
    try { await onSave(data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить форму"); } finally { setSaving(false); }
  };
  return <Modal className="product-editor form-editor" label="Редактирование формы" onClose={() => { if (!saving) onClose(); }}><form onSubmit={save}>
    <header><div><span className="admin-kicker">Форма / силуэт</span><h2>{form.id ? "Редактировать форму" : "Новая форма"}</h2></div><button type="button" disabled={saving} aria-label="Закрыть редактор" onClick={onClose}>×</button></header>
    <fieldset className="editor-fields" disabled={saving}><label>Название формы / силуэта<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Например, Колонна" /></label><SilhouettePreview file={file} src={remove ? null : form.silhouette} shape={remove ? null : form.shape} /><label className="silhouette-upload">Изображение силуэта<input key={remove ? "removed" : "silhouette"} type="file" accept="image/png,image/webp" aria-label="Загрузить силуэт" onChange={event => { setFile(event.target.files?.[0]); setRemove(false); }} /></label>{(file || (!remove && (form.silhouette || form.shape))) && <button type="button" className="text-action" onClick={() => { setFile(undefined); setRemove(true); }}>Убрать силуэт</button>}<p className="editor-hint">PNG или WebP на прозрачном фоне, до 10 МБ. Силуэт окрашивается в цвет свечи и показывается, если у неё нет фотографии.</p><label className="inline-check"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Форма доступна на сайте</label></fieldset>
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
    <fieldset disabled={saving} className="aroma-profile-fields"><AromaProfileFields profile={profile} onChange={setProfile} /></fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}<footer><p>Изменения появятся в блоках «Искусство аромата» и «Побыть мастером».</p><button className="save" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить разбор аромата"}</button></footer>
  </form>;
}

function AromaProfileFields({ profile, onChange }: { profile: AromaProfile; onChange: (profile: AromaProfile) => void }) {
  return (<fieldset className="aroma-chapters" >{([{ key: "top", title: "Начало", hint: "Первое впечатление" }, { key: "heart", title: "Сердце", hint: "Характер композиции" }, { key: "base", title: "Шлейф", hint: "Послевкусие" }] as const).map((chapter, index) => <section key={chapter.key} className="aroma-chapter"><header><span>0{index + 1}</span><h3>{chapter.title}</h3></header><p>{chapter.hint}</p><label>Ноты · {chapter.title.toLowerCase()}<input maxLength={240} value={profile[chapter.key].notes} onChange={event => onChange({ ...profile, [chapter.key]: { ...profile[chapter.key], notes: event.target.value } })} placeholder="Например, бергамот · лимон" /></label><label>Описание · {chapter.title.toLowerCase()}<textarea maxLength={2000} rows={5} value={profile[chapter.key].description} onChange={event => onChange({ ...profile, [chapter.key]: { ...profile[chapter.key], description: event.target.value } })} placeholder="Как раскрывается аромат на этом этапе" /></label></section>)}</fieldset>);
}
