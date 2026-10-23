import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://test.local' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const { createRoot } = await import('react-dom/client');
const rootDir = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'tixo-costing-ui-'));
writeFileSync(path.join(temp, 'package.json'), '{"type":"commonjs"}');
symlinkSync(path.join(rootDir, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
const target = path.join(temp, 'cost-calculator.js');
const source = readFileSync(path.join(rootDir, 'app/admin/cost-calculator.tsx'), 'utf8').replace(/^import ".*\.css";$/gm, '');
writeFileSync(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
const { CostCalculator, normalizeCosting } = createRequire(path.join(temp, 'test.cjs'))('./cost-calculator.js');
after(() => { dom.window.close(); rmSync(temp, { recursive: true, force: true }); });
const response = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }));
const click = async node => { assert.ok(node); await act(async () => node.click()); };
const input = async (node, value) => { assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }); };
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.includes(text));
const fixture = () => ({
  materials: [{ id: '3', name: 'Воск', unit: 'г', price: '0.65' }],
  recipes: [{ id: '7', name: 'Тыква общая', product_id: '11', product_ids: ['11'], version: 1, markup_pct: '100', sale_price: '1600', items: { '3': 100 }, note: '' }],
  products: [
    { id: '11', name: 'Тыква', price: '1300', color_name: 'Красный', scent_name: 'CHERRY', published: true },
    { id: '12', name: 'Тыква', price: '1800', color_name: 'Зелёный', scent_name: 'MINT', published: false },
    { id: '13', name: 'Змея', price: '2100', color_name: 'Чёрный', scent_name: 'COAL', published: true },
  ], history: []
});
const checkbox = n => document.querySelector(`[aria-label^="Привязать товар №${n}:"]`);

test('costing normalizes string BIGINTs, including legacy scalar links, instead of trusting TS annotations', () => {
  const raw = fixture(); delete raw.recipes[0].product_ids;
  const result = normalizeCosting(raw);
  assert.equal(result.products[0].id, 11); assert.equal(result.materials[0].id, 3);
  assert.equal(result.recipes[0].id, 7); assert.deepEqual(result.recipes[0].product_ids, [11]);
  assert.equal(result.products[0].price, 1300);
  assert.equal(raw.products[0].id, '11', 'Never mutate the server snapshot');
});

test('several products save, stay selected and reopen after reload; product prices remain independent', async () => {
  let data = fixture(), sent;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, '/api/admin/costing');
    if (init.method === 'POST') {
      sent = JSON.parse(init.body);
      const saved = { ...sent, id: sent.id || 22, version: 2 };
      data = { ...data, recipes: [saved], history: [] };
      return response({ ok: true, id: saved.id, recipe: saved });
    }
    return response(data);
  };
  let root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(CostCalculator)));
    await click(button('Тыква общая'));
    assert.equal(checkbox(11).checked, true); assert.equal(checkbox(12).checked, false);
    await click(checkbox(12));
    assert.equal(checkbox(11).checked, true); assert.equal(checkbox(12).checked, true);
    assert.equal(document.querySelector('[aria-label="Расчётная цена продажи, ₽"]').value, '1600', 'Selecting products cannot overwrite the scenario price');
    assert.match(checkbox(11).closest('label').textContent.replace(/\s/g, ''), /1235₽/);
    assert.match(checkbox(12).closest('label').textContent.replace(/\s/g, ''), /1735₽/);
    await click(button('Сохранить расчёт и снимок'));
    assert.deepEqual(sent.product_ids, [11, 12]); assert.equal(sent.expected_version, 1);
    assert.equal(document.querySelector('[aria-label="Название модели"]').value, 'Тыква общая');
    assert.equal(checkbox(12).checked, true); assert.match(document.querySelector('.costing-notice').textContent, /Привязано товаров: 2/);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CostCalculator)));
    await click(button('Тыква общая'));
    assert.equal(checkbox(11).checked, true); assert.equal(checkbox(12).checked, true);
    await click(checkbox(11)); await click(button('Сохранить расчёт и снимок'));
    assert.deepEqual(sent.product_ids, [12]);
    assert.equal(data.products.length, 3); assert.equal(data.products[0].price, '1300');
  } finally { await act(async () => root.unmount()); }
});

test('search and bulk selection only affect matching products and never discard hidden selections', async () => {
  globalThis.fetch = async () => response(fixture());
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(CostCalculator)));
    await click(button('Тыква общая'));
    const search = document.querySelector('[aria-label="Поиск товаров для калькуляции"]');
    await input(search, 'MINT'); assert.equal(document.querySelectorAll('.costing-product-option').length, 1);
    await click(button('Выбрать найденные'));
    await input(search, ''); assert.equal(checkbox(11).checked, true); assert.equal(checkbox(12).checked, true); assert.equal(checkbox(13).checked, false);
    await input(search, '13'); assert.equal(document.querySelectorAll('.costing-product-option').length, 1);
    await click(button('Выбрать найденные')); await input(search, '');
    assert.equal(document.querySelectorAll('.costing-product-option input:checked').length, 3);
    await click(button('Снять все')); assert.equal(document.querySelectorAll('.costing-product-option input:checked').length, 0);
  } finally { await act(async () => root.unmount()); }
});

test('failed save/delete keep the current recipe and selected products; retry succeeds without duplicate clicks', async () => {
  let fail = true, posted = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method !== 'POST') return response(fixture());
    posted++;
    if (fail) return response({ error: 'Калькуляция уже изменена в другой вкладке' }, 409);
    const body = JSON.parse(init.body);
    return response({ ok: true, recipe: { ...body, id: 7, version: 2 } });
  };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(CostCalculator)));
    await click(button('Тыква общая')); await click(checkbox(12));
    await click(button('Сохранить расчёт и снимок'));
    assert.equal(checkbox(12).checked, true); assert.match(document.querySelector('[role="alert"]').textContent, /другой вкладке/);
    await click(button('Удалить расчёт'));
    assert.equal(document.querySelector('[aria-label="Название модели"]').value, 'Тыква общая'); assert.equal(checkbox(12).checked, true);
    fail = false; const before = posted;
    await act(async () => { const save = button('Сохранить расчёт и снимок'); save.click(); save.click(); });
    assert.equal(posted - before, 1); assert.equal(checkbox(12).checked, true);
  } finally { await act(async () => root.unmount()); }
});

test('new calculation keeps its persisted identity, zero sale price has no infinite margin, and clearing price is nullable', async () => {
  const data = fixture(); data.recipes = [];
  let saved, posted;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') { posted = JSON.parse(init.body); saved = { ...posted, id: 25, version: 1 }; return response({ ok: true, recipe: saved }); }
    return response({ ...data, recipes: saved ? [saved] : [] });
  };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(CostCalculator)));
    await input(document.querySelector('[aria-label="Название модели"]'), 'Новая модель');
    await click(checkbox(11)); await click(checkbox(12));
    const price = document.querySelector('[aria-label="Расчётная цена продажи, ₽"]');
    await input(price, '0'); assert.doesNotMatch(document.querySelector('.costing-metrics').textContent, /Infinity|NaN/);
    await input(price, ''); await click(button('Сохранить расчёт и снимок'));
    assert.equal(posted.sale_price, null); assert.deepEqual(posted.product_ids, [11, 12]);
    assert.match(document.querySelector('.costing-save-state').textContent, /№25/);
    assert.equal(document.querySelectorAll('.costing-product-option input:checked').length, 2);
    await click(button('Сохранить расчёт и снимок')); assert.equal(posted.id, 25, 'Second save updates instead of creating another recipe');
  } finally { await act(async () => root.unmount()); }
});
