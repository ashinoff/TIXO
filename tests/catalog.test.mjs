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
for (const file of ['atelier', 'catalog', 'server/db', 'server/validation', 'server/products', 'server/orders', 'server/uploads']) {
  const target = path.join(temp, 'lib', `${file}.js`);
  mkdirSync(path.dirname(target), { recursive: true });
  const output = ts.transpileModule(readFileSync(path.join(root, 'lib', `${file}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  writeFileSync(target, output.outputText);
}
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
const require = createRequire(path.join(temp, 'test.cjs'));
const { parseOrder, parseScent, parseColor } = require('./lib/server/validation');
const { cartKey, selectVariant, availableVariants } = require('./lib/catalog');
const { isRecipe, recipeKey } = require('./lib/atelier');
const domain = require('./lib/server/db');
const { saveProduct } = require('./lib/server/products');
const { createOrder, deleteOrder } = require('./lib/server/orders');
const customer = { customerName:'Тестовый покупатель', phone:'+79990000000', email:'test@example.com', address:'Тестовый адрес', delivery:'Пункт выдачи', comment:'' };
let defaultColorId;
const orderBody = items => ({ ...customer, items: items.map(item => item.productId && !item.variantId && defaultColorId ? {colorId:defaultColorId,...item} : item), requestKey: randomUUID() });
const recipe = { shape:'sphere', color:'red', top:'lemon', heart:'fig', base:'oud' };

test('custom candle choices are validated, copied and aggregated separately from catalog lines', () => {
  assert.equal(isRecipe(recipe), true);
  for (const key of Object.keys(recipe)) {
    for (const value of ['', 'unknown', '__proto__', 'toString', null, 1, ['sphere']]) {
      assert.throws(() => parseOrder(orderBody([{ customRecipe:{...recipe,[key]:value}, quantity:1 }])));
    }
    const missing = {...recipe}; delete missing[key];
    assert.throws(() => parseOrder(orderBody([{customRecipe:missing,quantity:1}])));
  }
  for (const invalid of [null, [], '', 0, false]) assert.throws(() => parseOrder(orderBody([{customRecipe:invalid,quantity:1}])));
  for (const quantity of [0,-1,1.5,100,null,'',true,'1e1']) assert.throws(() => parseOrder(orderBody([{customRecipe:recipe,quantity}])));
  assert.throws(() => parseOrder(orderBody([{customRecipe:recipe,quantity:70},{customRecipe:recipe,quantity:30}])));
  assert.throws(() => parseOrder(orderBody([{customRecipe:recipe,productId:1,quantity:1}])));
  assert.throws(() => parseOrder(orderBody([{customRecipe:recipe,variantId:1,quantity:1}])));
  assert.throws(() => parseOrder(orderBody([{customRecipe:recipe,scentId:1,quantity:1}])));
  const input = {...recipe,price:1,label:'untrusted'};
  const other = {...recipe,color:'ivory'};
  const parsed = parseOrder(orderBody([
    {customRecipe:input,quantity:1,price:1,quotePending:false},
    {customRecipe:recipe,quantity:2},
    {customRecipe:other,quantity:1},
    {productId:1,scentId:2,quantity:1},
  ]));
  assert.deepEqual(parsed.items, [
    {customRecipe:recipe,quantity:3}, {customRecipe:other,quantity:1},
    {productId:1,variantId:null,scentId:2,quantity:1},
  ]);
  input.color = 'black';
  assert.equal(parsed.items[0].customRecipe.color,'red');
  assert.notEqual(recipeKey(recipe),recipeKey(other));
});

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
    { id:11, scentId:1, colorId:1, color:{id:1,hex:"#aabbcc",name:"Цвет",active:true}, active:true, stock:0, image:'/one.webp', scent },
    { id:12, scentId:2, colorId:1, color:{id:1,hex:"#aabbcc",name:"Цвет",active:true}, active:true, stock:4, image:'/two.webp', scent:{...scent,id:2} },
    { id:13, scentId:3, colorId:1, color:{id:1,hex:"#aabbcc",name:"Цвет",active:true}, active:false, stock:5, image:'/three.webp', scent:{...scent,id:3} },
    { id:14, scentId:4, colorId:1, color:{id:1,hex:"#aabbcc",name:"Цвет",active:true}, active:true, stock:5, image:null, scent:{...scent,id:4} },
  ] };
  assert.equal(selectVariant(product).id, 12);
  assert.equal(selectVariant(product, 1).id, 11);
  assert.deepEqual(availableVariants(product).map(v => v.id), [11,12,14]);
  assert.equal(selectVariant(product, 3), undefined);
  assert.equal(selectVariant(product, 99), undefined);
  assert.notEqual(cartKey(1, null, 1), cartKey(1, null, 2));
  const data = parseScent({ ...scent, color:'#AABBCC' });
  assert.equal('color' in data, false);
  assert.equal(parseColor({name:'Лёд',hex:'#AABBCC',active:true}).hex,'#aabbcc');
  assert.throws(() => parseColor({name:'Лёд',hex:'red',active:true}));
  assert.notEqual(cartKey(1,null,1,1),cartKey(1,null,1,2));
  const parsed=parseOrder(orderBody([{productId:1,scentId:1,colorId:1,quantity:1},{productId:1,scentId:1,colorId:2,quantity:1}]));
  assert.equal(parsed.items.length,2);
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
  // Existing deployed scent-bound variants must survive the one-time separation.
  await pool.query(`CREATE TABLE scents(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',notes TEXT[] NOT NULL DEFAULT '{}',color TEXT NOT NULL,color_name TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE UNIQUE INDEX scents_color_unique ON scents(LOWER(color));
    INSERT INTO scents(name,color,color_name) VALUES('Вишня и миндаль','#b82035','Красный'),('Сандал и дым','#222225','Чёрный'),('Белая ваниль','#f7f5ef','Белый'),('Роза и пион','#e7a0b5','Розовый');
    INSERT INTO products(name,category,notes,price,stock,published,image) VALUES('Готовая свеча','','Описание',1700,5,TRUE,'/api/uploads/ready.webp');
    CREATE TABLE product_variants(id BIGSERIAL PRIMARY KEY,product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,scent_id BIGINT NOT NULL REFERENCES scents(id) ON DELETE RESTRICT,stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),image TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE(product_id,scent_id),created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO product_variants(product_id,scent_id,stock,image) VALUES(2,1,5,'/api/uploads/ready-red.webp');
    ALTER TABLE orders ADD COLUMN stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
    INSERT INTO orders(order_number,customer_name,phone,email,address,delivery,items,total,stock_reserved) VALUES('OLD-VARIANT','История','0000000','old@example.com','Адрес','Доставка','[{"productId":2,"variantId":1,"scentId":1,"name":"Готовая свеча","scentName":"Прежний аромат","color":"#b82035","colorName":"Красный","price":1700,"quantity":2}]',3400,TRUE);`);
  const legacyVariants=(await pool.query('SELECT * FROM product_variants')).rows;
  const before = (await pool.query('SELECT * FROM products')).rows;
  let red, blue, redColor, blueColor, product, originalOrder;
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
    assert.deepEqual((await pool.query('SELECT * FROM product_variants')).rows.map(({color_id,...row})=>row),legacyVariants);
    const migrated=(await domain.listProducts(true,2))[0].variants[0];
    assert.equal(migrated.id,1);assert.equal(migrated.stock,5);assert.equal(migrated.color.hex,'#b82035');
    assert.equal(migrated.image,'/api/uploads/ready-red.webp');
    assert.equal('color' in migrated.scent,false);

    const palette=(await pool.query('SELECT * FROM colors')).rows;
    assert.deepEqual(palette.map(row=>row.name).sort(),['Красный','Чёрный','Белый','Розовый'].sort());
    defaultColorId=Number(palette.find(row=>row.name==='Красный').id);
    await pool.query("UPDATE scents SET name='Мой красный аромат', active=FALSE WHERE color_name='Красный'");
    globalThis.tihoSchemaReady = undefined; await domain.ensureSchema();
    assert.equal((await pool.query('SELECT * FROM scents')).rows.length, 4);
    assert.equal((await pool.query("SELECT active FROM scents WHERE name='Мой красный аромат'")).rows[0].active, false);
    await pool.query("UPDATE scents SET active=TRUE WHERE color_name='Красный'");
    assert.deepEqual((await pool.query('SELECT * FROM products')).rows.map(({shape,...row}) => row), before);
  });
  await t.test('deleting a pre-migration reserved order restores its original variant and preserves the snapshot',async()=>{
    const old=domain.mapOrder((await pool.query("SELECT * FROM orders WHERE order_number='OLD-VARIANT'")).rows[0]);
    assert.equal(old.items[0].scentName,'Прежний аромат');assert.equal(old.items[0].color,'#b82035');
    await deleteOrder(old.id);
    assert.equal((await domain.listProducts(true,2))[0].variants[0].stock,7);
  });
  await t.test('all four scents work with existing forms without photos or setup; stock stays shared', async () => {
    const defaults = (await pool.query('SELECT id FROM scents ORDER BY id')).rows.map(row => Number(row.id));
    const order = await createOrder(orderBody(defaults.map(scentId => ({ productId:1, scentId, quantity:1 }))));
    assert.equal(order.items.length, 4);
    assert.deepEqual(order.items.map(item => item.colorName), ['Красный','Красный','Красный','Красный']);
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
  await t.test('same aroma in different colors keeps distinct order lines and one shared stock pool',async()=>{
    const scentId=Number((await pool.query('SELECT id FROM scents ORDER BY id LIMIT 1')).rows[0].id);
    const colors=(await pool.query('SELECT id FROM colors ORDER BY id')).rows.map(row=>Number(row.id));
    const placed=await createOrder(orderBody(colors.slice(0,2).map(colorId=>({productId:1,scentId,colorId,quantity:1}))));
    assert.equal(placed.items.length,2);assert.equal(placed.items[0].scentId,placed.items[1].scentId);
    assert.notEqual(placed.items[0].colorId,placed.items[1].colorId);
    assert.equal((await domain.listProducts(true,1))[0].stock,10);
    await deleteOrder(placed.id);
    await pool.query('UPDATE colors SET active=FALSE WHERE id=$1',[colors[0]]);
    await assert.rejects(createOrder(orderBody([{productId:1,scentId,colorId:colors[0],quantity:1}])),/цвет/);
    await pool.query('UPDATE colors SET active=TRUE WHERE id=$1',[colors[0]]);
    await assert.rejects(createOrder({...customer,items:[{productId:1,scentId,quantity:1}]}),/цвет/);
    assert.equal((await domain.listProducts(true,1))[0].stock,12);
  });
  await t.test('custom-only orders store a canonical quote request without reserving stock; retries are idempotent', async () => {
    const beforeProducts = (await pool.query('SELECT * FROM products ORDER BY id')).rows;
    const beforeVariants = (await pool.query('SELECT * FROM product_variants ORDER BY id')).rows;
    const inputRecipe = {...recipe};
    const request = orderBody([{customRecipe:inputRecipe,quantity:2,price:999,quotePending:false,name:'Untrusted name'}]);
    const [order,retry] = await Promise.all([createOrder(request),createOrder(request)]);
    assert.equal(order.id,retry.id);
    assert.equal(order.total,0);
    assert.equal(order.stockReserved,false);
    assert.equal(order.items[0].quotePending,true);
    assert.equal(order.items[0].price,0);
    assert.equal(order.items[0].productId,0);
    assert.equal(order.items[0].name,'Авторская свеча · Сфера');
    assert.equal(order.items[0].scentName,'Лимон / Инжир / Уд');
    assert.equal(order.items[0].colorName,'Винный');
    inputRecipe.color = 'black';
    const stored = domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]);
    assert.deepEqual(stored.items[0].customRecipe,recipe);
    assert.deepEqual((await pool.query('SELECT * FROM products ORDER BY id')).rows,beforeProducts);
    assert.deepEqual((await pool.query('SELECT * FROM product_variants ORDER BY id')).rows,beforeVariants);
    await deleteOrder(order.id);
    assert.equal((await pool.query('SELECT id FROM orders WHERE id=$1',[order.id])).rowCount,0);
    assert.deepEqual((await pool.query('SELECT * FROM products ORDER BY id')).rows,beforeProducts);
  });
  await t.test('mixed catalog and custom orders price and restore only catalog stock', async () => {
    const scentId = Number((await pool.query('SELECT id FROM scents WHERE active=TRUE ORDER BY id LIMIT 1')).rows[0].id);
    const beforeStock = (await domain.listProducts(true,1))[0].stock;
    const order = await createOrder(orderBody([
      {customRecipe:recipe,quantity:3,price:1},
      {productId:1,scentId,quantity:2,price:1},
      {customRecipe:{...recipe,color:'ivory'},quantity:1},
    ]));
    assert.equal(order.items.length,3);
    assert.equal(order.total,3000);
    assert.equal(order.stockReserved,true);
    assert.equal(order.items.filter(item=>item.quotePending).length,2);
    assert.equal((await domain.listProducts(true,1))[0].stock,beforeStock-2);
    await deleteOrder(order.id);
    assert.equal((await domain.listProducts(true,1))[0].stock,beforeStock);
    const countBefore = (await pool.query('SELECT id FROM orders')).rowCount;
    await assert.rejects(createOrder(orderBody([
      {customRecipe:recipe,quantity:1}, {productId:1,scentId,quantity:1}, {productId:99999,scentId,quantity:1},
    ])), error=>error.status===409);
    assert.equal((await domain.listProducts(true,1))[0].stock,beforeStock);
    assert.equal((await pool.query('SELECT id FROM orders')).rowCount,countBefore);
  });
  await t.test('colors are independent, pair stocks and photographs are separate and shapes are validated', async () => {
    const insert = async (name, color) => Number((await pool.query("INSERT INTO scents(name,color,color_name,description,notes) VALUES($1,$2,$1,'Композиция',ARRAY['нота']) RETURNING id", [name,color])).rows[0].id);
    red = await insert('Вишня', '#c73548'); blue = await insert('Море', '#517e9a');
    await insert('Другой аромат','#c73548'); // Legacy columns no longer constrain aromas.
    redColor=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Вишнёвый','#c73548') RETURNING id")).rows[0].id);
    blueColor=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Морской','#517e9a') RETURNING id")).rows[0].id);
    await assert.rejects(pool.query("INSERT INTO colors(name,hex) VALUES('Дубликат','#c73548')"),error=>error.code==='23505');
    const old = (await domain.listProducts(true))[0];
    const invalid = formFor(old, []); invalid.set('shape','invalid');
    await assert.rejects(saveProduct(invalid, 1), /форму/);
    assert.equal((await domain.listProducts(true))[0].hasVariants, false);
    const form = formFor(old,[{ scentId:red,colorId:redColor,stock:3,active:true },{ scentId:blue,colorId:blueColor,stock:4,active:true }]);
    form.set(`variantImage:${red}:${redColor}`, imageFile()); form.set(`variantImage:${blue}:${blueColor}`, imageFile());
    product = await saveProduct(form,1);
    assert.equal(product.stock,7); assert.equal(product.variants.length,2);
    assert.equal(product.image, before[0].image);
    assert.notEqual(product.variants[0].image, product.variants[1].image);
    const second = formFor({name:'Другая форма',notes:'Детали',price:2000,stock:0,published:true},[{scentId:red,colorId:redColor,stock:2,active:true},{scentId:red,colorId:blueColor,stock:3,active:true}]);
    second.set('shape','shell');
    const shape = await saveProduct(second);
    assert.equal(shape.variants.length,2);
    assert.equal(shape.variants[0].scentId,shape.variants[1].scentId);
    assert.notEqual(shape.variants[0].colorId,shape.variants[1].colorId);
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
    await pool.query("UPDATE scents SET name='Вишня новая' WHERE id=$1",[red]);
    await pool.query("UPDATE colors SET hex='#bb3040' WHERE id=$1",[redColor]);
    const snapshot = domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]);
    assert.equal(snapshot.items[0].scentName,'Вишня'); assert.equal(snapshot.items[0].color,'#c73548');
    assert.equal((await domain.listProducts(true,1))[0].variants[0].color.hex,'#bb3040');
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
