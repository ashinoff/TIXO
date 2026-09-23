"use client";
/* eslint-disable @next/next/no-img-element -- catalog and uploaded photographs keep their original URLs */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type PointerEvent } from "react";
import { availableVariants, emptyAromaProfile, candleShapes, cartKey, money, productShape, type Product, type Scent, type Variant, type CandleColor, type CandleShape } from "@/lib/catalog";
import { atelierColors, atelierShapes, isRecipe as validRecipe, recipeKey, recipeSummary, type Recipe } from "@/lib/atelier";
import { Modal } from "./modal";
import { CandlePreview } from "./candle-preview";

const STORAGE_KEY = "tixo.atelier.cart.v1";
const REQUEST_KEY = "tixo.atelier.request.v1";
type CandleVisualData = { silhouette?: string | null; shape?: CandleShape | null; color?: string };
type StandardLine = CandleVisualData & { key: string; productId: number; variantId: number | null; scentId: number; colorId: number; quantity: number; name: string; scentName: string; colorName: string; image: string | null; price: number };
type CustomLine = { key: string; customRecipe: Recipe; quantity: number };
type Line = StandardLine | CustomLine;
type DisplayLine = CandleVisualData & { key: string; name: string; scentName: string; quantity: number; image: string | null; price: number | null; available: number; customRecipe?: Recipe };
type OrderPayload = { requestKey: string; customerName: string; phone: string; email: string; address: string; delivery: string; comment: string; items: ({ productId: number; variantId: number | null; scentId: number; colorId: number; quantity: number } | { customRecipe: Recipe; quantity: number })[] };
type Receipt = { orderNumber: string; total: number; quotePending: boolean };
type Selection = { productId: number; scentId?: number; colorId?: number };
type Shop = {
  products: Product[]; scents: Scent[]; colors: CandleColor[]; loading: boolean; catalogError: string; loadCatalog: () => Promise<void>;
  activeScent: number | null; setActiveScent: (id: number | null) => void; selectedScent?: Scent;
  cart: Line[]; items: DisplayLine[]; count: number; total: number; hasCustom: boolean; locked: boolean;
  addProduct: (product: Product, scent: Scent, color: CandleColor, quantity?: number) => boolean; addCustom: (recipe: Recipe) => boolean;
  changeQuantity: (key: string, delta: number) => void; remove: (key: string) => void;
  cartOpen: boolean; setCartOpen: (open: boolean) => void; detail: Selection | null; openProduct: (productId: number, scentId?: number, colorId?: number) => void; closeProduct: () => void;
  submitOrder: (event: FormEvent<HTMLFormElement>) => void; retryOrder: () => void; pending: OrderPayload | null; submitting: boolean; orderError: string; receipt: Receipt | null;
  toast: string; dismissToast: () => void;
};
const ShoppingContext = createContext<Shop | null>(null);
export function useShopping() { const value = useContext(ShoppingContext); if (!value) throw new Error("ShoppingProvider is required"); return value; }
const isCustom = (line: Line): line is CustomLine => "customRecipe" in line;
const positiveInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function restoreCart(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];
  const lines = new Map<string, Line>();
  for (const raw of value.slice(0, 100)) {
    if (!raw || typeof raw !== "object" || !positiveInteger(raw.quantity) || raw.quantity > 99) continue;
    if (validRecipe(raw.customRecipe)) {
      const recipe = { ...raw.customRecipe }; const key = `custom:${recipeKey(recipe)}`;
      lines.set(key, { key, customRecipe: recipe, quantity: raw.quantity });
    } else if (positiveInteger(raw.productId) && positiveInteger(raw.scentId) && (raw.variantId === null || positiveInteger(raw.variantId)) && typeof raw.name === "string" && typeof raw.scentName === "string" && typeof raw.price === "number" && raw.price >= 0 && Number.isFinite(raw.price)) {
      const key = cartKey(raw.productId, raw.variantId, raw.scentId, raw.colorId);
      lines.set(key, { silhouette: typeof raw.silhouette === "string" ? raw.silhouette : null, shape: typeof raw.shape === "string" && Object.hasOwn(candleShapes, raw.shape) ? raw.shape : null, color: typeof raw.color === "string" ? raw.color : undefined, key, productId: raw.productId, variantId: raw.variantId, scentId: raw.scentId, colorId: positiveInteger(raw.colorId) ? raw.colorId : 0, colorName: typeof raw.colorName === "string" ? raw.colorName : "Выберите цвет заново", quantity: raw.quantity, name: raw.name.slice(0, 160), scentName: raw.scentName.slice(0, 120), image: typeof raw.image === "string" ? raw.image : null, price: raw.price });
    }
  }
  return [...lines.values()];
}
function restoreRequest(value: unknown): OrderPayload | null {
  if (!value || typeof value !== "object") return null;
  const data = value as OrderPayload;
  if (typeof data.requestKey !== "string" || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.requestKey)) return null;
  if (![data.customerName, data.phone, data.email, data.address, data.delivery, data.comment].every(value => typeof value === "string") || !Array.isArray(data.items) || !data.items.length || data.items.length > 100) return null;
  if (!data.items.every(item => item && positiveInteger(item.quantity) && item.quantity <= 99 && ("customRecipe" in item ? validRecipe(item.customRecipe) : positiveInteger(item.productId) && positiveInteger(item.scentId) && (item.variantId === null || positiveInteger(item.variantId))))) return null;
  return data;
}
function storageWrite(key: string, value: unknown) { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* The cart remains usable when browser storage is unavailable. */ } }
function variantFor(product: Product, scent: Scent, color: CandleColor): Variant | undefined {
  return availableVariants(product).find(variant => variant.scentId === scent.id && variant.colorId === color.id);
}
function matchesCandle(product: Product, scentId: number, colorId: number) {
  return (!product.scentId || product.scentId === scentId) && (!product.colorId || product.colorId === colorId);
}
function stockFor(product: Product, scent: Scent, color: CandleColor) {
  if (!matchesCandle(product, scent.id, color.id)) return 0;
  return product.hasVariants ? variantFor(product, scent, color)?.stock ?? 0 : product.stock;
}
function photograph(product: Product, color?: CandleColor, scent?: Scent) {
  const uploaded = (scent && color && variantFor(product, scent, color)?.image) || product.image;
  return { src: uploaded || null, preview: !uploaded };
}
function visualData(product: Product, color?: CandleColor): CandleVisualData {
  return { silhouette: product.form?.silhouette, shape: product.form ? product.form.shape : productShape(product), color: color?.hex ?? product.color?.hex };
}
function CandleVisual({ src, label, silhouette, shape, color }: CandleVisualData & { src?: string | null; label: string }) {
  return src ? <img src={src} alt={label} width="1254" height="1254" loading="lazy" /> : <div className="candle-silhouette-visual"><CandlePreview silhouette={silhouette} shape={shape} color={color} label={`${label} · силуэт формы`} /></div>;
}
function reducedMotion() { return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }
const inspection = {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => { if (event.pointerType === "mouse" && !reducedMotion()) event.currentTarget.style.setProperty("--zoom-scale", "1.18"); },
  onPointerMove: (event: PointerEvent<HTMLElement>) => { if (event.pointerType !== "mouse" || reducedMotion()) return; const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--zoom-x", `${Math.max(10, Math.min(90, (event.clientX - rect.left) / rect.width * 100))}%`); event.currentTarget.style.setProperty("--zoom-y", `${Math.max(10, Math.min(90, (event.clientY - rect.top) / rect.height * 100))}%`); },
  onPointerLeave: (event: PointerEvent<HTMLElement>) => { event.currentTarget.style.setProperty("--zoom-scale", "1"); event.currentTarget.style.setProperty("--zoom-x", "50%"); event.currentTarget.style.setProperty("--zoom-y", "50%"); },
};

export function ShoppingProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]); const [scents, setScents] = useState<Scent[]>([]); const [colors, setColors] = useState<CandleColor[]>([]);
  const [loading, setLoading] = useState(true); const [catalogError, setCatalogError] = useState("");
  const [activeScent, setActiveScent] = useState<number | null>(null); const [cart, setCartState] = useState<Line[]>([]);
  const cartRef = useRef<Line[]>([]); const ready = useRef(false); const [cartOpen, setCartOpenState] = useState(false);
  const [detail, setDetail] = useState<Selection | null>(null); const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, setPendingState] = useState<OrderPayload | null>(null); const pendingRef = useRef<OrderPayload | null>(null);
  const [submitting, setSubmitting] = useState(false); const busy = useRef(false);
  const [orderError, setOrderError] = useState(""); const [receipt, setReceipt] = useState<Receipt | null>(null);
  const loadCatalog = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch("/api/products", { cache: "no-store" }), fetch("/api/scents", { cache: "no-store" }), fetch("/api/colors", { cache: "no-store" })]);
      if (responses.some(response => !response.ok)) throw new Error();
      const [items, profiles, palette] = await Promise.all(responses.map(response => response.json()));
      if (!Array.isArray(items) || !Array.isArray(profiles) || !Array.isArray(palette)) throw new Error();
      setProducts(items.filter((product: Product) => product.published)); setScents(profiles.filter((scent: Scent) => scent.active)); setColors(palette.filter((color: CandleColor) => color.active)); setCatalogError("");
    } catch { setCatalogError("Не удалось загрузить коллекцию. Попробуйте ещё раз."); }
    finally { setLoading(false); }
  }, []);
  const setCart = useCallback((next: Line[]) => { cartRef.current = next; setCartState(next); if (ready.current) storageWrite(STORAGE_KEY, next); }, []);
  const setPending = useCallback((next: OrderPayload | null) => { pendingRef.current = next; setPendingState(next); storageWrite(REQUEST_KEY, next); }, []);
  useEffect(() => {
    ready.current = true;
    // Browser storage is unavailable during server rendering; hydrate it once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setCart(restoreCart(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"))); const saved = restoreRequest(JSON.parse(window.localStorage.getItem(REQUEST_KEY) ?? "null")); if (saved) { setPending(saved); setCartOpenState(true); } } catch { /* Ignore stale browser storage. */ }
    void loadCatalog();
    return () => clearTimeout(toastTimer.current);
  }, [loadCatalog, setCart, setPending]);
  const notify = (message: string) => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(""), 4200); };
  const isLocked = () => { if (busy.current || pendingRef.current) { notify("Сначала уточним результат отправки заказа — откройте корзину."); return true; } return false; };
  const items = useMemo<DisplayLine[]>(() => cart.map(line => {
    if (isCustom(line)) return { key: line.key, name: "Моя свеча ТИХО", scentName: recipeSummary(line.customRecipe), quantity: line.quantity, image: null, price: null, available: 99, customRecipe: line.customRecipe };
    const product = products.find(product => product.id === line.productId); const scent = scents.find(scent => scent.id === line.scentId); const color = colors.find(color => color.id === line.colorId);
    const variant = product?.variants.find(variant => variant.id === line.variantId);
    const compatible = product && scent && color && matchesCandle(product, scent.id, color.id) && (product.hasVariants ? variant?.active && variant.scent.active && variant.color.active && variant.scentId === scent.id && variant.colorId === color.id : line.variantId === null);
    const stock = compatible ? product.hasVariants ? variant?.stock ?? 0 : product.stock : 0;
    const otherQuantity = cart.reduce((sum, other) => sum + (!isCustom(other) && other.key !== line.key && other.productId === line.productId && other.variantId === line.variantId ? other.quantity : 0), 0);
    return { ...(product ? visualData(product, color) : { silhouette: line.silhouette, shape: line.shape, color: line.color }), key: line.key, name: product?.name ?? line.name, scentName: `${scent?.name ?? line.scentName} · ${color?.name ?? line.colorName}`, quantity: line.quantity, image: product ? photograph(product, color, scent).src : line.image, price: product?.price ?? line.price, available: Math.max(0, stock - otherQuantity) };
  }), [cart, products, scents, colors]);
  const addProduct = (product: Product, scent: Scent, color: CandleColor, quantity = 1) => {
    if (isLocked()) return false;
    const live = products.find(item => item.id === product.id); const active = scents.find(item => item.id === scent.id);
    if (!live || !active || !colors.some(c => c.id === color.id) || !positiveInteger(quantity) || quantity > 99) return false;
    const variant = variantFor(live, active, color); const key = cartKey(live.id, variant?.id ?? null, active.id, color.id);
    const inCart = cartRef.current.reduce((sum, line) => sum + (!isCustom(line) && line.productId === live.id && line.variantId === (variant?.id ?? null) ? line.quantity : 0), 0);
    const prior = cartRef.current.find(line => line.key === key); const nextQuantity = (prior?.quantity ?? 0) + quantity;
    if (inCart + quantity > stockFor(live, active, color) || nextQuantity > 99) { notify("В корзине уже всё доступное количество этой формы."); return false; }
    const line: StandardLine = { ...visualData(live, color), key, productId: live.id, variantId: variant?.id ?? null, scentId: active.id, colorId: color.id, colorName: color.name, quantity: nextQuantity, name: live.name, scentName: active.name, image: photograph(live, color, active).src, price: live.price };
    setCart([...cartRef.current.filter(item => item.key !== key), line]); setReceipt(null); setOrderError(""); notify(`${live.name} · ${color.name} · ${active.name} — в корзине`); return true;
  };
  const addCustom = (recipe: Recipe) => {
    if (isLocked() || !validRecipe(recipe)) return false;
    const snapshot = { shape: recipe.shape, color: recipe.color, top: recipe.top, heart: recipe.heart, base: recipe.base };
    const key = `custom:${recipeKey(snapshot)}`; const quantity = (cartRef.current.find(line => line.key === key)?.quantity ?? 0) + 1;
    if (quantity > 99) { notify("В заказе может быть не более 99 свечей одной композиции."); return false; }
    setCart([...cartRef.current.filter(line => line.key !== key), { key, customRecipe: snapshot, quantity }]); setReceipt(null); setOrderError(""); notify("Ваша авторская свеча — в корзине."); return true;
  };
  const remove = (key: string) => { if (!isLocked()) { setCart(cartRef.current.filter(line => line.key !== key)); setOrderError(""); } };
  const changeQuantity = (key: string, delta: number) => {
    if (isLocked()) return;
    const line = cartRef.current.find(item => item.key === key); const display = items.find(item => item.key === key); if (!line || !display) return;
    const quantity = line.quantity + delta;
    if (quantity < 1) { remove(key); return; }
    if (quantity > Math.min(99, display.available) && delta > 0) { notify("Больше свечей этого варианта сейчас нет в наличии."); return; }
    setCart(cartRef.current.map(item => item.key === key ? { ...item, quantity } : item)); setOrderError("");
  };
  const sendOrder = async (payload: OrderPayload) => {
    if (busy.current) return;
    busy.current = true; setSubmitting(true); setOrderError(""); setPending(payload);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) { setPending(null); setOrderError(data.error || "Проверьте данные заказа."); if (response.status === 409) await loadCatalog(); }
        else setOrderError("Не удалось получить подтверждение. Повторите отправку: номер запроса сохранён, второй заказ не создастся.");
        return;
      }
      if (typeof data.orderNumber !== "string" || typeof data.total !== "number") throw new Error("Unknown order result");
      setReceipt({ orderNumber: data.orderNumber, total: data.total, quotePending: Boolean(data.quotePending) || payload.items.some(item => "customRecipe" in item) });
      setCart([]); setPending(null); await loadCatalog();
    } catch { setOrderError("Связь прервалась. Повторите отправку: номер запроса сохранён, второй заказ не создастся."); }
    finally { clearTimeout(timeout); busy.current = false; setSubmitting(false); }
  };
  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy.current) return;
    if (pendingRef.current) { void sendOrder(pendingRef.current); return; }
    if (!cartRef.current.length || loading || catalogError || items.some(item => item.quantity > item.available)) return;
    const form = new FormData(event.currentTarget);
    const payload: OrderPayload = { requestKey: crypto.randomUUID(), customerName: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), address: String(form.get("address") ?? ""), delivery: String(form.get("delivery") ?? ""), comment: String(form.get("comment") ?? ""), items: cartRef.current.map(line => isCustom(line) ? { customRecipe: { ...line.customRecipe }, quantity: line.quantity } : { productId: line.productId, variantId: line.variantId, scentId: line.scentId, colorId: line.colorId, quantity: line.quantity }) };
    void sendOrder(payload);
  };
  const setCartOpen = (open: boolean) => { if (!open && busy.current) return; setCartOpenState(open); if (open) setDetail(null); };
  const value: Shop = { products, scents, colors, loading, catalogError, loadCatalog, activeScent, setActiveScent, selectedScent: scents.find(scent => scent.id === activeScent), cart, items, count: cart.reduce((sum, line) => sum + line.quantity, 0), total: items.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0), hasCustom: items.some(item => item.customRecipe), locked: submitting || Boolean(pending), addProduct, addCustom, changeQuantity, remove, cartOpen, setCartOpen, detail, openProduct: (productId, scentId, colorId) => setDetail({ productId, scentId, colorId }), closeProduct: () => setDetail(null), submitOrder, retryOrder: () => { if (pendingRef.current) void sendOrder(pendingRef.current); }, pending, submitting, orderError, receipt, toast, dismissToast: () => setToast("") };
  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
}

export function CartTrigger() {
  const { count, setCartOpen } = useShopping();
  return <button className="cart-trigger" type="button" aria-haspopup="dialog" aria-label={`Открыть корзину, товаров: ${count}`} onClick={() => setCartOpen(true)}><span>Корзина</span><span className="cart-count">({String(count).padStart(2, "0")})</span><svg aria-hidden="true" viewBox="0 0 24 26" fill="none"><path d="M5 8h14l1 15H4L5 8Z" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /></svg></button>;
}

export function Catalog() {
  const shop = useShopping();
  const [colorId, setColorId] = useState<number | null>(null);
  const cards = shop.products.flatMap(product => shop.colors.flatMap(color => {
    if ((colorId !== null && color.id !== colorId) || (product.colorId && product.colorId !== color.id)) return [];
    const candidates = product.hasVariants
      ? availableVariants(product).filter(v => v.colorId === color.id).map(v => v.scent)
      : shop.scents.filter(scent => !product.scentId || scent.id === product.scentId);
    const scent = shop.activeScent === null ? candidates[0] : candidates.find(s => s.id === shop.activeScent);
    return scent ? [{ product, color, scent, photo: photograph(product, color, scent) }] : [];
  }));
  return <section className="collection pad" id="collection" aria-labelledby="collection-title">
    <div className="section-heading"><div><p className="eyebrow">01 / КОЛЛЕКЦИЯ</p><h2 id="collection-title">У тишины<br />ваша форма.</h2></div><p className="section-description">Любимый цвет. Любимый аромат.<br />Сочетание выбираете вы.</p></div>
    <div className="color-filter" role="group" aria-label="Фильтр по цвету"><span className="filter-label">Цвет</span><button type="button" className="all-colors" aria-pressed={colorId === null} onClick={() => setColorId(null)}>Все цвета</button>{shop.colors.map(color => <button type="button" className="color-filter-option" key={color.id} aria-label={`Цвет: ${color.name}`} aria-pressed={colorId === color.id} title={color.name} onClick={() => setColorId(color.id)}><i style={{ background: color.hex }} /><span>{color.name}</span></button>)}</div>
    <div className="collection-toolbar"><div className="filters aroma-filters" role="group" aria-label="Фильтр по аромату"><button type="button" className={shop.activeScent === null ? "active" : ""} aria-pressed={shop.activeScent === null} onClick={() => shop.setActiveScent(null)}>Все ароматы <sup>{String(shop.scents.length).padStart(2, "0")}</sup></button>{shop.scents.map(scent => <button key={scent.id} type="button" className={shop.activeScent === scent.id ? "active" : ""} aria-pressed={shop.activeScent === scent.id} onClick={() => shop.setActiveScent(scent.id)}>{scent.name}</button>)}</div><span className="catalog-note">{cards.length} вариантов · ручная работа</span></div>
    {shop.loading && <p className="catalog-message" role="status">Готовим вашу коллекцию…</p>}
    {shop.catalogError && <div className="catalog-message" role="alert">{shop.catalogError}<button className="text-link" onClick={() => void shop.loadCatalog()}>Попробовать ещё раз ↗</button></div>}
    {!shop.loading && !shop.catalogError && !cards.length && <div className="catalog-message" role="status"><p>В этом сочетании свечей пока нет.</p><button className="text-link" onClick={() => { setColorId(null); shop.setActiveScent(null); }}>Показать всю коллекцию ↗</button></div>}
    <div className="product-grid" id="product-grid">{cards.map(({ product, color, scent, photo }, index) => {
      const stock = stockFor(product, scent, color);
      return <article className="product-card" key={`${product.id}:${color.id}`} data-product-id={product.id} data-color-id={color.id} data-scent-id={shop.activeScent ?? undefined}>
        <button type="button" className={`product-image${photo.src?.endsWith("hero.png") ? " black-image" : ""}`} aria-label={`Подробнее о свече ${product.name}, ${color.name}`} onClick={() => shop.openProduct(product.id, product.scentId ?? shop.activeScent ?? undefined, color.id)} {...inspection}><CandleVisual src={photo.src} {...visualData(product, color)} label={`${product.name} · ${color.name}`} /><span className="image-no">{String(index + 1).padStart(2, "0")} / ТИХО</span><span className="image-detail">Выбрать свечу <span aria-hidden="true">↗</span></span>{photo.preview && <span className="photo-preview-label">Силуэт формы</span>}</button>
        <div className="product-category">{color.name}{shop.activeScent !== null || product.scentId ? ` · ${scent.name}` : " · АРОМАТ НА ВАШ ВЫБОР"}</div><div className="product-title"><button type="button" onClick={() => shop.openProduct(product.id, product.scentId ?? shop.activeScent ?? undefined, color.id)}>{product.name}</button><span>{money(product.price)}</span></div><p>{shop.activeScent !== null ? scent.notes.join(" · ") : product.notes || candleShapes[productShape(product)]}</p>
        <button className="quick-add" type="button" disabled={shop.locked || ((shop.activeScent !== null || !!product.scentId) && !stock)} aria-label={`Выбрать ${product.name}, ${color.name}`} onClick={() => shop.activeScent === null ? shop.openProduct(product.id, product.scentId ?? undefined, color.id) : shop.addProduct(product, scent, color)}>+</button>{(shop.activeScent !== null || !!product.scentId) && !stock && <span className="product-unavailable">Нет в наличии</span>}
      </article>;
    })}</div><div className="collection-end"><span>Форма притягивает взгляд. Аромат остаётся в памяти.</span><a href="#ritual">Познакомиться ближе <span aria-hidden="true">↓</span></a></div>
  </section>;
}

export function Aroma() {
  const shop = useShopping(); const [choiceKey, setChoiceKey] = useState(""); const [note, setNote] = useState(0);
  const choices = useMemo(() => shop.scents.map(scent => ({ key: String(scent.id), scent })), [shop.scents]);
  const choice = choices.find(item => item.key === choiceKey) ?? choices[0];
  const panelRef = useRef<HTMLDivElement>(null); const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [shown, setShown] = useState({ key: "", note: 0 }); const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!choice || (shown.key === choice.key && shown.note === note)) return;
    const out = setTimeout(() => setFading(true), 0);
    const timer = setTimeout(() => { setShown({ key: choice.key, note }); setFading(false); }, reducedMotion() ? 0 : shown.key ? 170 : 0);
    return () => { clearTimeout(out); clearTimeout(timer); };
  }, [choice, note, shown]);
  const displayed = choices.find(item => item.key === shown.key) ?? choice;
  const stageKey = (["top", "heart", "base"] as const)[shown.note];
  const stage = (displayed?.scent.profile ?? emptyAromaProfile())[stageKey];
  const titles = ["ПЕРВОЕ ВПЕЧАТЛЕНИЕ", "ХАРАКТЕР КОМПОЗИЦИИ", "ПОСЛЕВКУСИЕ"];
  const selectNote = (index: number, focus = false) => { setNote(index); if (focus) tabs.current[index]?.focus(); };
  return <section className="ritual" id="ritual" aria-labelledby="ritual-title">
    <div className="ritual-visual zoom-surface" {...inspection}><img src="/assets/hero.png" alt="Свет свечи ТИХО" width="1254" height="1254" loading="lazy" /><div className="ritual-overlay" /><span className="ritual-word">{choice?.scent.name.toLowerCase() ?? "почувствуйте"}.</span><span className="eyebrow visual-caption">ТИХО / ИСКУССТВО АРОМАТА</span><span className="ritual-photo-hint">Наведите, чтобы рассмотреть</span></div>
    <div className="ritual-content"><p className="eyebrow">02 / ИСКУССТВО АРОМАТА</p><h2 id="ritual-title">У каждого вечера —<br /><span>свой шлейф.</span></h2><label className="aroma-picker-label" htmlFor="ritual-aroma">Какой аромат раскроем?</label><div className="aroma-select-wrap"><select id="ritual-aroma" value={choice?.key ?? ""} disabled={!choices.length} onChange={event => { setChoiceKey(event.target.value); setNote(0); }}>{!choices.length && <option value="">{shop.loading ? "Загружаем ароматы…" : "Коллекция готовится"}</option>}{choices.map(item => <option key={item.key} value={item.key}>{item.scent.name}</option>)}</select><span aria-hidden="true">⌄</span></div><p className="ritual-intro">{choice?.scent.description || "Узнайте аромат чуть ближе. Выберите аромат и неспешно пройдите его три главы."}</p><p className="note-instruction">Выберите главу, чтобы исследовать аромат</p>
      <div className="note-tabs" role="tablist" aria-label="Главы аромата">{["Начало", "Сердце", "Шлейф"].map((label, index) => <button ref={element => { tabs.current[index] = element; }} key={label} type="button" role="tab" aria-selected={note === index} aria-controls="note-panel" id={`note-tab-${index}`} tabIndex={note === index ? 0 : -1} onClick={() => selectNote(index)} onKeyDown={event => { const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null; if (next !== null) { event.preventDefault(); selectNote(next, true); } }}><span>0{index + 1}</span><strong>{label}</strong></button>)}</div>
      <div ref={panelRef} className={`note-panel${fading ? " is-changing" : ""}`} id="note-panel" role="tabpanel" aria-labelledby={`note-tab-${note}`} tabIndex={0}><span className="eyebrow">{titles[shown.note]}</span><h3>{stage.notes || ["Начало", "Сердце", "Шлейф"][shown.note]}</h3><p>{stage.description || "Мастерская скоро добавит описание этой главы аромата."}</p></div>
      <button type="button" className="text-link" disabled={!choice} onClick={() => { if (choice) { shop.setActiveScent(choice.scent.id); document.getElementById("collection")?.scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth" }); } }}>Свечи с этим ароматом <span aria-hidden="true">↗</span></button>
    </div></section>;
}

function ProductDetails() {
  const shop = useShopping(); const product = shop.products.find(product => product.id === shop.detail?.productId);
  const [scentId, setScentId] = useState(shop.detail?.scentId); const [colorId, setColorId] = useState(shop.detail?.colorId); const [quantity, setQuantity] = useState(1);
  if (!product) return null;
  const profiles = product.hasVariants ? shop.scents.filter(s => availableVariants(product).some(v => v.scentId === s.id)) : shop.scents.filter(scent => !product.scentId || scent.id === product.scentId);
  const palette = product.hasVariants ? shop.colors.filter(c => availableVariants(product).some(v => v.colorId === c.id)) : shop.colors.filter(color => !product.colorId || color.id === product.colorId);
  const scent = profiles.find(s => s.id === (scentId ?? product.scentId)); const color = palette.find(c => c.id === (colorId ?? product.colorId));
  const variant = scent && color ? variantFor(product, scent, color) : undefined;
  const inCart = shop.cart.reduce((sum, line) => sum + (!isCustom(line) && line.productId === product.id && line.variantId === (variant?.id ?? null) ? line.quantity : 0), 0);
  const available = scent && color ? Math.max(0, stockFor(product, scent, color) - inCart) : 0; const photo = photograph(product, color, scent);
  return <Modal className="product-dialog" label={`${product.name} — выбор свечи`} onClose={shop.closeProduct}><button type="button" className="icon-button detail-close" aria-label="Закрыть карточку свечи" onClick={shop.closeProduct}>×</button><div className={`detail-photo${photo.src?.endsWith("hero.png") ? " black" : ""}`}><CandleVisual src={photo.src} {...visualData(product, color)} label={`${product.name}${color ? ` · ${color.name}` : ""}`} /></div><div className="detail-content"><div className="detail-kicker"><span className="eyebrow">СВЕЧА РУЧНОЙ РАБОТЫ</span><span className="eyebrow">ТИХО</span></div><h2>{product.name}</h2><p>{product.notes}</p>
    <fieldset className="detail-colors"><legend>Цвет</legend>{palette.map(c => <button key={c.id} type="button" className="color-filter-option" aria-label={`Выбрать цвет: ${c.name}`} aria-pressed={color?.id === c.id} onClick={() => { setColorId(c.id); setQuantity(1); }}><i style={{ background: c.hex }} /><span>{c.name}</span></button>)}</fieldset>
    <label className="detail-scent-label" htmlFor="detail-scent">Аромат</label><select id="detail-scent" value={scent?.id ?? ""} onChange={event => { setScentId(Number(event.target.value)); setQuantity(1); }}><option value="" disabled>Выберите аромат</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
    <dl className="detail-specs"><div><dt>Ноты</dt><dd>{scent?.notes.join(" · ") || "Выберите аромат"}</dd></div><div><dt>Цвет</dt><dd>{color?.name ?? "Выберите цвет"}</dd></div><div><dt>Форма</dt><dd>{product.form?.name ?? candleShapes[productShape(product)]}</dd></div><div><dt>Доступно</dt><dd>{!scent || !color ? "Выберите цвет и аромат" : available ? `${available} шт.` : "Это сочетание пока недоступно"}</dd></div></dl><div className="detail-footer"><span>{money(product.price)}</span><div className="qty-picker" aria-label="Количество свечей"><button type="button" aria-label="Уменьшить количество" disabled={quantity <= 1} onClick={() => setQuantity(value => value - 1)}>−</button><output aria-live="polite">{quantity}</output><button type="button" aria-label="Увеличить количество" disabled={quantity >= Math.min(99, available)} onClick={() => setQuantity(value => value + 1)}>+</button></div></div><button type="button" className="button button-dark" disabled={!scent || !color || quantity > available || shop.locked} onClick={() => { if (scent && color && shop.addProduct(product, scent, color, quantity)) shop.closeProduct(); }}>Добавить в корзину <span aria-hidden="true">+</span></button>{photo.preview && <p className="detail-notice">Показан силуэт формы в выбранном цвете. Фотографию готовой свечи можно уточнить у мастерской.</p>}<p className="detail-notice">После оформления мастерская подтвердит заказ и согласует доставку.</p></div></Modal>;
}

function CustomPreview({ recipe }: { recipe: Recipe }) {
  const positions = { black: "0%", ivory: "33.333333%", red: "66.666667%", rose: "100%" };
  return <div className="cart-custom-preview"><span className="candle-atlas" role="img" aria-label={`${atelierShapes[recipe.shape]}, ${atelierColors[recipe.color]}`} data-shape={recipe.shape} style={{ "--color-x": positions[recipe.color] } as CSSProperties} /></div>;
}
export function CartOverlay() {
  const shop = useShopping(); const [delivery, setDelivery] = useState("pickup");
  const unavailable = shop.items.some(item => item.quantity > item.available);
  return <>{shop.detail && <ProductDetails key={`${shop.detail.productId}:${shop.detail.scentId}:${shop.detail.colorId}`} />}
    {shop.cartOpen && <Modal className="cart-dialog" label="Ваша корзина" onClose={() => shop.setCartOpen(false)}><div className="dialog-inner"><header className="dialog-header"><div><span className="eyebrow">ВАШ ВЕЧЕР НАЧИНАЕТСЯ ЗДЕСЬ</span><h2>Ваша корзина</h2></div><button className="icon-button close-cart" type="button" aria-label="Закрыть корзину" disabled={shop.submitting} onClick={() => shop.setCartOpen(false)}>×</button></header>
      {shop.receipt ? <div className="order-success" role="status"><span className="empty-mark">тихо.</span><h3>Ваш вечер уже ближе.</h3><p>Заказ <strong>{shop.receipt.orderNumber}</strong> передан в мастерскую.</p><p>{shop.receipt.quotePending ? `Стоимость индивидуальных свечей мастер согласует с вами.${shop.receipt.total ? ` Свечи из коллекции: ${money(shop.receipt.total)}.` : ""}` : `Свечи в заказе: ${money(shop.receipt.total)}.`} Доставка рассчитывается отдельно.</p><p>Мы свяжемся с вами по указанным контактам, чтобы подтвердить детали и способ оплаты.</p><button className="button button-dark" onClick={() => shop.setCartOpen(false)}>Продолжить знакомство <span aria-hidden="true">↗</span></button></div> : !shop.items.length && !shop.pending ? <div className="empty-cart"><span className="empty-mark">тихо.</span><p>Здесь пока тихо.</p><span>Выберите аромат, который хочется взять с собой.</span><button type="button" className="button button-dark" onClick={() => { shop.setCartOpen(false); document.getElementById("collection")?.scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth" }); }}>К коллекции <span aria-hidden="true">↗</span></button></div> : <>
        <div className="cart-items" id="cart-items">{shop.items.map(item => <article className={`cart-item${item.customRecipe ? " custom" : ""}`} key={item.key}>{item.customRecipe ? <CustomPreview recipe={item.customRecipe} /> : <div className="cart-candle-visual"><CandleVisual src={item.image} silhouette={item.silhouette} shape={item.shape} color={item.color} label={item.name} /></div>}<div><h3>{item.name}</h3><p className="cart-recipe">{item.scentName}</p><span className="cart-item-price">{item.price === null ? "Стоимость по запросу" : money(item.price * item.quantity)}</span><div className="quantity-row"><button type="button" aria-label={`Уменьшить количество ${item.name}`} disabled={shop.locked} onClick={() => shop.changeQuantity(item.key, -1)}>−</button><span aria-label="Количество">{item.quantity}</span><button type="button" aria-label={`Увеличить количество ${item.name}`} disabled={shop.locked || item.quantity >= Math.min(99, item.available)} onClick={() => shop.changeQuantity(item.key, 1)}>+</button><button className="remove-item" type="button" aria-label={`Удалить ${item.name}`} disabled={shop.locked} onClick={() => shop.remove(item.key)}>Удалить</button></div>{!shop.loading && !shop.catalogError && !shop.pending && item.quantity > item.available && <p className="stock-error">{item.available ? `Доступно ${item.available} шт. Уменьшите количество.` : "Вариант больше недоступен. Удалите его из корзины."}</p>}</div></article>)}</div>
        {!!shop.items.length && <><div className="order-total"><span>{shop.hasCustom ? "Предварительно, без доставки" : "Итого без доставки"}</span><strong>{shop.hasCustom ? shop.total ? `${money(shop.total)} + по запросу` : "По запросу" : money(shop.total)}</strong></div>{shop.hasCustom && <p className="checkout-note">Стоимость индивидуальных свечей не включена в сумму. Мастер согласует состав, возможность изготовления и цену до начала работы.</p>}</>}
        <p className="checkout-note">Доставка и способ оплаты согласуются с мастерской после подтверждения заказа.</p>
        {shop.pending ? <div className="pending-order"><p>Состав и контакты сохранены для этого запроса. Уточним результат отправки, прежде чем менять заказ.</p><button className="button button-dark" type="button" disabled={shop.submitting} onClick={shop.retryOrder}>{shop.submitting ? "Получаем подтверждение…" : "Повторить отправку"}<span aria-hidden="true">↗</span></button></div> : <form id="checkout-form" className="live-checkout" onSubmit={shop.submitOrder}><h3>Оформить заказ</h3><fieldset disabled={shop.submitting}><label>Ваше имя<input name="name" autoComplete="given-name" placeholder="Имя" required maxLength={160} /></label><div className="field-pair"><label>Телефон<input name="phone" type="tel" autoComplete="tel" placeholder="+7" required minLength={7} maxLength={40} /></label><label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label></div><label>Способ доставки<select name="delivery" value={delivery} onChange={event => setDelivery(event.target.value)}><option value="pickup">В пункт выдачи</option><option value="courier">Курьером</option></select></label><label>{delivery === "courier" ? "Город и адрес доставки" : "Город и пункт выдачи"}<input name="address" autoComplete="street-address" placeholder="Город и адрес" required maxLength={1000} /></label><label>Комментарий к заказу<textarea name="comment" rows={3} maxLength={2000} placeholder="Пожелания, упаковка или удобное время для связи" /></label><p className="checkout-note">Отправляя заказ, вы передаёте мастерской указанные контакты для его обработки.</p><button className="button button-dark" type="submit" disabled={shop.loading || !!shop.catalogError || unavailable || !shop.items.length}>Отправить заказ <span aria-hidden="true">↗</span></button>{unavailable && !shop.loading && !shop.catalogError && <p className="stock-error">Проверьте доступность свечей в корзине.</p>}{shop.catalogError && <div role="alert" className="stock-error">{shop.catalogError}<button type="button" className="text-link" onClick={() => void shop.loadCatalog()}>Обновить коллекцию ↗</button></div>}</fieldset></form>}
        {shop.orderError && <p className="order-error" role="alert">{shop.orderError}</p>}
      </>}
    </div></Modal>}
    <div className={`toast${shop.toast ? " show" : ""}`} role="status" aria-live="polite"><span>{shop.toast}</span><button type="button" id="toast-cart" onClick={() => { shop.dismissToast(); shop.setCartOpen(true); }}>В корзину ↗</button><button type="button" id="toast-close" aria-label="Закрыть уведомление" onClick={shop.dismissToast}>×</button></div>
  </>;
}
