"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./cost-calculator.css";

type Material = { id: number; name: string; unit: string; price: number };
type Recipe = { id: number; name: string; product_ids: number[]; product_id?: number | null; version?: number; markup_pct: number; sale_price: number | null; items: Record<string, number>; note: string };
type Product = { id: number; name: string; price: number; published?: boolean; archived?: boolean; form_name?: string | null; color_name?: string | null; accent_color_name?: string | null; scent_name?: string | null };
type History = { id: number; recipe_id: number | null; snapshot: { name: string; total: number; sale_price: number | null; items: { name: string; quantity: number; unit: string; unit_price: number }[]; products?: Product[] }; saved_at: string };
type Payload = { materials: Material[]; recipes: Recipe[]; products: Product[]; history: History[] };
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
const empty = (): Recipe => ({ id: 0, name: "", product_ids: [], markup_pct: 100, sale_price: null, items: {}, note: "" });
const copy = (recipe: Recipe): Recipe => ({ ...recipe, items: { ...recipe.items }, product_ids: [...recipe.product_ids] });
const metadata = (p: Product) => [p.color_name, p.accent_color_name, p.scent_name].filter(Boolean).join(" · ");
function safeId(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("Сервер вернул некорректный номер записи. Обновите страницу.");
  return n;
}
function normalizeRecipe(row: Recipe): Recipe {
  return { ...row, id: safeId(row.id), product_ids: [...new Set((Array.isArray(row.product_ids) ? row.product_ids : row.product_id != null ? [row.product_id] : []).map(safeId))],
    version: row.version == null ? undefined : Number(row.version), markup_pct: Number(row.markup_pct), sale_price: row.sale_price == null ? null : Number(row.sale_price), items: { ...row.items } };
}
/** Defensive normalization also accepts string BIGINTs from a previously deployed API. */
export function normalizeCosting(raw: Payload): Payload {
  if (!raw || ![raw.materials, raw.recipes, raw.products, raw.history].every(Array.isArray)) throw new Error("Не удалось прочитать калькуляции. Обновите список.");
  return { materials: raw.materials.map(row => ({ ...row, id: safeId(row.id), price: Number(row.price) })), recipes: raw.recipes.map(normalizeRecipe),
    products: raw.products.map(row => ({ ...row, id: safeId(row.id), price: Number(row.price) })),
    history: raw.history.map(row => ({ ...row, id: safeId(row.id), recipe_id: row.recipe_id == null ? null : safeId(row.recipe_id) })) };
}

export function CostCalculator() {
  const [data, setData] = useState<Payload>({ materials: [], recipes: [], products: [], history: [] });
  const [draft, setDraft] = useState<Recipe>(empty);
  const [tab, setTab] = useState<"recipes" | "materials" | "history">("recipes");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/costing", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Не загрузились расчёты");
    return normalizeCosting(json);
  }, []);
  useEffect(() => {
    let active = true;
    void load().then(payload => { if (active) setData(payload); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  const edit = (next: Recipe) => { setDraft(next); setDirty(true); setNotice(""); };
  const open = (recipe: Recipe) => {
    if (dirty && !window.confirm("Есть несохранённые изменения. Перейти к другой калькуляции без сохранения?")) return;
    setDraft(copy(recipe)); setDirty(false); setError(""); setNotice("");
  };
  const total = useMemo(() => Math.round(data.materials.reduce((sum, m) => sum + (draft.items[String(m.id)] || 0) * m.price, 0) * 100) / 100, [data.materials, draft.items]);
  const recommended = total * (1 + Number(draft.markup_pct || 0) / 100);
  const profit = draft.sale_price == null ? null : draft.sale_price - total;
  const margin = profit == null || !draft.sale_price ? null : 100 * profit / draft.sale_price;
  const breakdown = data.materials.map(m => ({ ...m, cost: (draft.items[String(m.id)] || 0) * m.price })).sort((a, b) => b.cost - a.cost);

  const save = async (body: Record<string, unknown>): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/costing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить");
      if (body.action === "recipe") {
        const saved = normalizeRecipe(result.recipe);
        setDraft(copy(saved)); setDirty(false);
        setData(current => ({ ...current, recipes: [saved, ...current.recipes.filter(r => r.id !== saved.id)] }));
        setNotice(`Калькуляция «${saved.name}» сохранена. Привязано товаров: ${saved.product_ids.length}.`);
      } else if (body.action === "remove-recipe") {
        setDraft(empty()); setDirty(false);
        setData(current => ({ ...current, recipes: current.recipes.filter(r => r.id !== Number(body.id)) }));
        setNotice("Калькуляция удалена. Товары и история сохранены.");
      } else setNotice("Цена материала сохранена.");
      try { setData(await load()); } catch { setError("Сохранено в базе, но обновить список не удалось. Нажмите «Обновить список»."); }
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка сохранения"); return false; }
    finally { saving.current = false; setBusy(false); }
  };
  const numberInput = (label: string, value: number | null | undefined, onChange: (v: number | null) => void, nullable = false) =>
    <input aria-label={label} type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={value ?? ""} onChange={e => onChange(nullable && e.target.value === "" ? null : Number(e.target.value))} />;

  return <div className="costing" aria-busy={busy || loading}>
    <p className="admin-intro">Одна калькуляция может быть связана с несколькими товарами. Себестоимость общая, а прибыль каждого товара рассчитывается по его цене в каталоге. Цены и остатки товаров здесь не меняются.</p>
    <div className="costing-tabs">{([["recipes", "Калькулятор"], ["materials", "Прайс материалов"], ["history", "История"]] as const).map(([key, label]) => <button type="button" key={key} disabled={busy} className={tab === key ? "selected" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {loading && <p role="status">Загружаем калькуляции…</p>}
    {error && <div className="editor-error" role="alert">{error}<button type="button" className="text-action" disabled={busy || loading} onClick={() => { setError(""); void load().then(setData).catch(e => setError(e.message)); }}>Обновить список</button></div>}
    {notice && <p className="costing-notice" role="status">{notice}</p>}
    {tab === "materials" && <div className="costing-materials"><header><h2>Материалы и закупочные цены</h2><p>Цена за 1 грамм, штуку или другую указанную единицу.</p></header>
      {data.materials.map(m => <MaterialRow key={`${m.id}:${m.name}:${m.unit}:${m.price}`} material={m} onSave={value => save({ action: "material", ...value })} disabled={busy || loading} />)}
      <MaterialRow material={{ id: 0, name: "", unit: "шт", price: 0 }} onSave={value => save({ action: "material", ...value })} disabled={busy || loading} />
    </div>}
    {tab === "recipes" && <>
      <div className="costing-recipes"><h2>Сохранённые расчёты</h2><button type="button" disabled={busy || loading} onClick={() => open(empty())}>+ Новый расчёт</button>
        {!loading && !data.recipes.length && <p>Пока нет сохранённых расчётов.</p>}
        <div>{data.recipes.map(r => <button type="button" className={draft.id === r.id ? "active" : ""} aria-pressed={draft.id === r.id} disabled={busy} key={r.id} onClick={() => open(r)}><strong>{r.name}</strong><small>{r.product_ids.length ? `Товаров: ${r.product_ids.length}` : "Без привязки к каталогу"}</small><small>{r.product_ids.slice(0, 3).map(key => { const p = data.products.find(p => p.id === key); return p ? `${p.name} · №${p.id}` : `Товар №${key}`; }).join("; ")}{r.product_ids.length > 3 ? "; …" : ""}</small></button>)}</div>
      </div>
      <div className="costing-editor"><fieldset className="costing-editor-fields" disabled={busy || loading}>
        <div className="costing-fields"><label>Название модели<input aria-label="Название модели" value={draft.name} maxLength={160} placeholder="Например, Тыква" onChange={e => edit({ ...draft, name: e.target.value })} /></label><div className="costing-save-state">{dirty ? "Есть несохранённые изменения" : draft.id ? `Сохранённый расчёт №${draft.id}` : "Новая калькуляция"}</div></div>
        <ProductPicker products={data.products} selected={draft.product_ids} cost={total} onChange={product_ids => edit({ ...draft, product_ids })} />
        <h3>Расход материалов на одну свечу</h3><div className="costing-lines">{data.materials.map(m => <label key={m.id}><span>{m.name}<small>{fmt(m.price)} / {m.unit}</small></span>{numberInput(`Расход: ${m.name}`, draft.items[String(m.id)] ?? 0, value => edit({ ...draft, items: { ...draft.items, [m.id]: value ?? 0 } }))}<span>{m.unit}</span><strong>{fmt((draft.items[String(m.id)] || 0) * m.price)}</strong></label>)}</div>
        <div className="costing-fields"><label>Наценка, %{numberInput("Наценка, %", draft.markup_pct, value => edit({ ...draft, markup_pct: value ?? 0 }))}</label><label>Расчётная цена продажи, ₽{numberInput("Расчётная цена продажи, ₽", draft.sale_price, value => edit({ ...draft, sale_price: value }), true)}</label></div>
        <p className="costing-help">Расчётная цена нужна для сценария ниже. Прибыль связанных товаров показана выше по их собственным ценам в каталоге.</p>
        <div className="costing-metrics"><article><span>Себестоимость</span><strong>{fmt(total)}</strong></article><article><span>Цена с наценкой</span><strong>{fmt(recommended)}</strong></article><article><span>Прибыль по расчётной цене</span><strong>{profit == null ? "Не задана цена" : fmt(profit)}</strong></article><article><span>Маржа по расчётной цене</span><strong>{margin == null ? "—" : margin.toFixed(1) + "%"}</strong></article></div>
        {profit != null && profit < 0 && <p className="editor-error">Продажа ниже себестоимости на {fmt(-profit)}.</p>}
        <h3>Структура затрат</h3><div className="costing-breakdown">{breakdown.filter(m => m.cost > 0).map(m => <div key={m.id}><span>{m.name}</span><div><i style={{ width: total ? m.cost / total * 100 + "%" : "0%" }} /></div><strong>{fmt(m.cost)}</strong><small>{total ? (100 * m.cost / total).toFixed(1) : "0"}%</small></div>)}{total === 0 && <p>Укажите расход материалов.</p>}</div>
        <label className="costing-note">Примечание<textarea rows={2} maxLength={2000} value={draft.note} onChange={e => edit({ ...draft, note: e.target.value })} /></label>
        <div className="costing-actions"><button type="button" disabled={!draft.name.trim()} onClick={() => void save({ action: "recipe", ...draft, expected_version: draft.id ? draft.version : undefined })}>{busy ? "Сохраняем…" : "Сохранить расчёт и снимок"}</button>{draft.id > 0 && <button type="button" className="danger" onClick={() => { if (window.confirm("Удалить калькуляцию? Связанные товары и история останутся.")) void save({ action: "remove-recipe", id: draft.id, expected_version: draft.version }); }}>Удалить расчёт</button>}</div>
      </fieldset><p className="costing-disclaimer">Прибыль до неучтённых затрат. Труд, налоги, комиссии и доставку внесите отдельными материалами или дополнительными расходами.</p></div>
    </>}
    {tab === "history" && <div className="costing-history"><h2>История сохранённых себестоимостей</h2>{!data.history.length && <p>История появится после первого сохранения.</p>}{data.history.map(h => <article key={h.id}><span>{new Date(h.saved_at).toLocaleString("ru-RU")}</span><strong>{h.snapshot.name}</strong><span>{fmt(h.snapshot.total)} себестоимость</span><details><summary>Состав и связанные товары</summary>{h.snapshot.items.map((m, i) => <p key={i}>{m.name}: {m.quantity} {m.unit} × {fmt(m.unit_price)}</p>)}{!!h.snapshot.products?.length && <><h3>Товары на момент сохранения</h3>{h.snapshot.products.map(p => <p key={p.id}>{p.name} · №{p.id} · {metadata(p)} · {fmt(p.price)}</p>)}</>}</details></article>)}</div>}
  </div>;
}

function ProductPicker({ products, selected, cost, onChange }: { products: Product[]; selected: number[]; cost: number; onChange: (ids: number[]) => void }) {
  const [query, setQuery] = useState(""), [onlySelected, setOnlySelected] = useState(false);
  const chosen = new Set(selected);
  const normalized = query.trim().toLocaleLowerCase("ru");
  const visible = products.filter(p => (!onlySelected || chosen.has(p.id)) && (!p.archived || chosen.has(p.id)) && `${p.id} ${p.name} ${p.form_name ?? ""} ${metadata(p)}`.toLocaleLowerCase("ru").includes(normalized));
  const missing = selected.filter(key => !products.some(p => p.id === key));
  return <section className="costing-product-picker" aria-label="Привязка товаров к калькуляции">
    <header><div><h3>Связанные товары</h3><p>Отметьте все товары с этой себестоимостью.</p></div><strong aria-live="polite">Выбрано: {selected.length}</strong></header>
    <div className="costing-product-tools"><input type="search" aria-label="Поиск товаров для калькуляции" placeholder="Форма, цвет, аромат или № товара" value={query} onChange={e => setQuery(e.target.value)} /><label><input type="checkbox" checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} />Только выбранные</label></div>
    <div className="costing-product-bulk"><button type="button" disabled={!visible.some(p => !p.archived && !chosen.has(p.id))} onClick={() => onChange([...new Set([...selected, ...visible.filter(p => !p.archived).map(p => p.id)])])}>Выбрать найденные</button><button type="button" disabled={!selected.length} onClick={() => onChange([])}>Снять все</button><span>Найдено: {visible.length}</span></div>
    {!!missing.length && <p className="editor-error">Недоступные товары: {missing.map(key => <button type="button" key={key} onClick={() => onChange(selected.filter(value => value !== key))}>№{key} · убрать</button>)}</p>}
    <div className="costing-product-list">{visible.map(p => { const profit = p.price - cost; const margin = p.price ? profit / p.price * 100 : null; return <label className="costing-product-option" key={p.id} data-selected={chosen.has(p.id)}>
      <input type="checkbox" aria-label={`Привязать товар №${p.id}: ${p.name}`} checked={chosen.has(p.id)} onChange={e => onChange(e.target.checked ? [...selected, p.id] : selected.filter(key => key !== p.id))} />
      <span className="costing-product-name"><strong>{p.name}</strong><small>{metadata(p) || "Без дополнительных параметров"}</small><small>№{p.id} · {p.archived ? "В архиве" : p.published ? "На сайте" : "Черновик"}</small></span>
      <span className="costing-product-money"><small>Цена в каталоге</small><strong>{fmt(p.price)}</strong></span>
      <span className="costing-product-money" data-loss={profit < 0}><small>Прибыль / маржа</small><strong>{fmt(profit)}</strong><small>{margin == null ? "Маржа не определена" : margin.toFixed(1) + "%"}</small></span>
    </label>; })}{!visible.length && <p className="costing-empty-products">{products.length ? "По этому запросу товаров нет. Измените поиск или снимите ограничение «Только выбранные»." : "Сначала добавьте товары в разделе «Остатки». Калькуляцию можно сохранить без привязки."}</p>}</div>
    <p className="costing-help">Привязки сохраняются кнопкой «Сохранить расчёт и снимок». Удаление галочки не удаляет товар.</p>
  </section>;
}

function MaterialRow({ material, onSave, disabled }: { material: Material; onSave: (m: Material) => Promise<boolean>; disabled: boolean }) {
  const [draft, setDraft] = useState(material);
  return <div className="costing-material-row"><input aria-label="Материал" value={draft.name} placeholder="Новый материал" disabled={disabled} onChange={e => setDraft({ ...draft, name: e.target.value })} /><input aria-label="Единица" value={draft.unit} disabled={disabled} onChange={e => setDraft({ ...draft, unit: e.target.value })} /><input aria-label="Цена за единицу" type="number" min="0" step="0.0001" value={draft.price} disabled={disabled} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} /><button type="button" disabled={disabled || !draft.name.trim()} onClick={() => void onSave(draft).then(ok => { if (ok && !material.id) setDraft({ ...material }); })}>Сохранить</button></div>;
}
