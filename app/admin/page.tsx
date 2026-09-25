"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { money, productShape, type CandleForm, type CandleColor, type Product, type Scent, type OrderItem } from "@/lib/catalog";
import { recipeFormName, atelierColors, atelierTopNotes, atelierHeartNotes, atelierBaseNotes } from "@/lib/atelier";
import { ImagePreview, ProductEditor, ScentEditor, ColorEditor, FormEditor, StockEditor, AromaProfileEditor } from "./editors";
import { CandlePreview } from "../components/candle-preview";
import "./admin.css";

type Order = { id:number; orderNumber:string; customerName:string; phone:string; email:string; address:string; delivery:string; comment:string; items:OrderItem[]; total:number; status:"new"|"in_progress"|"completed"; createdAt:string; stockReserved:boolean };
type Field = { key:string; label:string; kind:"text"|"image"; fallback:string };
type Tab = "products" | "forms" | "colors" | "scents" | "aroma" | "orders" | "content";
const empty: Product = { id:0, name:"", category:"", categoryId:null, categorySlug:null, notes:"", price:0, stock:0, published:false, image:null, hasVariants:false, variants:[] };
const emptyScent: Scent = { id:0, name:"", description:"", notes:[], active:true };
const emptyForm: CandleForm = { id:0, name:"", shape:null, silhouette:null, active:true };
const emptyColor: CandleColor = { id:0, name:"", hex:"#e8ddca", active:true };
const fields: Field[] = [
  { key: "atelier.hero.title", label: "Первый экран — заголовок", kind: "text", fallback: "Пусть мир" },
  { key: "atelier.hero.emphasis", label: "Первый экран — акцент", kind: "text", fallback: "подождёт." },
  { key: "atelier.hero.description", label: "Первый экран — описание", kind: "text", fallback: "Один огонь. Любимый аромат.\nИ вечер, который снова принадлежит вам." },
  { key: "atelier.about.lead", label: "Мастерская — вводный текст", kind: "text", fallback: "ТИХО — мастерская свечей ручной работы. Нам близки простые формы, выразительные ароматы и вещи, рядом с которыми хочется задержаться." },
  { key: "atelier.about.text", label: "Мастерская — основной текст", kind: "text", fallback: "Мы создаём свечи для обычных вечеров, которые однажды становятся любимыми воспоминаниями." },
  { key: "atelier.image.hero", label: "Фото первого экрана", kind: "image", fallback: "/assets/hero.png" },
  { key: "atelier.image.about", label: "Фото мастерской", kind: "image", fallback: "/assets/workshop.webp" },
];

const needsQuote = (order: Order) => order.items.some(item => item.quotePending);
const orderAmount = (order: Order) => needsQuote(order)
  ? (order.total > 0 ? `${money(order.total)} + по запросу` : "Стоимость по запросу")
  : money(order.total);
const groupAmount = (group: Order[]) => group.every(order => needsQuote(order) && order.total === 0) && group.length
  ? "По запросу"
  : money(group.reduce((sum, order) => sum + order.total, 0));
const groupNote = (group: Order[]) => {
  const pending = group.filter(needsQuote).length;
  return `${group.length} заказов${pending ? ` · ${pending} с индивидуальными свечами, их стоимость не включена` : ""}`;
};


class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(data?.error || (response.status === 401 ? "Сессия завершилась. Войдите снова." : "Сервер не смог загрузить данные. Попробуйте обновить раздел."), response.status);
  if (data === null) throw new RequestError("Сервер вернул некорректный ответ. Попробуйте ещё раз.", 502);
  return data as T;
}
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function Admin() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loadErrors, setLoadErrors] = useState<Partial<Record<Tab, string>>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [scents, setScents] = useState<Scent[]>([]);
  const [colors, setColors] = useState<CandleColor[]>([]);
  const [editingColor, setEditingColor] = useState<CandleColor | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [content, setContent] = useState<Record<string, { value:string; kind:string }>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingScent, setEditingScent] = useState<Scent | null>(null);
  const [forms, setForms] = useState<CandleForm[]>([]);
  const [editingForm, setEditingForm] = useState<CandleForm | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [aromaId, setAromaId] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoadingData(true);
    const sections: Tab[] = ["products", "scents", "colors", "orders", "content", "forms"];
    const results = await Promise.allSettled([
      request<Product[]>("/api/products?admin=1").then(setProducts),
      request<Scent[]>("/api/scents?admin=1").then(setScents),
      request<CandleColor[]>("/api/colors?admin=1").then(setColors),
      request<Order[]>("/api/orders").then(setOrders),
      request<Record<string, { value:string; kind:string }>>("/api/content").then(setContent),
      request<CandleForm[]>("/api/forms?admin=1").then(setForms),
    ]);
    const failures: Partial<Record<Tab, string>> = {};
    results.forEach((result, index) => {
      if (result.status !== "rejected") return;
      failures[sections[index]] = result.reason instanceof Error ? result.reason.message : "Не удалось загрузить раздел";
      if (result.reason instanceof RequestError && result.reason.status === 401) { setAuth(false); setError(result.reason.message); }
    });
    failures.aroma = failures.scents;
    setLoadErrors(failures); setLoadingData(false);
  }, []);
  const checkSession = useCallback(() => request<{ authenticated: boolean }>("/api/admin/session").then(async result => {
    setAuth(result.authenticated);
    if (result.authenticated) await load();
  }).catch(cause => setError(cause instanceof Error ? cause.message : "Ошибка соединения")), [load]);
  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(timer); }, [saved]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения"); if (cause instanceof RequestError && cause.status === 401) setAuth(false); }
    finally { setBusy(false); }
  };
  const login = (event: FormEvent) => { event.preventDefault(); void perform(async () => { await request("/api/admin/login", { method: "POST", ...json({ password }) }); setPassword(""); setAuth(true); await load(); }); };
  const saveProduct = async (form: FormData) => {
    if (!editing) return;
    await request(editing.id ? `/api/products/${editing.id}` : "/api/products", { method: editing.id ? "PATCH" : "POST", body: form });
    setEditing(null); await load(); setSaved(true);
  };
  const saveScent = async (scent: Scent, image?: File) => {
    let payload: RequestInit = json(scent);
    if (image) { const form = new FormData(); form.set("data", JSON.stringify(scent)); form.set("image", image); payload = { body: form }; }
    await request(scent.id ? `/api/scents/${scent.id}` : "/api/scents", { method: scent.id ? "PATCH" : "POST", ...payload });
    setEditingScent(null); await load(); setSaved(true);
  };
  const removeProduct = (product: Product) => { if (confirm(`Удалить свечу «${product.name} · ${product.color?.name ?? "цвет не выбран"} · ${product.scent?.name ?? "аромат не выбран"}» (№ ${product.id})? Она исчезнет из каталога и остатков. История заказов сохранится.`)) void perform(async () => { await request(`/api/products/${product.id}`, { method: "DELETE" }); await load(); setSaved(true); }); };
  const removeScent = (scent: Scent) => { if (confirm(`Удалить аромат «${scent.name}»?`)) void perform(async () => { await request(`/api/scents/${scent.id}`, { method: "DELETE" }); await load(); setSaved(true); }); };
  const saveColor = async (color: CandleColor) => {
    await request(color.id ? `/api/colors/${color.id}` : "/api/colors", { method: color.id ? "PATCH" : "POST", ...json(color) });
    setEditingColor(null); await load(); setSaved(true);
  };
  const removeColor = (color: CandleColor) => { if (confirm(`Удалить цвет «${color.name}»?`)) void perform(async () => { await request(`/api/colors/${color.id}`, { method: "DELETE" }); await load(); setSaved(true); }); };
  const updateStatus = (id: number, status: Order["status"]) => void perform(async () => { await request(`/api/orders/${id}`, { method: "PATCH", ...json({ status }) }); await load(); setSaved(true); });
  const removeOrder = (order: Order) => {
    const restore = order.stockReserved && order.status !== "completed";
    if (confirm(`Удалить заказ ${order.orderNumber}?${restore ? " Свечи вернутся в доступные остатки." : " Остатки не изменятся."}`)) void perform(async () => { await request(`/api/orders/${order.id}`, { method: "DELETE" }); await load(); setSaved(true); });
  };
  const saveContent = async (field: Field, value: string, file?: File) => {
    const form = new FormData(); form.set("key", field.key); form.set("kind", field.kind); form.set("value", value); if (file) form.set("image", file);
    await request("/api/content", { method: "PATCH", body: form }); await load(); setSaved(true);
  };
  const saveForm = async (data: FormData) => {
    if (!editingForm) return;
    await request(editingForm.id ? `/api/forms/${editingForm.id}` : "/api/forms", { method: editingForm.id ? "PATCH" : "POST", body: data });
    setEditingForm(null); await load(); setSaved(true);
  };
  const removeForm = (form: CandleForm) => { if (confirm(`Удалить форму «${form.name}»?`)) void perform(async () => { await request(`/api/forms/${form.id}`, { method: "DELETE" }); await load(); setSaved(true); }); };
  const aromaScent = scents.find(scent => scent.id === aromaId) ?? scents[0];
  const active = orders.filter(order => order.status !== "completed");
  const done = orders.filter(order => order.status === "completed");
  const labels: Record<Tab, string> = { products: "Остатки", forms: "Формы", colors: "Цвета", scents: "Ароматы", aroma: "Искусство аромата", orders: "Заказы", content: "Контент" };
  if (auth === null) return <main className="admin-login"><div className="login-card"><h1>Мастерская ТИХО</h1>{error ? <><p className="editor-error" role="alert">{error}</p><button className="save" onClick={() => { setError(""); void checkSession(); }}>Повторить подключение</button></> : <p role="status">Проверяем подключение…</p>}</div></main>;
  if (!auth) return <main className="admin-login"><form className="login-card" onSubmit={login}><Link className="admin-logo" href="/">ТИХО</Link><span className="admin-kicker">Мастерская</span><h1>Вход в админку</h1><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required autoFocus /></label>{error && <p className="editor-error" role="alert">{error}</p>}<button className="save" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></form></main>;
  return <main className="admin-shell">
    <aside className="admin-sidebar"><Link className="admin-logo" href="/">ТИХО</Link><nav aria-label="Управление магазином">{(Object.keys(labels) as Tab[]).map(key => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setError(""); setTab(key); }} aria-current={tab === key ? "page" : undefined}>{labels[key]}{key === "orders" && orders.some(o => o.status === "new") && <i>{orders.filter(o => o.status === "new").length}</i>}</button>)}</nav><button className="admin-logout" disabled={busy} onClick={() => void perform(async () => { await request("/api/admin/logout", { method: "POST" }); setAuth(false); })}>Выйти</button></aside>
    <section className="admin-workspace"><header className="admin-header"><div><span className="admin-kicker">Управление магазином</span><h1>{labels[tab]}</h1></div><div className="admin-actions"><Link href="/" target="_blank">Открыть сайт ↗</Link>{tab === "products" && <button onClick={() => setEditing({ ...empty })}>Добавить свечу</button>}{tab === "forms" && <button onClick={() => setEditingForm({ ...emptyForm })}>Добавить форму</button>}{tab === "scents" && <button onClick={() => setEditingScent({ ...emptyScent })}>Добавить аромат</button>}{tab === "colors" && <button onClick={() => setEditingColor({ ...emptyColor })}>Добавить цвет</button>}</div></header>
      {(error || loadErrors[tab]) && <p className="editor-error" role="alert">{error || loadErrors[tab]}<button type="button" className="text-action" disabled={busy || loadingData} onClick={() => void perform(load)}>Обновить данные</button></p>}
      {loadingData && <p className="admin-loading" role="status">Обновляем данные…</p>}
      {tab === "scents" && <><p className="admin-intro">Ароматы для свечей, фильтра галереи и блока «Побыть мастером». В редакторе аромата заполните его три главы: начало, сердце и шлейф.</p>{scents.length === 0 ? <div className="empty-admin"><h2>Начните с первого аромата</h2><p>Укажите название и ноты композиции.</p><button className="save" onClick={() => setEditingScent({ ...emptyScent })}>Создать аромат</button></div> : <div className="scent-admin-grid">{scents.map(scent => <article className="scent-admin-card" key={scent.id}>{scent.image && <img className="scent-admin-portrait" src={scent.image} alt={scent.name} loading="lazy" />}<div className="scent-admin-body"><span className="admin-kicker">{scent.active ? "На сайте" : "Отключён"} · {products.filter(p => p.scentId === scent.id).length} позиций</span><h2>{scent.name}</h2><p>{scent.description}</p><div className="category-notes">{scent.notes.map((note, index) => <span key={`${note}-${index}`}>{note}</span>)}</div><footer><button onClick={() => setEditingScent(scent)}>Редактировать</button><button disabled={busy} onClick={() => removeScent(scent)}>Удалить</button></footer></div></article>)}</div>}</>}
      {tab === "colors" && <><p className="admin-intro">Названия и оттенки для выпадающего списка свечи и круглого фильтра галереи. Цвет и аромат выбираются независимо.</p>{!colors.length && <p className="empty-admin">Добавьте первый цвет в палитру.</p>}<div className="scent-admin-grid">{colors.map(color => <article className="scent-admin-card" key={color.id}><div className="scent-admin-color" style={{ background: color.hex }}><span>{color.name}</span></div><div className="scent-admin-body"><span className="admin-kicker">{color.active ? "На сайте" : "Отключён"}</span><h2>{color.name}</h2><p>{color.hex.toUpperCase()}</p><footer><button onClick={() => setEditingColor(color)}>Редактировать</button><button disabled={busy} onClick={() => removeColor(color)}>Удалить</button></footer></div></article>)}</div></>}
      {tab === "products" && <Inventory products={products} forms={forms} colors={colors} scents={scents} onEdit={setEditing} onStock={setStockProduct} onDelete={removeProduct} busy={busy || loadingData} />}
      {tab === "forms" && <><p className="admin-intro">Форма — это название и силуэт. Загрузите его один раз: он будет показан у всех свечей этой формы, у которых нет фотографии.</p>{!forms.length && <p className="empty-admin">Добавьте первую форму.</p>}<div className="scent-admin-grid">{forms.map(form => <article className="scent-admin-card" key={form.id}><div className="form-card-preview"><CandlePreview shape={form.shape} silhouette={form.silhouette} color="#8a7050" label={form.name} /></div><div className="scent-admin-body"><span className="admin-kicker">{form.active ? "Доступна" : "Отключена"} · {products.filter(p => p.formId === form.id).length} позиций</span><h2>{form.name}</h2><footer><button onClick={() => setEditingForm(form)}>Редактировать</button><button disabled={busy} onClick={() => removeForm(form)}>Удалить</button></footer></div></article>)}</div></>}
      {tab === "aroma" && <><p className="admin-intro">Выберите конкретный аромат и опишите его раскрытие. Этот разбор не зависит от формы и цвета свечи.</p>{aromaScent ? <><div className="aroma-admin-intro"><img src="/assets/hero.png" alt="Свеча из блока «Искусство аромата»" /><div><label htmlFor="admin-aroma">Аромат для разбора<select id="admin-aroma" value={aromaScent.id} onChange={event => setAromaId(Number(event.target.value))}>{scents.map(scent => <option value={scent.id} key={scent.id}>{scent.name}{!scent.active ? " · отключён" : ""}</option>)}</select></label><p>{aromaScent.description}</p><small>В блоке на сайте остаётся эта фотография.</small></div></div><AromaProfileEditor key={`${aromaScent.id}:${JSON.stringify(aromaScent.profile)}`} scent={aromaScent} onSave={async profile => { await request(`/api/scents/${aromaScent.id}/profile`, { method: "PATCH", ...json(profile) }); await load(); setSaved(true); }} /></> : <div className="empty-admin"><p>Сначала создайте аромат в справочнике.</p><button className="save" onClick={() => setTab("scents")}>К ароматам</button></div>}</>}
      {tab === "orders" && <>
        <div className="admin-stats order-stats">
          <Stat label="Все заказы" value={String(orders.length)} note={`${orders.filter(order => order.status === "new").length} новых`} />
          <Stat label="В процессе" value={groupAmount(active)} note={groupNote(active)} />
          <Stat label="Выполнено" value={groupAmount(done)} note={groupNote(done)} />
        </div>
        <div className="orders-list">{orders.length === 0 ? <div className="empty-admin">Заказов пока нет</div> : orders.map(order => <article className="order-card" key={order.id}>
          <header><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleString("ru-RU")}</span></div><strong>{orderAmount(order)}</strong></header>
          {needsQuote(order) && <p className="order-quote-note">{order.total > 0 ? "В сумме учтены свечи из каталога. Стоимость индивидуальных свечей нужно согласовать с покупателем." : "Индивидуальные свечи: стоимость нужно согласовать с покупателем."}</p>}
          <div className="order-grid">
            <div><b>{order.customerName}</b><a href={`tel:${order.phone}`}>{order.phone}</a><a href={`mailto:${order.email}`}>{order.email}</a><p>{order.address}</p><small>{order.delivery}{order.comment ? ` · ${order.comment}` : ""}</small></div>
            <div className="order-items">{order.items.map((item, index) => <div className="order-line" key={`${order.id}-${item.productId}-${item.variantId ?? index}`}>
              {item.image ? <img src={item.image} alt="" /> : (!item.customRecipe || item.customRecipe.formId !== undefined) && <div className="order-candle-preview"><CandlePreview silhouette={item.silhouette} shape={item.shape} color={item.color} label={item.name} /></div>}
              <div>
                <strong>{item.name} × {item.quantity}</strong>
                {item.customRecipe ? <dl className="order-recipe">
                  <div><dt>Форма</dt><dd>{recipeFormName(item.customRecipe, item.formName)}</dd></div>
                  <div><dt>Цвет</dt><dd>{atelierColors[item.customRecipe.color]}</dd></div>
                  {item.customRecipe.scentId !== undefined ? <><div><dt>Аромат</dt><dd>{item.scentName}</dd></div>{([['top', 'Начало'], ['heart', 'Сердце'], ['base', 'Шлейф']] as const).map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{item.aromaProfile?.[key].notes || "Не указано"}{item.aromaProfile?.[key].description && <small>{item.aromaProfile[key].description}</small>}</dd></div>)}</> : <><div><dt>Начало</dt><dd>{atelierTopNotes[item.customRecipe.top]}</dd></div><div><dt>Сердце</dt><dd>{atelierHeartNotes[item.customRecipe.heart]}</dd></div><div><dt>Шлейф</dt><dd>{atelierBaseNotes[item.customRecipe.base]}</dd></div></>}
                </dl> : item.scentName && <small><i className="order-swatch" style={{ background: item.color }} />{item.scentName} · {item.colorName}</small>}
              </div>
              <b>{item.quotePending ? "По запросу" : money(item.price * item.quantity)}</b>
            </div>)}</div>
          </div>
          <footer><select aria-label={`Статус заказа ${order.orderNumber}`} disabled={busy} value={order.status} onChange={event => updateStatus(order.id, event.target.value as Order["status"])}><option value="new">Новый</option><option value="in_progress">В процессе</option><option value="completed">Выполнен</option></select><button className="delete-order" disabled={busy} onClick={() => removeOrder(order)}>Удалить</button></footer>
        </article>)}</div>
      </>}
      {tab === "content" && <><p className="admin-intro">Тексты и фотографии новой витрины. Анимация пламени доступна на исходном фото первого экрана; загруженное фото будет показано без искажения.</p><div className="content-grid">{fields.map(field => <Content key={`${field.key}-${content[field.key]?.value ?? ""}`} field={field} value={content[field.key]?.value || field.fallback} save={saveContent} />)}</div></>}
    </section>
    {editing && <ProductEditor product={editing} forms={forms} scents={scents} colors={colors} onSave={saveProduct} onClose={() => setEditing(null)} />}
    {editingScent && <ScentEditor scent={editingScent} onSave={saveScent} onClose={() => setEditingScent(null)} />}
    {editingForm && <FormEditor form={editingForm} onSave={saveForm} onClose={() => setEditingForm(null)} />}
    {stockProduct && <StockEditor product={stockProduct} onClose={() => setStockProduct(null)} onSave={async stock => { await request(`/api/products/${stockProduct.id}/stock`, { method: "PATCH", ...json({ stock, expectedStock: stockProduct.stock }) }); setStockProduct(null); await load(); setSaved(true); }} />}
    {editingColor && <ColorEditor color={editingColor} onSave={saveColor} onClose={() => setEditingColor(null)} />}
    <div className={saved ? "admin-toast show" : "admin-toast"} role="status">Изменения сохранены</div>
  </main>;
}
function Stat({ label, value, note }: { label:string; value:string; note:string }) { return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Content({ field, value, save }: { field:Field; value:string; save:(field:Field, value:string, file?:File) => Promise<void> }) {
  const [draft, setDraft] = useState(value); const [file, setFile] = useState<File>(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <article className="content-card"><span className="admin-kicker">{field.kind === "image" ? "Изображение" : "Текст"}</span><h3>{field.label}</h3>{field.kind === "image" ? <><ImagePreview file={file} src={value} /><input type="file" aria-label={field.label} accept="image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0])} /></> : <textarea aria-label={field.label} value={draft} onChange={event => setDraft(event.target.value)} />}{error && <p className="editor-error" role="alert">{error}</p>}<button disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await save(field, draft, file); } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка сохранения"); } finally { setSaving(false); } }}>{saving ? "Сохраняем…" : "Сохранить"}</button></article>;
}

function Inventory({ products, forms, colors, scents, onEdit, onStock, onDelete, busy }: { products: Product[]; forms: CandleForm[]; colors: CandleColor[]; scents: Scent[]; onEdit: (product: Product) => void; onStock: (product: Product) => void; onDelete: (product: Product) => void; busy: boolean }) {
  const [query, setQuery] = useState(""); const [formId, setFormId] = useState(""); const [colorId, setColorId] = useState(""); const [scentId, setScentId] = useState(""); const [stockFilter, setStockFilter] = useState("");
  const filtered = useMemo(() => products.filter(product => `${product.name} ${product.color?.name ?? ""} ${product.scent?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (!formId || product.formId === Number(formId)) && (!colorId || product.colorId === Number(colorId)) && (!scentId || product.scentId === Number(scentId)) && (!stockFilter || (stockFilter === "empty" ? product.stock === 0 : stockFilter === "low" ? product.stock > 0 && product.stock <= 3 : product.stock > 0))), [products, query, formId, colorId, scentId, stockFilter]);
  const groups = useMemo(() => {
    const result = new Map<string, Product[]>();
    for (const product of filtered) {
      const key = product.formId && product.colorId && product.scentId ? `${product.formId}:${product.colorId}:${product.scentId}` : `incomplete:${product.id}`;
      result.set(key, [...(result.get(key) ?? []), product]);
    }
    return [...result.entries()];
  }, [filtered]);
  const incomplete = products.filter(p => !p.formId || !p.colorId || !p.scentId).length;
  return <><p className="admin-intro">Каждая группа — точное сочетание формы, цвета и аромата. Разные цвета или ароматы — отдельные позиции. Внутри группы каждая запись сохраняет свои фото, цену и остаток; заказы уменьшают его автоматически.</p><div className="admin-stats"><Stat label="В наличии" value={String(products.reduce((sum, product) => sum + product.stock, 0))} note="свечей всего, включая черновики" /><Stat label="Заканчиваются" value={String(products.filter(product => product.stock > 0 && product.stock <= 3).length)} note="позиций с остатком 1–3 шт." /><Stat label="Нет в наличии" value={String(products.filter(product => product.stock === 0).length)} note={`из ${products.length} позиций`} /></div>
    {incomplete > 0 && <p className="inventory-notice">У {incomplete} позиций сохранён прежний общий остаток. Нажмите на карандаш и выберите цвет и аромат. Количество сохранится.</p>}
    <div className="admin-table-card"><div className="table-toolbar"><label><input aria-label="Поиск свечей" value={query} onChange={event => setQuery(event.target.value)} placeholder="Форма, цвет или аромат" /></label><span>{filtered.length} позиций · {filtered.reduce((sum, p) => sum + p.stock, 0)} шт.</span></div>
      <div className="inventory-filters">{[{ label: "Форма", all: "Все формы", value: formId, set: setFormId, options: forms }, { label: "Цвет", all: "Все цвета", value: colorId, set: setColorId, options: colors }, { label: "Аромат", all: "Все ароматы", value: scentId, set: setScentId, options: scents }].map(filter => <label key={filter.label}>{filter.label}<select value={filter.value} onChange={event => filter.set(event.target.value)}><option value="">{filter.all}</option>{filter.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}<label>Наличие<select value={stockFilter} onChange={event => setStockFilter(event.target.value)}><option value="">Все остатки</option><option value="available">В наличии</option><option value="low">Заканчиваются · 1–3 шт.</option><option value="empty">Нет в наличии</option></select></label>{(query || formId || colorId || scentId || stockFilter) && <button type="button" className="text-action" onClick={() => { setQuery(""); setFormId(""); setColorId(""); setScentId(""); setStockFilter(""); }}>Сбросить фильтры</button>}</div>
      <div className="inventory-table inventory-groups">{groups.map(([key, candles]) => {
        const first = candles[0];
        return <section className="inventory-group" key={key} aria-label={`${first.name} · ${first.color?.name ?? "Цвет не выбран"} · ${first.scent?.name ?? "Аромат не выбран"}`}>
          <header className="inventory-group-heading"><div className="product-cell"><div className="product-preview">{first.image ? <img src={first.image} alt="" /> : <CandlePreview shape={first.form ? first.form.shape : productShape(first)} silhouette={first.form?.silhouette} color={first.color?.hex ?? "#e8ddca"} />}</div><div><h2>{first.name}</h2><div className="inventory-combination"><span className="inventory-color">{first.color && <i className="admin-swatch" style={{ background: first.color.hex }} />}{first.color?.name ?? "Цвет не выбран"}</span><span>{first.scent?.name ?? "Аромат не выбран"}</span></div></div></div><span className="inventory-group-total">{candles.reduce((sum, product) => sum + product.stock, 0)} шт.<small>{candles.length === 1 ? "1 позиция" : `Позиций: ${candles.length}`}</small></span></header>
          <div className="inventory-entries">{candles.map(product => <div className="inventory-entry" key={product.id} data-product-id={product.id}><div className="inventory-entry-meta"><strong>№ {product.id} · {money(product.price)}</strong><span className={`inventory-status ${product.published ? "published" : ""}`}>{!product.published ? "Черновик" : product.form?.active === false || product.color?.active === false || product.scent?.active === false ? "Скрыта справочником" : "Опубликована"}</span></div><div className="inventory-entry-actions"><button disabled={busy} className={`stock-button ${product.stock === 0 ? "empty" : product.stock <= 3 ? "low" : ""}`} onClick={() => onStock(product)} aria-label={`Изменить остаток свечи № ${product.id}`}><strong>{product.stock}</strong> шт.</button><button type="button" className="inventory-icon-button" disabled={busy} title="Редактировать свечу" aria-label={`Редактировать свечу № ${product.id}`} onClick={() => onEdit(product)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></svg></button><button type="button" className="inventory-icon-button delete" disabled={busy} title="Удалить свечу" aria-label={`Удалить свечу № ${product.id}`} onClick={() => onDelete(product)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button></div></div>)}</div>
        </section>;
      })}{!filtered.length && <p className="empty-admin">Свечи не найдены. Добавьте свечу или измените фильтры.</p>}</div>
    </div></>;
}
