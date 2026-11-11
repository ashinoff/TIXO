"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { costStatusNames, filterInventory, inPeriod, moscowDate, type ReportExpense, type ReportPeriod, type TradeReport } from "@/lib/trade-report";
import { CostCalculator } from "./cost-calculator";
import { ExportButton } from "./export-button";
import "./trade-dashboard.css";
const money = (n: number | null) => n == null ? "—" : n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const dateLabel = (date: string) => date ? date.split("-").reverse().join(".") : "за всё время";
type Section = "overview" | "inventory" | "expenses" | "calculator";
const sections: [Section, string][] = [["overview", "Обзор"], ["inventory", "Реестр остатков"], ["expenses", "Расходы"], ["calculator", "Калькуляции"]];
const newExpense = (): ReportExpense => ({ id: 0, date: moscowDate(), category: "Материалы", description: "", amount: 0, version: 1 });

export function CostingWorkspace() {
  const [section, setSection] = useState<Section>("overview");
  return <div className="trade-workspace"><nav className="trade-tabs" aria-label="Учёт мастерской">{sections.map(([key, name]) => <button type="button" key={key} className={section === key ? "selected" : ""} aria-pressed={section === key} onClick={() => setSection(key)}>{name}</button>)}</nav>
    {section === "calculator" ? <><div className="trade-calculator-export"><ExportButton kind="costing" label="Себестоимость в Excel" /></div><CostCalculator /></> : <TradeDashboard section={section} openCalculator={() => setSection("calculator")} />}
  </div>;
}

export function TradeDashboard({ section, openCalculator }: { section: Exclude<Section, "calculator">; openCalculator: () => void }) {
  const [period, setPeriod] = useState<ReportPeriod>(() => ({ from: moscowDate().slice(0, 7) + "-01", to: moscowDate() }));
  const [dates, setDates] = useState(period);
  const [report, setReport] = useState<TradeReport | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [query, setQuery] = useState(""), [stock, setStock] = useState("");
  const savingExpense = useRef(false);
  const [draft, setDraft] = useState<ReportExpense>(newExpense), [saving, setSaving] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/reports?${new URLSearchParams(period)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить сводку");
        if (!controller.signal.aborted) setReport(data);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [period, reload]);
  const rows = useMemo(() => filterInventory(report?.inventory ?? [], query, stock), [report, query, stock]);
  const expenseAction = async (body: Record<string, unknown>) => {
    if (savingExpense.current) return; savingExpense.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось сохранить расход");
      if (body.action === "expense") { setDraft(newExpense()); setNotice(inPeriod(String(body.date), period) ? "Расход сохранён." : "Расход сохранён. Его дата вне выбранного периода — измените период, чтобы увидеть запись."); }
      else { if (draft.id === body.id) setDraft(newExpense()); setNotice("Расход удалён из журнала."); }
      setReload(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить расход"); }
    finally { savingExpense.current = false; setSaving(false); }
  };
  const applyDates = (event: FormEvent) => { event.preventDefault(); if (dates.from && dates.to && dates.from > dates.to) { setError("Начало периода позже окончания"); return; } setPeriod({ ...dates }); };
  const s = report?.summary;
  return <div className="trade-dashboard" aria-busy={loading || saving}>
    <div className="trade-heading"><div><span className="admin-kicker">Учёт готовых свечей</span><h2>{section === "overview" ? "Мастерская в цифрах" : section === "inventory" ? "Остатки по позициям" : "Журнал расходов"}</h2><p>{section === "inventory" ? "Доступное количество уже уменьшено на оформленные заказы. Резерв показан отдельно." : "Остатки — сейчас. Заказы и расходы — за выбранный период."}</p></div><button type="button" disabled={loading || saving} onClick={() => setReload(n => n + 1)}>Обновить</button></div>
    {section !== "inventory" && <form className="trade-period" onSubmit={applyDates}><label>С даты<input type="date" min="2000-01-01" max="2100-12-31" aria-label="Начало периода" value={dates.from} onChange={e => setDates({ ...dates, from: e.target.value })} /></label><label>По дату<input type="date" min="2000-01-01" max="2100-12-31" aria-label="Конец периода" value={dates.to} onChange={e => setDates({ ...dates, to: e.target.value })} /></label><button disabled={loading}>Показать</button><button type="button" disabled={loading} onClick={() => { const all = { from: "", to: "" }; setDates(all); setPeriod(all); }}>За всё время</button></form>}
    {error && <p className="editor-error" role="alert">{error}</p>}{notice && <p className="trade-notice" role="status">{notice}</p>}{loading && <p role="status" className="trade-loading">Обновляем расчёты…</p>}
    {report && s && <>
      <p className="trade-stamp">Снимок на {new Date(report.generatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК{section !== "inventory" && ` · Период: ${dateLabel(report.period.from)}${report.period.to ? ` — ${dateLabel(report.period.to)}` : ""}`}{error ? " · Не удалось обновить, показаны предыдущие данные" : ""}</p>
      {section === "overview" && <>
        <div className="trade-metrics">
          <Metric label="Доступно свечей" value={`${s.availableUnits} шт.`} note={`${s.positions} позиций · в резерве ещё ${s.reservedUnits} шт.`} />
          <Metric label="Потенциальная выручка" value={money(s.potentialRevenue)} note={`От продажи всех остатков. На витрине: ${money(s.visibleRevenue)}`} />
          <Metric label="Себестоимость остатка" value={money(s.estimatedStockCost)} note={`По текущим ценам материалов · рассчитано ${s.costedUnits} шт.`} />
          <Metric label="Ожидаемая валовая прибыль" value={money(s.estimatedProfit)} note="Только позиции с расчётом, до неучтённых затрат" negative={s.estimatedProfit < 0} />
        </div>
        {s.uncostedPositions > 0 && <div className="trade-warning"><strong>Не рассчитано: {s.uncostedPositions} позиций · {s.uncostedUnits} шт.</strong><span>Их выручка {money(s.uncostedRevenue)} не включена в оценку прибыли. {s.ambiguousPositions > 0 && `У ${s.ambiguousPositions} позиций несколько калькуляций — оставьте одну связь.`}</span><button type="button" onClick={openCalculator}>Открыть калькуляции</button></div>}
        <div className="trade-metrics trade-period-metrics">
          <Metric label="Выполненные заказы" value={money(s.completedValue)} note={`${s.completedCount} заказов, созданных за период. Это стоимость заказов, не подтверждение оплаты.`} />
          <Metric label="Заказы в работе" value={money(s.activeValue)} note={`${s.activeCount} новых и обрабатываемых заказов за период`} />
          <Metric label="Расходы по журналу" value={money(s.expenseTotal)} note={`${s.expenseCount} записей за период. Вносятся вручную.`} />
          <Metric label="Требуют пополнения" value={`${s.lowStock} позиций`} note={`Остаток 1–3 шт. · закончились: ${s.outOfStock}`} />
        </div>
        <div className="trade-chart-grid"><Breakdown title="На что потратили" empty="Расходы появятся после добавления в журнал." rows={report.expenseCategories.map(r => ({ label: r.name, value: r.amount }))} /><Breakdown title="Выполненные заказы по формам" empty="За выбранный период выполненных заказов нет." rows={report.salesByForm.slice(0, 8).map(r => ({ label: `${r.name} · ${r.units} шт.`, value: r.revenue }))} /></div>
        <p className="trade-note">Стоимость остатков рассчитывается по текущим калькуляциям и закупочным ценам. Расходы из журнала не вычитаются повторно: закупка материалов может уже входить в себестоимость. Налоги, комиссии и доставку учитывайте в калькуляциях, если они должны входить в прогноз прибыли.{s.quoteOrders > 0 && ` В периоде есть ${s.quoteOrders} исторических заказов по запросу; несогласованные суммы исключены.`}</p>
        <section className="trade-export-panel"><h3>Отчёты для работы</h3><p>Excel с отдельными листами, фильтрами и числовыми суммами. Заказы, расходы и история калькуляций — за выбранный период.</p><div><ExportButton kind="all" label="Вся книга Excel" params={period} disabled={loading} /><ExportButton kind="inventory" label="Остатки" disabled={loading} /><ExportButton kind="costing" label="Себестоимость" params={period} disabled={loading} /><ExportButton kind="orders" label="Заказы и позиции" params={period} disabled={loading} /><ExportButton kind="expenses" label="Расходы" params={period} disabled={loading} /></div></section>
      </>}
      {section === "inventory" && <>
        <div className="trade-register-tools"><label>Поиск<input type="search" aria-label="Поиск в реестре остатков" placeholder="Номер, форма, цвет, аромат" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Показать<select aria-label="Отбор остатков" value={stock} onChange={e => setStock(e.target.value)}><option value="">Все позиции</option><option value="available">В наличии</option><option value="low">Заканчиваются · 1–3 шт.</option><option value="empty">Нет в наличии</option><option value="uncosted">Без однозначной калькуляции</option><option value="hidden">Скрытые и черновики</option></select></label><ExportButton kind="inventory" label="Реестр в Excel" params={{ q: query, stock }} disabled={loading} /></div>
        <p className="trade-note">Найдено: {rows.length} позиций · {rows.reduce((n, r) => n + r.stock, 0)} шт. · потенциальная выручка {money(rows.reduce((n, r) => n + r.revenue, 0))}</p>
        <div className="trade-table-scroll" tabIndex={0} role="region" aria-label="Реестр остатков"><table><caption>Остатки, резерв и оценка по текущим калькуляциям</caption><thead><tr><th>Товар</th><th>Доступно</th><th>Резерв</th><th>Цена</th><th>Себест. / шт.</th><th>Себест. остатка</th><th>Выручка</th><th>Валовая прибыль</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td><strong>№ {p.id} · {p.name}</strong><small>{[p.color, p.accent, p.scent].filter(Boolean).join(" · ")}</small><small>{p.visible ? "На сайте" : p.published ? "Скрыт справочником" : "Черновик"} · {p.recipeName || "Нет калькуляции"}</small></td><td className={p.stock <= 3 ? "trade-low" : ""}>{p.stock} шт.</td><td>{p.reserved} шт.</td><td>{money(p.price)}</td><td>{p.unitCost == null ? <span className="trade-cost-missing">{costStatusNames[p.costStatus]}</span> : money(p.unitCost)}</td><td>{money(p.stockCost)}</td><td>{money(p.revenue)}</td><td className={(p.profit ?? 0) < 0 ? "trade-negative" : ""}>{money(p.profit)}</td></tr>)}</tbody></table>{!rows.length && <p className="trade-empty">Подходящих позиций нет.</p>}</div>
      </>}
      {section === "expenses" && <>
        <div className="trade-expense-heading"><p>За период: <strong>{money(s.expenseTotal)}</strong> · {s.expenseCount} записей</p><ExportButton kind="expenses" label="Расходы в Excel" params={period} disabled={loading} /></div>
        <form className="trade-expense-form" onSubmit={event => { event.preventDefault(); void expenseAction({ ...draft, action: "expense" }); }}><h3>{draft.id ? "Редактировать расход" : "Добавить расход"}</h3><fieldset disabled={saving}><label>Дата<input type="date" required min="2000-01-01" max="2100-12-31" aria-label="Дата расхода" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label><label>Категория<input required maxLength={80} list="expense-categories" aria-label="Категория расхода" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} /><datalist id="expense-categories">{["Материалы", "Упаковка", "Доставка", "Реклама", "Комиссии", "Налоги", "Оборудование", "Прочее"].map(c => <option key={c} value={c} />)}</datalist></label><label>Сумма, ₽<input type="number" required min="0.01" max="100000000" step="0.01" inputMode="decimal" aria-label="Сумма расхода" value={draft.amount || ""} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></label><label className="trade-expense-description">Описание<input maxLength={1000} aria-label="Описание расхода" value={draft.description} placeholder="Например, закупка воска, счёт №…" onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><div className="trade-expense-actions"><button disabled={saving || !draft.amount}>{saving ? "Сохраняем…" : draft.id ? "Сохранить расход" : "Добавить расход"}</button>{draft.id > 0 && <button type="button" onClick={() => setDraft(newExpense())}>Отменить редактирование</button>}</div></fieldset></form>
        <div className="trade-table-scroll" tabIndex={0} role="region" aria-label="Журнал расходов"><table><caption>Расходы за выбранный период</caption><thead><tr><th>Дата</th><th>Категория</th><th>Описание</th><th>Сумма</th><th>Действия</th></tr></thead><tbody>{report.expenses.map(e => <tr key={e.id}><td>{dateLabel(e.date)}</td><td>{e.category}</td><td>{e.description || "—"}</td><td>{money(e.amount)}</td><td><div className="trade-row-actions"><button type="button" disabled={saving} aria-label={`Изменить расход №${e.id}`} onClick={() => { setDraft({ ...e }); setNotice(""); }}>Изменить</button><button type="button" disabled={saving} aria-label={`Удалить расход №${e.id}`} onClick={() => { if (window.confirm(`Удалить расход «${e.category}» на ${money(e.amount)}?`)) void expenseAction({ action: "remove-expense", id: e.id, version: e.version }); }}>Удалить</button></div></td></tr>)}</tbody></table>{!report.expenses.length && <p className="trade-empty">В этом периоде расходов нет.</p>}</div>
      </>}
    </>}
  </div>;
}
function Metric({ label, value, note, negative = false }: { label: string; value: string; note: string; negative?: boolean }) { return <article className={negative ? "trade-metric trade-negative" : "trade-metric"}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Breakdown({ title, rows, empty }: { title: string; rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <section className="trade-breakdown"><h3>{title}</h3>{!rows.length ? <p className="trade-empty">{empty}</p> : rows.map(r => <div key={r.label}><span>{r.label}</span><strong>{money(r.value)}</strong><i aria-hidden="true"><b style={{ width: `${r.value / max * 100}%` }} /></i></div>)}</section>;
}
