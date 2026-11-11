import ExcelJS from "exceljs";
import { buildTradeReport, costStatusNames, inPeriod, moscowDate, orderStatusNames, recipeCost, roundMoney, filterInventory, type ReportPeriod, type TradeSource } from "../trade-report";
export const exportKinds = ["all", "inventory", "costing", "orders", "expenses"] as const;
export type ExportKind = typeof exportKinds[number];
type Value = string | number | Date | null;
type Column = { title: string; width?: number; format?: string };
const money = '#,##0.00" ₽";[Red]-#,##0.00" ₽";0.00" ₽"';
const decimal = '#,##0.0000';
const rub = (title: string): Column => ({ title, width: 21, format: money });
const qty = (title: string): Column => ({ title, width: 15, format: '#,##0.##' });
const localDateTime = (value: string) => new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000);

/** Strings are explicit text cells, never executable formulas, including buyer-entered =,+,-,@ values. */
function sheet(book: ExcelJS.Workbook, name: string, columns: Column[], rows: Value[][]) {
  const page = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }], properties: { defaultRowHeight: 23 } });
  page.columns = columns.map((c, i) => ({ header: c.title, key: String(i), width: c.width ?? 28, style: { font: { name: "Calibri", size: 11 }, alignment: { vertical: "top", wrapText: true }, ...(c.format ? { numFmt: c.format } : {}) } }));
  page.addRows(rows.map(row => row.map(value => typeof value === "string" ? value.slice(0, 32767) : value)));
  page.getRow(1).height = 36;
  page.getRow(1).eachCell(cell => { cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF38472F" } }; cell.alignment = { vertical: "middle", wrapText: true }; });
  page.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, page.rowCount), column: columns.length } };
  page.eachRow((row, i) => { if (i > 1 && i % 2 === 0) row.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F2E9" } }; }); });
  page.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "1:1" };
  return page;
}

export async function tradeWorkbook(source: TradeSource, period: ReportPeriod, kind: ExportKind, options = { query: "", stock: "" }) {
  const book = new ExcelJS.Workbook(); book.creator = "Мастерская ТИХО"; book.created = new Date(); book.subject = "Учёт торговли и себестоимости";
  const report = buildTradeReport(source, period), s = report.summary;
  sheet(book, "Сводка", [{ title: "Показатель", width: 48 }, { title: "Значение", width: 28 }, { title: "Пояснение", width: 95 }], [
    ["Сформировано (Москва)", localDateTime(report.generatedAt), "Все даты и время — по Москве"],
    ["Период заказов и расходов", `${period.from || "Начало учёта"} — ${period.to || "сегодня"}`, "Период заказов определяется датой создания; статус — текущий. Остатки и цены — на момент выгрузки."],
    ["Доступно свечей, шт.", s.availableUnits, "Без резерва оформленных заказов; включая черновики и скрытые позиции, без архива."],
    ["В резерве, шт.", s.reservedUnits, "Только незавершённые заказы с подтверждённым резервированием, за всё время."],
    ["Выручка от продажи доступного остатка, ₽", s.potentialRevenue, "Все доступные остатки × текущие цены каталога; это прогноз, не поступившие деньги."],
    ["Из них по видимым товарам, ₽", s.visibleRevenue, "Товары, опубликованные и доступные по справочникам."],
    ["Расчётная себестоимость остатка, ₽", s.estimatedStockCost, `Только ${s.costedUnits} шт. с однозначной заполненной калькуляцией. Текущие закупочные цены.`],
    ["Ожидаемая валовая прибыль, ₽", s.estimatedProfit, "Выручка минус себестоимость только для рассчитанных позиций; до неучтённых затрат."],
    ["Остаток без расчёта, шт.", s.uncostedUnits, `Позиций: ${s.uncostedPositions}. Отсутствующая или неоднозначная себестоимость не считается нулевой.`],
    ["Выручка остатка без расчёта, ₽", s.uncostedRevenue, "Исключена из расчёта ожидаемой валовой прибыли."],
    ["Стоимость выполненных заказов, ₽", s.completedValue, `Заказов: ${s.completedCount}. Фактическая оплата в системе не фиксируется.`],
    ["Стоимость заказов в работе, ₽", s.activeValue, `Заказов: ${s.activeCount}. Цены — из сохранённого заказа, не из сегодняшнего каталога.`],
    ["Расходы по журналу, ₽", s.expenseTotal, "Фактически внесённые расходы за выбранный период. Не вычитаются повторно из себестоимости."],
    ["Исторические заказы по запросу", s.quoteOrders, "Несогласованная стоимость не включена в денежные итоги."],
    ["Поиск в реестре", options.query, options.stock ? `Фильтр остатков: ${options.stock}` : "Без фильтра наличия"],
  ]).getCell("B2").numFmt = "dd.mm.yyyy hh:mm";
  if (kind === "all" || kind === "inventory") {
    const rows = filterInventory(report.inventory, options.query, options.stock);
    sheet(book, "Остатки", [qty("ID товара"), { title: "Форма / товар" }, { title: "Цвет" }, { title: "Декор" }, { title: "Аромат" }, { title: "Видимость" }, qty("Объём, мл"), qty("Доступно, шт."), qty("Резерв, шт."), rub("Цена продажи"), rub("Себестоимость 1 шт."), rub("Себестоимость остатка"), rub("Потенциальная выручка"), rub("Ожидаемая валовая прибыль"), { title: "Маржа", width: 15, format: "0.0%" }, { title: "Статус расчёта" }, { title: "Калькуляция", width: 38 }],
      rows.map(p => [p.id, p.name, p.color, p.accent, p.scent, p.visible ? "На сайте" : p.published ? "Скрыт справочником" : "Черновик", p.volume, p.stock, p.reserved, p.price, p.unitCost, p.stockCost, p.revenue, p.profit, p.margin, costStatusNames[p.costStatus], p.recipeName]));
  }
  if (kind === "all" || kind === "costing") {
    sheet(book, "Калькуляции", [qty("ID"), { title: "Название", width: 36 }, { title: "ID связанных товаров" }, rub("Себестоимость"), qty("Наценка, %"), rub("Цена с наценкой"), rub("Расчётная цена"), rub("Прибыль по расчётной цене"), { title: "Изменено (Москва)", width: 24, format: "dd.mm.yyyy hh:mm" }, { title: "Примечание", width: 55 }], source.recipes.map(r => {
      const cost = recipeCost(r, source.materials);
      return [r.id, r.name, r.productIds.join(", "), cost, r.markup, cost == null ? null : roundMoney(cost * (1 + r.markup / 100)), r.salePrice, cost == null || r.salePrice == null ? null : roundMoney(r.salePrice - cost), localDateTime(r.updatedAt), r.note];
    }));
    sheet(book, "Состав калькуляций", [qty("ID калькуляции"), { title: "Калькуляция" }, qty("ID материала"), { title: "Материал" }, { title: "Единица", width: 14 }, qty("Расход на свечу"), { title: "Цена за единицу, ₽", width: 23, format: decimal }, rub("Затраты на свечу")], source.recipes.flatMap(r => Object.entries(r.items).filter(([, q]) => Number(q) > 0).map(([id, q]) => { const m = source.materials.find(m => m.id === Number(id)); return [r.id, r.name, Number(id), m?.name ?? "Материал отсутствует", m?.unit ?? "", Number(q), m?.price ?? null, m ? roundMoney(Number(q) * m.price) : null]; })));
    sheet(book, "Материалы", [qty("ID"), { title: "Материал", width: 40 }, { title: "Единица", width: 14 }, { title: "Закупочная цена за единицу, ₽", width: 30, format: decimal }], source.materials.map(m => [m.id, m.name, m.unit, m.price]));
    sheet(book, "История себестоимости", [qty("ID снимка"), qty("ID калькуляции"), { title: "Дата (Москва)", width: 24, format: "dd.mm.yyyy hh:mm" }, { title: "Название" }, rub("Себестоимость в снимке"), rub("Расчётная цена в снимке"), { title: "Примечание", width: 55 }], source.history.filter(h => inPeriod(moscowDate(h.savedAt), period)).map(h => [h.id, h.recipeId, localDateTime(h.savedAt), h.name, h.total, h.salePrice, h.note]));
  }
  if (kind === "all" || kind === "orders") {
    const orders = source.orders.filter(o => inPeriod(moscowDate(o.createdAt), period));
    sheet(book, "Заказы", [qty("ID"), { title: "Номер", width: 24 }, { title: "Создан (Москва)", width: 24, format: "dd.mm.yyyy hh:mm" }, { title: "Статус" }, { title: "Покупатель" }, { title: "Телефон", width: 24 }, { title: "Email" }, { title: "Доставка" }, { title: "Адрес", width: 50 }, { title: "Комментарий", width: 50 }, qty("Количество, шт."), rub("Сумма заказа"), { title: "Резерв подтверждён" }, { title: "Стоимость по запросу" }, { title: "Переходы в мессенджеры" }], orders.map(o => [o.id, o.number, localDateTime(o.createdAt), orderStatusNames[o.status] ?? o.status, o.customer, o.phone, o.email, o.delivery, o.address, o.comment, o.items.reduce((s, i) => s + i.quantity, 0), o.total, o.stockReserved ? "Да" : "Нет", o.items.some(i => i.quotePending) ? "Да, не включена" : "Нет", o.channels.join(", ")]));
    sheet(book, "Позиции заказов", [{ title: "Номер заказа", width: 24 }, { title: "Создан (Москва)", width: 24, format: "dd.mm.yyyy hh:mm" }, { title: "Статус" }, qty("ID товара"), qty("ID прежнего варианта"), { title: "Товар / форма", width: 36 }, { title: "Цвет" }, { title: "Декор" }, { title: "Аромат" }, qty("Количество"), rub("Цена в заказе"), rub("Сумма позиции"), { title: "Стоимость по запросу" }], orders.flatMap(o => o.items.map(i => [o.number, localDateTime(o.createdAt), orderStatusNames[o.status] ?? o.status, i.productId || null, i.variantId ?? null, i.name, i.colorName ?? "", i.accentColorName ?? "", i.scentName ?? "", i.quantity, i.quotePending ? null : i.price, i.quotePending ? null : roundMoney(i.price * i.quantity), i.quotePending ? "Да" : "Нет"])));
    sheet(book, "Выполнено по формам", [{ title: "Форма / товар", width: 45 }, qty("Количество, шт."), rub("Стоимость в заказах")], report.salesByForm.map(r => [r.name, r.units, r.revenue]));
  }
  if (kind === "all" || kind === "expenses") sheet(book, "Расходы", [qty("ID"), { title: "Дата", width: 16, format: "dd.mm.yyyy" }, { title: "Категория" }, { title: "Описание", width: 65 }, rub("Сумма")], report.expenses.map(e => [e.id, new Date(e.date + "T00:00:00Z"), e.category, e.description, e.amount]));
  return book.xlsx.writeBuffer();
}
