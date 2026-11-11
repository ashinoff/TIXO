/** Shared report contracts and pure calculations. No credentials or customer data enter public catalog endpoints. */
export type ReportPeriod = { from: string; to: string };
export type ReportMaterial = { id: number; name: string; unit: string; price: number };
export type ReportRecipe = { id: number; name: string; productIds: number[]; items: Record<string, number>; markup: number; salePrice: number | null; note: string; updatedAt: string };
export type ReportProduct = { id: number; name: string; form: string; color: string; accent: string; scent: string; stock: number; price: number; published: boolean; visible: boolean; archived: boolean; legacyVariantId: number | null; volume: number | null };
export type ReportOrderItem = { productId: number; variantId?: number | null; name: string; quantity: number; price: number; colorName?: string; accentColorName?: string; scentName?: string; formName?: string; quotePending?: boolean; customRecipe?: unknown };
export type ReportOrder = { id: number; number: string; createdAt: string; status: string; stockReserved: boolean; total: number; customer: string; phone: string; email: string; delivery: string; address: string; comment: string; channels: string[]; items: ReportOrderItem[] };
export type ReportExpense = { id: number; date: string; category: string; description: string; amount: number; version: number };
export type ReportHistory = { id: number; recipeId: number | null; savedAt: string; name: string; total: number; salePrice: number | null; note: string };
export type TradeSource = { products: ReportProduct[]; materials: ReportMaterial[]; recipes: ReportRecipe[]; orders: ReportOrder[]; expenses: ReportExpense[]; history: ReportHistory[] };
export type CostStatus = "ready" | "missing" | "multiple" | "incomplete";
export const costStatusNames: Record<CostStatus, string> = { ready: "Рассчитано", missing: "Нет калькуляции", multiple: "Несколько калькуляций", incomplete: "Не заполнен состав" };
export const orderStatusNames: Record<string, string> = { new: "Новый", in_progress: "В процессе", completed: "Выполнен" };
export type InventoryRow = ReportProduct & { reserved: number; costStatus: CostStatus; recipeName: string; unitCost: number | null; stockCost: number | null; revenue: number; profit: number | null; margin: number | null };
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const moscowDate = (date: string | Date = new Date()) => new Date(date).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
export const inPeriod = (date: string, period: ReportPeriod) => (!period.from || date >= period.from) && (!period.to || date <= period.to);

export function recipeCost(recipe: ReportRecipe, materials: ReportMaterial[]): number | null {
  const prices = new Map(materials.map(m => [m.id, m.price]));
  const lines = Object.entries(recipe.items).map(([id, qty]) => [Number(id), Number(qty)]);
  if (!lines.some(([, qty]) => qty > 0) || lines.some(([id, qty]) => !Number.isFinite(qty) || qty < 0 || !prices.has(id))) return null;
  return roundMoney(lines.reduce((sum, [id, qty]) => sum + qty * prices.get(id)!, 0));
}

export function buildTradeReport(source: TradeSource, period: ReportPeriod, generatedAt = new Date().toISOString()) {
  const links = new Map<number, ReportRecipe[]>();
  for (const recipe of source.recipes) for (const id of new Set(recipe.productIds)) links.set(id, [...(links.get(id) ?? []), recipe]);
  const variants = new Map(source.products.filter(p => p.legacyVariantId != null).map(p => [p.legacyVariantId!, p.id]));
  const itemProductId = (item: ReportOrderItem) => item.variantId != null ? variants.get(item.variantId) : item.productId;
  const reserved = new Map<number, number>();
  let reservedUnits = 0;
  for (const order of source.orders) if (order.stockReserved && order.status !== "completed") for (const item of order.items) {
    if (item.customRecipe || item.quotePending) continue;
    reservedUnits += item.quantity;
    const id = itemProductId(item);
    if (id != null) reserved.set(id, (reserved.get(id) ?? 0) + item.quantity);
  }
  const costFor = (productId: number) => {
    const recipes = links.get(productId) ?? [];
    const status: CostStatus = recipes.length === 0 ? "missing" : recipes.length > 1 ? "multiple" : recipeCost(recipes[0], source.materials) == null ? "incomplete" : "ready";
    return { status, cost: status === "ready" ? recipeCost(recipes[0], source.materials) : null, name: recipes.map(r => r.name).join("; ") };
  };
  const inventory: InventoryRow[] = source.products.filter(p => !p.archived).map(p => {
    const { status, cost, name } = costFor(p.id);
    return { ...p, reserved: reserved.get(p.id) ?? 0, costStatus: status, recipeName: name, unitCost: cost,
      stockCost: cost == null ? null : roundMoney(p.stock * cost), revenue: roundMoney(p.stock * p.price),
      profit: cost == null ? null : roundMoney(p.stock * (p.price - cost)), margin: cost == null || p.price === 0 ? null : (p.price - cost) / p.price };
  });
  const orders = source.orders.filter(o => inPeriod(moscowDate(o.createdAt), period));
  const expenses = source.expenses.filter(e => inPeriod(e.date, period));
  const completed = orders.filter(o => o.status === "completed"), active = orders.filter(o => o.status !== "completed");
  const known = inventory.filter(p => p.unitCost != null), unknown = inventory.filter(p => p.unitCost == null && p.stock > 0);
  const sum = <T,>(rows: T[], value: (row: T) => number) => roundMoney(rows.reduce((total, row) => total + value(row), 0));
  const categoryTotals = new Map<string, number>();
  for (const e of expenses) categoryTotals.set(e.category, roundMoney((categoryTotals.get(e.category) ?? 0) + e.amount));
  const salesByForm = new Map<string, { name: string; units: number; revenue: number }>();
  for (const order of completed) for (const item of order.items) if (!item.quotePending && !item.customRecipe) {
    const name = item.formName || item.name;
    const entry = salesByForm.get(name) ?? { name, units: 0, revenue: 0 };
    entry.units += item.quantity; entry.revenue = roundMoney(entry.revenue + item.quantity * item.price); salesByForm.set(name, entry);
  }
  return { generatedAt, period, inventory, expenses,
    expenseCategories: [...categoryTotals].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    salesByForm: [...salesByForm.values()].sort((a, b) => b.revenue - a.revenue),
    summary: {
      positions: inventory.length, availableUnits: sum(inventory, p => p.stock), reservedUnits,
      lowStock: inventory.filter(p => p.stock > 0 && p.stock <= 3).length, outOfStock: inventory.filter(p => p.stock === 0).length,
      potentialRevenue: sum(inventory, p => p.revenue), visibleRevenue: sum(inventory.filter(p => p.visible), p => p.revenue),
      estimatedStockCost: sum(known, p => p.stockCost ?? 0), estimatedProfit: sum(known, p => p.profit ?? 0),
      costedUnits: sum(known, p => p.stock), uncostedUnits: sum(unknown, p => p.stock), uncostedPositions: unknown.length,
      uncostedRevenue: sum(unknown, p => p.revenue), ambiguousPositions: inventory.filter(p => p.costStatus === "multiple").length,
      orderCount: orders.length, completedCount: completed.length, completedValue: sum(completed, o => o.total),
      activeCount: active.length, activeValue: sum(active, o => o.total),
      quoteOrders: orders.filter(o => o.items.some(i => i.quotePending)).length,
      expenseTotal: sum(expenses, e => e.amount), expenseCount: expenses.length,
    },
  };
}
export type TradeReport = ReturnType<typeof buildTradeReport>;

export function filterInventory(rows: InventoryRow[], query: string, status: string) {
  const needle = query.trim().toLocaleLowerCase("ru");
  return rows.filter(p => `${p.id} ${p.name} ${p.color} ${p.accent} ${p.scent} ${p.recipeName}`.toLocaleLowerCase("ru").includes(needle)
    && (!status || (status === "available" ? p.stock > 0 : status === "low" ? p.stock > 0 && p.stock <= 3 : status === "empty" ? p.stock === 0 : status === "uncosted" ? p.unitCost == null : status === "hidden" ? !p.visible : true)));
}
