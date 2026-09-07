import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import pg from 'pg';

// Compile the domain modules with the project's existing TypeScript dependency.
const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'tixo-domain-'));
writeFileSync(path.join(temp, 'package.json'), '{"type":"commonjs"}');
symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
for (const file of ['catalog', 'server/db', 'server/validation', 'server/products', 'server/orders', 'server/uploads']) {
  const target = path.join(temp, 'lib', `${file}.js`);
  mkdirSync(path.dirname(target), { recursive: true });
  const output = ts.transpileModule(readFileSync(path.join(root, 'lib', `${file}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  writeFileSync(target, output.outputText);
}
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
const require = createRequire(path.join(temp, 'test.cjs'));
const { parseOrder, parseScent } = require('./lib/server/validation');
const { cartKey, selectVariant, availableVariants } = require('./lib/catalog');
const domain = require('./lib/server/db');
const { saveProduct } = require('./lib/server/products');
const { createOrder, deleteOrder } = require('./lib/server/orders');
const customer = { customerName:'Тестовый покупатель', phone:'+79990000000', email:'test@example.com', address:'Тестовый адрес', delivery:'Пункт выдачи', comment:'' };
const orderBody = items => ({ ...customer, items, requestKey: randomUUID() });

test('invalid quantities and partial malformed carts are rejected, duplicates are aggregated', () => {
  for (const quantity of [0, -1, 1.5, 100, null, '', true, '1e1']) assert.throws(() => parseOrder(orderBody([{ productId:1, quantity }])));
  assert.throws(() => parseOrder(orderBody([{ productId:1, quantity:1 }, { productId:0, quantity:1 }])));
  assert.throws(() => parseOrder(orderBody([{ productId:1, quantity:60 }, { productId:1, quantity:60 }])));
  const order = parseOrder(orderBody([{ productId:1, variantId:3, quantity:1 }, { productId:1, variantId:3, quantity:2 }, { productId:1, variantId:4, quantity:2 }]));
  assert.deepEqual(order.items, [{ productId:1, variantId:3, quantity:3 }, { productId:1, variantId:4, quantity:2 }]);
  assert.notEqual(cartKey(1, 3), cartKey(1, 4));
});

test('one selected aroma drives a variant, and hidden variants stay unavailable without substituting another scent', () => {
  const scent = { id:1, active:true, name:'Аромат', color:'#aabbcc', colorName:'Голубой', description:'', notes:[] };
  const product = { variants: [
    { id:11, scentId:1, active:true, stock:0, image:'/one.webp', scent },
    { id:12, scentId:2, active:true, stock:4, image:'/two.webp', scent:{...scent,id:2} },
    { id:13, scentId:3, active:false, stock:5, image:'/three.webp', scent:{...scent,id:3} },
    { id:14, scentId:4, active:true, stock:5, image:null, scent:{...scent,id:4} },
  ] };
  assert.equal(selectVariant(product).id, 12);
  assert.equal(selectVariant(product, 1).id, 11);
  assert.deepEqual(availableVariants(product).map(v => v.id), [11,12,14]);
  assert.equal(selectVariant(product, 3), undefined);
  assert.equal(selectVariant(product, 99), undefined);
  assert.notEqual(cartKey(1, null, 1), cartKey(1, null, 2));
  const data = parseScent({ ...scent, color:'#AABBCC' });
  assert.equal(data.color, '#aabbcc');
  assert.throws(() => parseScent({ ...scent, color:'red' }));
});

const databaseUrl = process.env.TEST_DATABASE_URL;
// A local verification harness may inject a PostgreSQL-compatible test pool.
const injectedPool = globalThis.tixoVerificationPool;
test('PostgreSQL catalog, migration and order workflow', { skip: !databaseUrl && !injectedPool }, async t => {
  const schema = `tixo_test_${randomUUID().replaceAll('-', '')}`;
  let pool;
  if (injectedPool) pool = injectedPool;
  else {
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    pool = new pg.Pool({ connectionString:url.toString(), max:8 });
  }
  await pool.query(`CREATE SCHEMA ${schema}`);
  if (injectedPool) await pool.query(`SET search_path TO ${schema}`);
  process.env.DATABASE_URL = databaseUrl || 'postgresql://isolated-test';
  process.env.UPLOAD_DIR = path.join(temp, 'uploads');
  globalThis.tihoPool = pool;
  globalThis.tihoSchemaReady = undefined;
  t.after(async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); globalThis.tihoPool = undefined; globalThis.tihoSchemaReady = undefined; });
  await pool.query(`CREATE TABLE categories (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,slug TEXT NOT NULL UNIQUE,mood TEXT NOT NULL,description TEXT NOT NULL,notes TEXT[] NOT NULL DEFAULT '{}',paper TEXT DEFAULT '#f4efe5',ink TEXT DEFAULT '#211d1a',accent TEXT DEFAULT '#6c1637',soft TEXT DEFAULT '#e8ddcb',created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE products (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,notes TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),stock INTEGER NOT NULL CHECK(stock>=0),published BOOLEAN NOT NULL,image TEXT,category_id BIGINT REFERENCES categories(id),created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE orders (id BIGSERIAL PRIMARY KEY,order_number TEXT UNIQUE,customer_name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,address TEXT NOT NULL,delivery TEXT NOT NULL,comment TEXT DEFAULT '',items JSONB NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE site_content (key TEXT PRIMARY KEY,value TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'text',updated_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO categories(name,slug,mood,description) VALUES('Старый раздел','original','Авторский заголовок','Авторское описание');
    INSERT INTO products(name,category,category_id,notes,price,stock,published,image) VALUES('Форма из рабочего каталога','Старый раздел',1,'Исходные ноты',1500,12,TRUE,'/api/uploads/original.webp');
    INSERT INTO orders(order_number,customer_name,phone,email,address,delivery,items,total) VALUES('OLD-01','История','0000000','old@example.com','Адрес','Доставка','[{"productId":1,"name":"Старое название","price":1300,"quantity":2}]',2600);
    INSERT INTO site_content(key,value) VALUES('hero.title','Сохранённый заголовок');`);
  const before = (await pool.query('SELECT * FROM products')).rows;
  let red, blue, product, originalOrder;
  const imageFile = () => new File([readFileSync(path.join(root,'public/images/hero-candles.webp'))], 'candle.webp', { type:'image/webp' });
  const formFor = (p, variants) => {
    const form = new FormData();
    for (const key of ['name','notes','price','stock','published']) form.set(key, String(p[key]));
    form.set('expectedStock', String(p.stock));
    form.set('variants', JSON.stringify(variants.map(v => ({ ...v, expectedStock: v.expectedStock ?? v.stock }))));
    return form;
  };
  await t.test('additive migration preserves existing rows, photos, content, order items and stock', async () => {
    await Promise.all([domain.ensureSchema(), domain.ensureSchema()]);
    assert.deepEqual((await pool.query('SELECT * FROM products')).rows.map(({shape,...row}) => row), before);
    assert.equal((await pool.query("SELECT value FROM site_content WHERE key='hero.title'")).rows[0].value, 'Сохранённый заголовок');
    originalOrder = domain.mapOrder((await pool.query("SELECT * FROM orders WHERE order_number='OLD-01'")).rows[0]);
    assert.equal(originalOrder.stockReserved, false);
    assert.equal(originalOrder.items[0].name, 'Старое название');
    assert.deepEqual((await pool.query('SELECT color_name FROM scents ORDER BY id')).rows.map(row => row.color_name), ['Красный','Чёрный','Белый','Розовый']);
    await pool.query("UPDATE scents SET name='Мой красный аромат', active=FALSE WHERE color_name='Красный'");
    globalThis.tihoSchemaReady = undefined; await domain.ensureSchema();
    assert.equal((await pool.query('SELECT * FROM scents')).rows.length, 4);
    assert.equal((await pool.query("SELECT active FROM scents WHERE name='Мой красный аромат'")).rows[0].active, false);
    await pool.query("UPDATE scents SET active=TRUE WHERE color_name='Красный'");
    assert.deepEqual((await pool.query('SELECT * FROM products')).rows.map(({shape,...row}) => row), before);
  });
  await t.test('all four scents work with existing forms without photos or setup; stock stays shared', async () => {
    const defaults = (await pool.query('SELECT id FROM scents ORDER BY id')).rows.map(row => Number(row.id));
    const order = await createOrder(orderBody(defaults.map(scentId => ({ productId:1, scentId, quantity:1 }))));
    assert.equal(order.items.length, 4);
    assert.deepEqual(order.items.map(item => item.colorName), ['Красный','Чёрный','Белый','Розовый']);
    await assert.rejects(createOrder(orderBody([{productId:1, scentId:99999, quantity:1}])), /аромат/);
    assert.equal(order.items[0].variantId, null);
    assert.equal((await domain.listProducts())[0].stock, 8);
    await deleteOrder(order.id);
    await deleteOrder(originalOrder.id);
    assert.equal((await domain.listProducts())[0].stock, 12);
  });
  await t.test('different scents cannot oversell the shared last unit, including concurrent requests', async () => {
    const ids = (await pool.query('SELECT id FROM scents ORDER BY id')).rows.map(row => Number(row.id));
    await pool.query('UPDATE products SET stock=1 WHERE id=1');
    await assert.rejects(createOrder(orderBody([{productId:1,scentId:ids[0],quantity:1},{productId:1,scentId:ids[1],quantity:1}])), error => error.status === 409);
    assert.equal((await domain.listProducts())[0].stock,1);
    const results = await Promise.allSettled(ids.slice(0,2).map(scentId => createOrder(orderBody([{productId:1,scentId,quantity:1}]))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length,1);
    assert.equal(results.filter(result => result.status === 'rejected').length,1);
    const placed = results.find(result => result.status === 'fulfilled').value;
    await deleteOrder(placed.id);
    assert.equal((await domain.listProducts())[0].stock,1);
    await pool.query('UPDATE scents SET active=FALSE WHERE id=$1',[ids[0]]);
    await assert.rejects(createOrder(orderBody([{productId:1,scentId:ids[0],quantity:1}])), /аромат/);
    await pool.query('UPDATE scents SET active=TRUE WHERE id=$1',[ids[0]]);
    await pool.query('UPDATE products SET stock=12 WHERE id=1');
  });
  await t.test('global color is unique, preview shapes are validated and variant photos are optional', async () => {
    const insert = async (name, color) => Number((await pool.query("INSERT INTO scents(name,color,color_name,description,notes) VALUES($1,$2,$1,'Композиция',ARRAY['нота']) RETURNING id", [name,color])).rows[0].id);
    red = await insert('Вишня', '#c73548'); blue = await insert('Море', '#517e9a');
    await assert.rejects(insert('Другой аромат','#c73548'), error => error.code === '23505');
    const old = (await domain.listProducts(true))[0];
    const invalid = formFor(old, []); invalid.set('shape','invalid');
    await assert.rejects(saveProduct(invalid, 1), /форму/);
    assert.equal((await domain.listProducts(true))[0].hasVariants, false);
    const form = formFor(old,[{ scentId:red,stock:3,active:true },{ scentId:blue,stock:4,active:true }]);
    form.set(`variantImage:${red}`, imageFile()); form.set(`variantImage:${blue}`, imageFile());
    product = await saveProduct(form,1);
    assert.equal(product.stock,7); assert.equal(product.variants.length,2);
    assert.equal(product.image, before[0].image);
    assert.notEqual(product.variants[0].image, product.variants[1].image);
    const second = formFor({name:'Другая форма',notes:'Детали',price:2000,stock:0,published:true},[{scentId:red,stock:2,active:true}]);
    second.set('shape','shell');
    const shape = await saveProduct(second);
    assert.equal(shape.variants[0].scent.color,product.variants[0].scent.color);
    assert.equal(shape.shape, "shell");
    assert.equal(shape.variants[0].image, null);
    const previewOrder = await createOrder(orderBody([{productId:shape.id,variantId:shape.variants[0].id,quantity:1}]));
    await deleteOrder(previewOrder.id);
  });
  await t.test('mixed invalid order rolls back; chosen variants remain separate and price is server-owned', async () => {
    const [a,b] = product.variants;
    await assert.rejects(createOrder(orderBody([{productId:1,variantId:a.id,quantity:1},{productId:1,variantId:999999,quantity:1}])), /аромат/);
    assert.equal((await domain.listProducts(true,1))[0].stock,7);
    await assert.rejects(createOrder(orderBody([{productId:1,quantity:1}])), /аромат/);
    const order = await createOrder(orderBody([{productId:1,variantId:a.id,quantity:1,price:1},{productId:1,variantId:b.id,quantity:2}]));
    assert.equal(order.items.length,2); assert.equal(order.total,4500);
    assert.equal(order.items[0].scentName,'Вишня'); assert.equal(order.items[0].color,'#c73548');
    await pool.query("UPDATE scents SET name='Вишня новая',color='#bb3040' WHERE id=$1",[red]);
    const snapshot = domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]);
    assert.equal(snapshot.items[0].scentName,'Вишня'); assert.equal(snapshot.items[0].color,'#c73548');
    assert.equal((await domain.listProducts(true,1))[0].variants[0].scent.color,'#bb3040');
    await deleteOrder(order.id);
    assert.equal((await domain.listProducts(true,1))[0].stock,7);
  });
  await t.test('hidden aroma cannot be ordered and does not fall back to unscented stock', async () => {
    await pool.query('UPDATE scents SET active=FALSE WHERE id=$1',[red]);
    assert.equal((await domain.listProducts(false,1))[0].variants.length,1);
    await assert.rejects(createOrder(orderBody([{productId:1,variantId:product.variants[0].id,quantity:1}])), /недоступен/);
    await pool.query('UPDATE scents SET active=TRUE WHERE id=$1',[red]);
    const current=(await domain.listProducts(true,1))[0];
    const off=await saveProduct(formFor(current,current.variants.map(v=>({...v,active:false}))),1);
    assert.equal(off.stock,7);
    const publicProduct=(await domain.listProducts(false,1))[0];
    assert.equal(publicProduct.hasVariants,true);assert.equal(publicProduct.variants.length,0);assert.equal(publicProduct.stock,0);
    await assert.rejects(createOrder(orderBody([{productId:1,quantity:1}])), /аромат/);
    product=await saveProduct(formFor(off,off.variants.map(v=>({...v,active:true}))),1);
  });
  await t.test('concurrent last-unit orders cannot oversell and an idempotent retry reserves once', async () => {
    const current=(await domain.listProducts(true,1))[0];
    product=await saveProduct(formFor(current,current.variants.map(v=>({...v,expectedStock:v.stock,stock:1}))),1);
    const a=product.variants[0],b=product.variants[1];
    const results=await Promise.allSettled([createOrder(orderBody([{productId:1,variantId:a.id,quantity:1}])),createOrder(orderBody([{productId:1,variantId:a.id,quantity:1}]))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    const duplicate=orderBody([{productId:1,variantId:b.id,quantity:1}]);
    const [first,retry]=await Promise.all([createOrder(duplicate),createOrder(duplicate)]);
    assert.equal(first.id,retry.id);
    assert.equal((await domain.listProducts(true,1))[0].stock,0);
    await assert.rejects(saveProduct(formFor(product,product.variants),1), /Остаток варианта изменился/);
    await deleteOrder(first.id);
    await deleteOrder(results.find(r=>r.status==='fulfilled').value.id);
    assert.equal((await domain.listProducts(true,1))[0].stock,2);
  });
  await t.test('completed order deletion preserves consumed stock', async () => {
    const variant=(await domain.listProducts(true,1))[0].variants[0];
    const order=await createOrder(orderBody([{productId:1,variantId:variant.id,quantity:1}]));
    await pool.query("UPDATE orders SET status='completed' WHERE id=$1",[order.id]);
    await deleteOrder(order.id);
    assert.equal((await domain.listProducts(true,1))[0].stock,1);
  });
});
