"use client";
import { useEffect, useState } from "react";
import { sitePageNames, type SiteStats } from "../../lib/site-stats";
import "./site-statistics.css";
const number = (value: number) => value.toLocaleString("ru-RU");
const date = (value: string) => value.split("-").reverse().join(".");

export function SiteStatistics() {
  const [days, setDays] = useState(30), [revision, setRevision] = useState(0);
  const [data, setData] = useState<SiteStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError(""); setData(null);
      try {
        const response = await fetch(`/api/admin/stats?days=${days}`, { cache: "no-store", signal: controller.signal });
        const report = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Сессия завершилась. Войдите в админку снова." : report.error || "Не удалось загрузить статистику");
        if (!controller.signal.aborted) setData(report);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить статистику"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); return () => controller.abort();
  }, [days, revision]);
  const peak = Math.max(1, ...(data?.daily.map(row => row.views) ?? []));
  return <div className="site-statistics" aria-busy={loading}>
    <p className="admin-intro">Простой счётчик просмотров. Сохраняются только день, страница и общее количество. Без cookies счётчика, IP-адресов и идентификаторов посетителей.</p>
    <div className="site-stats-toolbar"><div aria-label="Период статистики">{[7, 30, 90].map(value => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} дней</button>)}</div><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Обновить</button></div>
    {loading && <p role="status">Загружаем статистику…</p>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    {data && <>
      <div className="site-stats-metrics">{([['Сегодня', data.summary.today], ['За 7 дней', data.summary.week], ['За 30 дней', data.summary.month], ['Всего с запуска счётчика', data.summary.total]] as const).map(([label, value]) => <article key={label}><span>{label}</span><strong>{number(value)}</strong><small>просмотров</small></article>)}</div>
      <section className="site-stats-panel"><header><h2>Просмотры по дням</h2><span>{date(data.from)} — {date(data.to)} · МСК</span></header>
        {data.summary.total === 0 && <p className="site-stats-empty">Пока просмотров нет. Статистика начнёт собираться после публикации этой версии; прошлые посещения восстановить нельзя.</p>}
        <div className="site-stats-chart" role="img" aria-label={`Просмотры за ${days} дней: ${number(data.daily.reduce((sum, row) => sum + row.views, 0))}. Значения доступны в таблице ниже.`}>{data.daily.map(row => <div key={row.date} title={`${date(row.date)}: ${number(row.views)}`}><i style={{ height: `${row.views / peak * 100}%` }} /></div>)}</div>
        <div className="site-stats-axis"><span>{date(data.from)}</span><span>Максимум за день: {number(Math.max(0, ...data.daily.map(row => row.views)))}</span><span>{date(data.to)}</span></div>
        <details><summary>Таблица по дням</summary><div className="site-stats-table"><table><thead><tr><th>Дата, МСК</th><th>Просмотры</th></tr></thead><tbody>{data.daily.map(row => <tr key={row.date}><td>{date(row.date)}</td><td>{number(row.views)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="site-stats-panel"><h2>Страницы за выбранный период</h2>{data.pages.length ? <table><thead><tr><th>Страница</th><th>Просмотры</th></tr></thead><tbody>{data.pages.map(row => <tr key={row.path}><td>{sitePageNames[row.path]}<small>{row.path}</small></td><td>{number(row.views)}</td></tr>)}</tbody></table> : <p>За этот период просмотров нет.</p>}</section>
    </>}
    <p className="site-stats-note">Открытие или обновление страницы — один просмотр. Один человек может дать несколько просмотров; уникальные посетители не определяются. Учитываются витрина и страницы документов, включая ваши собственные открытия витрины. Админка не учитывается. Известные роботы отфильтрованы, но блокировщики, отключённый JavaScript и ошибки сети могут уменьшать показания.</p>
  </div>;
}
