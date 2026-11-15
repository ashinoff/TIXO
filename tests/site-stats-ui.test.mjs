import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act, StrictMode } from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://test.local/?phone=private#order' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const rootDir = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'tixo-stats-ui-'));
writeFileSync(path.join(temp, 'package.json'), '{"type":"commonjs"}');
symlinkSync(path.join(rootDir, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
for (const file of ['lib/site-stats.ts', 'app/components/page-view-counter.tsx', 'app/admin/site-statistics.tsx']) {
  const target = path.join(temp, file.replace(/\.tsx?$/, '.js'));
  mkdirSync(path.dirname(target), { recursive: true });
  const source = readFileSync(path.join(rootDir, file), 'utf8').replace(/^import ".*\.css";$/gm, '');
  writeFileSync(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
}
const require = createRequire(path.join(temp, 'test.cjs'));
const { PageViewCounter } = require('./app/components/page-view-counter.js');
const { SiteStatistics } = require('./app/admin/site-statistics.js');
after(() => { dom.window.close(); rmSync(temp, { recursive: true, force: true }); });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const click = async text => { const button = [...document.querySelectorAll('button')].find(el => el.textContent === text); assert.ok(button); await act(async () => button.click()); };
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const fixture = (days = 30) => ({ days, from: '2026-11-01', to: '2026-11-02', summary: { today: 3, week: 3, month: 3, total: 3 }, daily: [{ date: '2026-11-01', views: 0 }, { date: '2026-11-02', views: 3 }], pages: [{ path: '/', views: 3 }] });

test('counter sends one page-only request in StrictMode, no credentials/referrer/storage or repeat on rerender', async () => {
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return new Response(null, { status: 204 }); };
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { configurable: true, get() { throw new Error('Counter must not use browser storage'); } });
  Object.defineProperty(document, 'cookie', { configurable: true, get() { throw new Error('Counter must not read cookies'); }, set() { throw new Error('Counter must not set cookies'); } });
  const root = createRoot(document.getElementById('root'));
  try {
    const render = path => root.render(React.createElement(StrictMode, null, React.createElement(PageViewCounter, { path })));
    await act(async () => render('/')); await settle();
    assert.equal(calls.length, 1);
    const [url, options] = calls[0];
    assert.equal(url, '/api/stats/pageview'); assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), { path: '/' }, 'Never send the query string, hash, referrer or visitor data');
    await act(async () => render('/')); await settle(); assert.equal(calls.length, 1);
    await act(async () => render('/privacy')); await settle(); assert.equal(calls.length, 2);
    assert.deepEqual(JSON.parse(calls[1][1].body), { path: '/privacy' });
    await act(async () => render('/admin')); await settle(); assert.equal(calls.length, 2);
  } finally { await act(async () => root.unmount()); }
});

test('failed counter is silent and never retries or blocks the page', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Network unavailable'); };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(PageViewCounter, { path: '/' }))); await settle(); await settle();
    assert.equal(calls, 1); assert.equal(document.getElementById('root').textContent, '');
  } finally { await act(async () => root.unmount()); }
});

test('admin statistics changes periods, refreshes and exposes accessible daily values including zero days', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return response(fixture(Number(new URL(url, 'http://test.local').searchParams.get('days')))); };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(SiteStatistics)));
    assert.equal(calls[0][0], '/api/admin/stats?days=30'); assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(document.querySelectorAll('.site-stats-metrics article').length, 4);
    assert.match(document.querySelector('details').textContent, /01\.11\.20260/);
    assert.match(document.querySelector('[role="img"]').getAttribute('aria-label'), /3/);
    await click('7 дней'); assert.equal(calls.at(-1)[0], '/api/admin/stats?days=7');
    await click('90 дней'); assert.equal(calls.at(-1)[0], '/api/admin/stats?days=90');
    await click('Обновить'); assert.equal(calls.length, 4);
    assert.equal(document.querySelector('[aria-pressed="true"]').textContent, '90 дней');
    assert.match(document.querySelector('.site-stats-note').textContent, /уникальные посетители не определяются/);
  } finally { await act(async () => root.unmount()); }
});

test('errors are not presented as zero traffic; stale responses cannot replace the selected period', async () => {
  let oldResponse;
  globalThis.fetch = url => url.endsWith('30') ? new Promise(resolve => { oldResponse = resolve; }) : Promise.resolve(response({ error: 'Session expired' }, 401));
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(SiteStatistics)));
    await click('7 дней');
    await act(async () => oldResponse(response(fixture())));
    assert.match(document.querySelector('[role="alert"]').textContent, /Сессия завершилась/);
    assert.equal(document.querySelector('.site-stats-metrics'), null);
    globalThis.fetch = async () => response({ ...fixture(7), summary: { today: 0, week: 0, month: 0, total: 0 }, daily: [], pages: [] });
    await click('Обновить');
    assert.match(document.querySelector('.site-stats-empty').textContent, /Пока просмотров нет/);
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally { await act(async () => root.unmount()); }
});
