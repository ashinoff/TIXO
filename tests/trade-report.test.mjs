import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const temp = mkdtempSync(path.join(tmpdir(), 'tixo-report-'));
writeFileSync(path.join(temp, 'package.json'), '{"type":"commonjs"}');
symlinkSync(path.resolve('node_modules'), path.join(temp, 'node_modules'), 'dir');
for (const file of ['lib/trade-report.ts', 'lib/server/trade-workbook.ts']) {
  const target = path.join(temp, file.replace(/\.ts$/, '.js')); mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
}
const require = createRequire(path.join(temp, 'test.cjs'));
const { buildTradeReport, recipeCost, filterInventory, moscowDate } = require('./lib/trade-report.js');
const { tradeWorkbook } = require('./lib/server/trade-workbook.js');
after(() => rmSync(temp, { recursive: true, force: true }));
const p = (id, overrides = {}) => ({ id, name: `Свеча ${id}`, form: 'Кашпо', color: 'Белый', accent: '', scent: 'MINT', stock: 2, price: 100, published: true, visible: true, archived: false, legacyVariantId: null, volume: 100, ...overrides });
const recipe = (id, productIds, items = { 1: 100 }) => ({ id, name: `Калькуляция ${id}`, productIds, items, markup: 100, salePrice: 200, note: '', updatedAt: '2026-11-11T09:00:00Z' });
const order = (id, overrides = {}) => ({ id, number: `T-${id}`, createdAt: '2026-11-11T09:00:00Z', status: 'new', stockReserved: true, total: 80, customer: '=1+1', phone: '+79899998988', email: '', delivery: 'Самовывоз', address: '@text', comment: '=HYPERLINK("https://invalid.example")', channels: ['telegram'], items: [{ productId: 1, name: 'Кашпо', quantity: 1, price: 80 }], ...overrides });
const fixture = () => ({ products: [p(1), p(2, { stock: 3, price: 200, visible: false }), p(3, { stock: 0 }), p(4, { stock: 90, archived: true })], materials: [{ id: 1, name: 'Воск', unit: 'г', price: .65 }], recipes: [recipe(1, [1])], orders: [order(1), order(2, { status: 'completed', total: 160, items: [{ productId: 1, name: 'Кашпо', quantity: 2, price: 80 }] })], expenses: [{ id: 1, date: '2026-11-01', category: 'Материалы', description: 'Воск', amount: 1000, version: 1 }, { id: 2, date: '2026-10-31', category: 'Реклама', description: '', amount: 50, version: 1 }], history: [{ id: 1, recipeId: 1, savedAt: '2026-11-11T09:00:00Z', name: 'Старый расчёт', total: 50, salePrice: 100, note: '' }] });
const period = { from: '2026-11-01', to: '2026-11-30' };

test('stock, reservations and estimates stay separate; unknown costs are never counted as zero', () => {
  const source = fixture(), report = buildTradeReport(source, period), s = report.summary;
  assert.equal(s.availableUnits, 5); assert.equal(s.reservedUnits, 1); assert.equal(s.potentialRevenue, 800); assert.equal(s.visibleRevenue, 200);
  assert.equal(s.estimatedStockCost, 130); assert.equal(s.estimatedProfit, 70); assert.equal(s.uncostedUnits, 3); assert.equal(s.uncostedRevenue, 600);
  assert.equal(report.inventory.find(p => p.id === 2).profit, null); assert.equal(report.inventory.length, 3);
  assert.equal(s.completedValue, 160, 'Historical order total is not recalculated at today’s catalog price');
  assert.equal(s.expenseTotal, 1000); assert.equal(s.estimatedProfit, 70, 'Purchases are not subtracted from a cost that already includes materials');
  assert.equal(report.inventory[0].stock, 2, 'Already reserved stock must not be deducted a second time');
});
test('ambiguous, incomplete and missing-material calculations remain visibly unestimated', () => {
  const source = fixture(); source.recipes.push(recipe(2, [1]), recipe(3, [2], {}), recipe(4, [3], { 99: 1 }));
  const rows = buildTradeReport(source, period).inventory;
  assert.deepEqual(rows.map(r => r.costStatus), ['multiple', 'incomplete', 'incomplete']);
  assert.equal(recipeCost(recipe(7, [1], { 1: 0 }), source.materials), null);
  assert.equal(recipeCost(recipe(7, [1], { 1: .5 }), source.materials), .33);
});
test('Moscow date boundaries, quote items, legacy variants and unreserved orders are handled explicitly', () => {
  const source = fixture(); source.products[0].legacyVariantId = 77;
  source.orders = [order(1, { createdAt: '2026-10-31T21:00:00Z', items: [{ productId: 99, variantId: 77, quantity: 2, price: 80, name: 'Кашпо' }] }), order(2, { createdAt: '2026-10-31T20:59:59Z', stockReserved: false }), order(3, { total: 0, items: [{ productId: 0, quantity: 5, price: 0, name: 'Заказ по запросу', customRecipe: {}, quotePending: true }] })];
  const report = buildTradeReport(source, period);
  assert.equal(moscowDate('2026-10-31T21:00:00Z'), '2026-11-01'); assert.equal(report.summary.orderCount, 2);
  assert.equal(report.summary.reservedUnits, 2); assert.equal(report.inventory[0].reserved, 2); assert.equal(report.summary.quoteOrders, 1);
});
test('registry filters use the same predicate for UI and Excel exports', () => {
  const report = buildTradeReport(fixture(), period);
  assert.deepEqual(filterInventory(report.inventory, 'свеча 2', 'uncosted').map(p => p.id), [2]);
  assert.deepEqual(filterInventory(report.inventory, '', 'hidden').map(p => p.id), [2]);
  assert.deepEqual(filterInventory(report.inventory, '', 'empty').map(p => p.id), [3]);
});
test('XLSX opens, keeps amounts numeric, unknowns blank, headers frozen and buyer text non-executable', async () => {
  const buffer = await tradeWorkbook(fixture(), period, 'all');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  assert.deepEqual(book.worksheets.map(s => s.name), ['Сводка', 'Остатки', 'Калькуляции', 'Состав калькуляций', 'Материалы', 'История себестоимости', 'Заказы', 'Позиции заказов', 'Выполнено по формам', 'Расходы']);
  const stock = book.getWorksheet('Остатки'); assert.equal(stock.getCell('H2').value, 2); assert.equal(stock.getCell('K2').value, 65); assert.equal(stock.getCell('K3').value, null);
  assert.equal(stock.views[0].ySplit, 1); assert.ok(stock.autoFilter); assert.match(stock.getCell('K2').numFmt, /₽/);
  const orders = book.getWorksheet('Заказы'); assert.equal(orders.getCell('E2').value, '=1+1'); assert.equal(orders.getCell('F2').value, '+79899998988'); assert.equal(orders.getCell('J2').type, ExcelJS.ValueType.String); assert.equal(orders.getCell('L2').type, ExcelJS.ValueType.Number);
  assert.equal(book.getWorksheet('Расходы').rowCount, 2); assert.equal(book.getWorksheet('История себестоимости').getCell('E2').value, 50);
  const filtered = new ExcelJS.Workbook(); await filtered.xlsx.load(await tradeWorkbook(fixture(), period, 'inventory', { query: 'Свеча 2', stock: 'uncosted' }));
  assert.equal(filtered.getWorksheet('Остатки').rowCount, 2); assert.equal(filtered.getWorksheet('Остатки').getCell('A2').value, 2);
  assert.equal(filtered.getWorksheet('Заказы'), undefined);
});
