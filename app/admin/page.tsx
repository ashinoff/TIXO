"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { money, productShape, type Product, type Scent, type OrderItem } from "@/lib/catalog";
import { atelierShapes, atelierColors, atelierTopNotes, atelierHeartNotes, atelierBaseNotes } from "@/lib/atelier";
import { ImagePreview, ProductEditor, ScentEditor } from "./editors";
import { CandlePreview } from "../components/candle-preview";
import "./admin.css";

type Order = { id:number; orderNumber:string; customerName:string; phone:string; email:string; address:string; delivery:string; comment:string; items:OrderItem[]; total:number; status:"new"|"in_progress"|"completed"; createdAt:string; stockReserved:boolean };
type Field = { key:string; label:string; kind:"text"|"image"; fallback:string };
type Tab = "products" | "scents" | "orders" | "content";
const empty: Product = { id:0, name:"", category:"", categoryId:null, categorySlug:null, notes:"", price:0, stock:0, published:false, image:null, hasVariants:false, variants:[] };
const emptyScent: Scent = { id:0, name:"", description:"", notes:[], color:"#a84c51", colorName:"", active:true };
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [content, setContent] = useState<Record<string, { value:string; kind:string }>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingScent, setEditingScent] = useState<Scent | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoadingData(true);
    const sections: Tab[] = ["products", "scents", "orders", "content"];
    const results = await Promise.allSettled([
      request<Product[]>("/api/products?admin=1").then(setProducts),
      request<Scent[]>("/api/scents?admin=1").then(setScents),
      request<Order[]>("/api/orders").then(setOrders),
      request<Record<string, { value:string; kind:string }>>("/api/content").then(setContent),
    ]);
    const failures: Partial<Record<Tab, string>> = {};
    results.forEach((result, index) => {
      if (result.status !== "rejected") return;
      failures[sections[index]] = result.reason instanceof Error ? result.reason.message : "Не удалось загрузить раздел";
      if (result.reason instanceof RequestError && result.reason.status === 401) { setAuth(false); setError(result.reason.message); }
    });
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
  const saveScent = async (scent: Scent) => {
    await request(scent.id ? `/api/scents/${scent.id}` : "/api/scents", { method: scent.id ? "PATCH" : "POST", ...json(scent) });
    setEditingScent(null); await load(); setSaved(true);
  };
  const removeScent = (scent: Scent) => { if (confirm(`Удалить аромат «${scent.name}»?`)) void perform(async () => { await request(`/api/scents/${scent.id}`, { method: "DELETE" }); await load(); setSaved(true); }); };
  const updateStatus = (id: number, status: Order["status"]) => void perform(async () => { await request(`/api/orders/${id}`, { method: "PATCH", ...json({ status }) }); await load(); setSaved(true); });
  const removeOrder = (order: Order) => {
    const restore = order.stockReserved && order.status !== "completed";
    if (confirm(`Удалить заказ ${order.orderNumber}?${restore ? " Свечи вернутся в доступные остатки." : " Остатки не изменятся."}`)) void perform(async () => { await request(`/api/orders/${order.id}`, { method: "DELETE" }); await load(); setSaved(true); });
  };
  const saveContent = async (field: Field, value: string, file?: File) => {
    const form = new FormData(); form.set("key", field.key); form.set("kind", field.kind); form.set("value", value); if (file) form.set("image", file);
    await request("/api/content", { method: "PATCH", body: form }); await load(); setSaved(true);
  };
  const filtered = useMemo(() => products.filter(p => `${p.name} ${p.variants.map(v => v.scent.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const active = orders.filter(order => order.status !== "completed");
  const done = orders.filter(order => order.status === "completed");
  const labels: Record<Tab, string> = { products: "Формы свечей", scents: "Ароматы", orders: "Заказы", content: "Контент" };
  if (auth === null) return <main className="admin-login"><div className="login-card"><h1>Мастерская ТИХО</h1>{error ? <><p className="editor-error" role="alert">{error}</p><button className="save" onClick={() => { setError(""); void checkSession(); }}>Повторить подключение</button></> : <p role="status">Проверяем подключение…</p>}</div></main>;
  if (!auth) return <main className="admin-login"><form className="login-card" onSubmit={login}><Link className="admin-logo" href="/">ТИХО</Link><span className="admin-kicker">Мастерская</span><h1>Вход в админку</h1><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required autoFocus /></label>{error && <p className="editor-error" role="alert">{error}</p>}<button className="save" disabled={busy}>{busy ? "Входим…" : "Войти"}</button></form></main>;
  return <main className="admin-shell">
    <aside className="admin-sidebar"><Link className="admin-logo" href="/">ТИХО</Link><nav aria-label="Управление магазином">{(Object.keys(labels) as Tab[]).map(key => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setError(""); setTab(key); }} aria-current={tab === key ? "page" : undefined}>{labels[key]}{key === "orders" && orders.some(o => o.status === "new") && <i>{orders.filter(o => o.status === "new").length}</i>}</button>)}</nav><button className="admin-logout" disabled={busy} onClick={() => void perform(async () => { await request("/api/admin/logout", { method: "POST" }); setAuth(false); })}>Выйти</button></aside>
    <section className="admin-workspace"><header className="admin-header"><div><span className="admin-kicker">Управление магазином</span><h1>{labels[tab]}</h1></div><div className="admin-actions"><Link href="/" target="_blank">Открыть сайт ↗</Link>{tab === "products" && <button onClick={() => setEditing({ ...empty })}>Добавить форму</button>}{tab === "scents" && <button onClick={() => setEditingScent({ ...emptyScent })}>Добавить аромат</button>}</div></header>
      {(error || loadErrors[tab]) && <p className="editor-error" role="alert">{error || loadErrors[tab]}<button type="button" className="text-action" disabled={busy || loadingData} onClick={() => void perform(load)}>Обновить данные</button></p>}
      {loadingData && <p className="admin-loading" role="status">Обновляем данные…</p>}
      {tab === "scents" && <><p className="admin-intro">Название, описание, ноты и цвет аромата используются на витрине. Для форм с общим остатком доступны все включённые ароматы; для форм с вариантами — ароматы этих вариантов.</p>{scents.length === 0 ? <div className="empty-admin"><h2>Начните с первого аромата</h2><p>Укажите его название, ноты и цвет вашей свечи.</p><button className="save" onClick={() => setEditingScent({ ...emptyScent })}>Создать аромат</button></div> : <div className="scent-admin-grid">{scents.map(scent => <article className="scent-admin-card" key={scent.id}><div className="scent-admin-color" style={{ background: scent.color }}><span>{scent.colorName}</span></div><div className="scent-admin-body"><span className="admin-kicker">{scent.active ? "На сайте" : "Отключён"} · {products.filter(p => !p.hasVariants || p.variants.some(v => v.scentId === scent.id && v.active)).length} форм</span><h2>{scent.name}</h2><p>{scent.description}</p><div className="category-notes">{scent.notes.map((note, index) => <span key={`${note}-${index}`}>{note}</span>)}</div><footer><button onClick={() => setEditingScent(scent)}>Редактировать</button><button disabled={busy} onClick={() => removeScent(scent)}>Удалить</button></footer></div></article>)}</div>}</>}
      {tab === "products" && <><p className="admin-intro">Укажите форму, цену и остаток. Покупатель выбирает доступный аромат в карточке свечи. При необходимости задайте отдельные фотографии и остатки по ароматам.</p><div className="admin-stats"><Stat label="Форм" value={String(products.length)} note={`${products.filter(p => p.published).length} опубликовано`} /><Stat label="В наличии" value={String(products.reduce((sum, p) => sum + p.stock, 0))} note="свечей, без умножения на цвета" /><Stat label="Ароматов" value={String(scents.filter(s => s.active).length)} note="в общем справочнике" /></div><div className="admin-table-card"><div className="table-toolbar"><label><input aria-label="Поиск по формам и ароматам" value={query} onChange={event => setQuery(event.target.value)} placeholder="Форма или аромат" /></label><span>{filtered.length} позиций</span></div><div className="admin-table-wrap"><table><thead><tr><th>Форма</th><th>Цена</th><th>Остаток</th><th>Статус</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{filtered.map(product => <tr key={product.id}><td><div className="product-cell"><div className="product-preview">{product.image ? <img src={product.image} alt="" /> : <CandlePreview shape={productShape(product)} color={scents[0]?.color} />}</div><div><strong>{product.name}</strong><div className="table-scents">{product.variants.length ? product.variants.map(variant => <i key={variant.id} className={!variant.active || !variant.scent.active ? "muted" : ""} style={{ background: variant.scent.color }} title={`${variant.scent.name}: ${variant.stock} шт.`} />) : scents.filter(s => s.active).map(scent => <i key={scent.id} style={{ background: scent.color }} title={scent.name} />)}</div></div></div></td><td>{money(product.price)}</td><td>{product.stock} шт.</td><td>{product.published ? "На сайте" : "Черновик"}</td><td><button className="edit-button" aria-label={`Редактировать ${product.name}`} onClick={() => setEditing(product)}>Изменить</button></td></tr>)}</tbody></table>{!filtered.length && <p className="empty-admin">Формы не найдены</p>}</div></div></>}
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
              {item.image && <img src={item.image} alt="" />}
              <div>
                <strong>{item.name} × {item.quantity}</strong>
                {item.customRecipe ? <dl className="order-recipe">
                  <div><dt>Форма</dt><dd>{atelierShapes[item.customRecipe.shape]}</dd></div>
                  <div><dt>Цвет</dt><dd>{atelierColors[item.customRecipe.color]}</dd></div>
                  <div><dt>Начало</dt><dd>{atelierTopNotes[item.customRecipe.top]}</dd></div>
                  <div><dt>Сердце</dt><dd>{atelierHeartNotes[item.customRecipe.heart]}</dd></div>
                  <div><dt>Шлейф</dt><dd>{atelierBaseNotes[item.customRecipe.base]}</dd></div>
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
    {editing && <ProductEditor product={editing} scents={scents} onSave={saveProduct} onClose={() => setEditing(null)} />}
    {editingScent && <ScentEditor scent={editingScent} onSave={saveScent} onClose={() => setEditingScent(null)} />}
    <div className={saved ? "admin-toast show" : "admin-toast"} role="status">Изменения сохранены</div>
  </main>;
}
function Stat({ label, value, note }: { label:string; value:string; note:string }) { return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Content({ field, value, save }: { field:Field; value:string; save:(field:Field, value:string, file?:File) => Promise<void> }) {
  const [draft, setDraft] = useState(value); const [file, setFile] = useState<File>(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <article className="content-card"><span className="admin-kicker">{field.kind === "image" ? "Изображение" : "Текст"}</span><h3>{field.label}</h3>{field.kind === "image" ? <><ImagePreview file={file} src={value} /><input type="file" aria-label={field.label} accept="image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0])} /></> : <textarea aria-label={field.label} value={draft} onChange={event => setDraft(event.target.value)} />}{error && <p className="editor-error" role="alert">{error}</p>}<button disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await save(field, draft, file); } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка сохранения"); } finally { setSaving(false); } }}>{saving ? "Сохраняем…" : "Сохранить"}</button></article>;
}
