import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import pg from 'pg';

// Compile the domain modules with the project's existing TypeScript dependency.
const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'tixo-domain-'));
writeFileSync(path.join(temp, 'package.json'), '{"type":"commonjs"}');
symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
for (const file of ['aroma-portraits', 'atelier', 'catalog', 'server/db', 'server/validation', 'server/products', 'server/forms', 'server/scents', 'server/orders', 'server/uploads']) {
  const target = path.join(temp, 'lib', `${file}.js`);
  mkdirSync(path.dirname(target), { recursive: true });
  const output = ts.transpileModule(readFileSync(path.join(root, 'lib', `${file}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  writeFileSync(target, output.outputText);
}
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
const require = createRequire(path.join(temp, 'test.cjs'));
const { parseOrder, parseScent, parseColor, parseForm, parseAromaProfile } = require('./lib/server/validation');
const { cartKey, selectVariant, availableVariants } = require('./lib/catalog');
const { isRecipe, recipeKey } = require('./lib/atelier');
const domain = require('./lib/server/db');
const { saveProduct, updateStock } = require('./lib/server/products');
const { saveForm } = require('./lib/server/forms');
const { saveScent } = require('./lib/server/scents');
const { aromaPortraits } = require('./lib/aroma-portraits');
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

test('custom recipes accept a form ID, isolate combinations and strip client form labels',()=>{
  const dynamic={formId:12,color:'red',top:'lemon',heart:'fig',base:'oud'};
  assert.equal(isRecipe(dynamic),true);
  for(const formId of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'12',null,undefined,true])assert.equal(isRecipe({...dynamic,formId}),false);
  assert.equal(isRecipe({...dynamic,shape:'ribbed'}),false);
  const parsed=parseOrder(orderBody([{customRecipe:{...dynamic,formName:'Fake',silhouette:'/fake.png',price:1},quantity:1},{customRecipe:dynamic,quantity:2},{customRecipe:{...dynamic,formId:13},quantity:1}]));
  assert.deepEqual(parsed.items.map(line=>line.quantity),[3,1]);assert.deepEqual(parsed.items[0].customRecipe,dynamic);
  assert.notEqual(recipeKey(dynamic),recipeKey({...dynamic,formId:13}));assert.notEqual(recipeKey(dynamic),recipeKey(recipe));
});

test('catalog aroma recipes reject mixed note payloads and keep aroma IDs distinct',()=>{
  const value={formId:12,color:'red',scentId:7};assert.equal(isRecipe(value),true);
  for(const scentId of [0,-1,1.5,'7',null,undefined,Number.MAX_SAFE_INTEGER+1])assert.equal(isRecipe({...value,scentId}),false);
  for(const extra of [{top:'lemon'},{heart:'fig'},{base:'oud'},{shape:'sphere'}])assert.equal(isRecipe({...value,...extra}),false);
  const parsed=parseOrder(orderBody([{customRecipe:{...value,scentName:'Fake',aromaProfile:{},price:1},quantity:1},{customRecipe:value,quantity:2},{customRecipe:{...value,scentId:8},quantity:1}]));
  assert.deepEqual(parsed.items,[{customRecipe:value,quantity:3},{customRecipe:{...value,scentId:8},quantity:1}]);
  assert.notEqual(recipeKey(value),recipeKey({...value,scentId:8}));
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

test('two-color recipes use catalog IDs, keep combinations distinct and reject invalid extra colors', () => {
  const value={formId:9,scentId:3,color:'ivory',colorId:21,accentColorId:22};
  assert.equal(isRecipe(value),true);
  for(const accentColorId of [0,-1,1.5,'22',null])assert.equal(isRecipe({...value,accentColorId}),false);
  assert.equal(isRecipe({...value,colorId:undefined}),false);
  assert.equal(isRecipe({...recipe,accentColorId:22}),false);
  const parsed=parseOrder(orderBody([{customRecipe:value,quantity:1},{customRecipe:value,quantity:2},{customRecipe:{...value,accentColorId:23},quantity:1}]));
  assert.deepEqual(parsed.items.map(line=>line.quantity),[3,1]);
  assert.notEqual(recipeKey(value),recipeKey({...value,accentColorId:23}));
  assert.notEqual(cartKey(1,null,3,21,22),cartKey(1,null,3,21,23));
  assert.throws(()=>parseForm({name:'Змея',active:true,twoTone:'true'}));
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

  const before = (await pool.query('SELECT * FROM products')).rows;
  let red, blue, redColor, blueColor, product, originalOrder, migratedId, formId;
  const imageFile = () => new File([readFileSync(path.join(root,'public/images/hero-candles.webp'))], 'candle.webp', { type:'image/webp' });
  const formFor = p => {
    const form = new FormData();
    for (const key of ['formId','colorId','scentId','notes','price','stock','published']) form.set(key, String(p[key] ?? ''));
    form.set('expectedStock', String(p.stock));
    return form;
  };
  await t.test('one-time migration moves each physical variant without duplicating stock or losing photos and history', async () => {
    await Promise.all([domain.ensureSchema(), domain.ensureSchema()]);
    const legacy = (await domain.listProducts(true,1))[0];
    assert.equal(legacy.stock,12); assert.equal(legacy.image,before[0].image);assert.deepEqual(legacy.images,[before[0].image]);
    assert.equal(legacy.colorId,null); assert.equal(legacy.scentId,null); assert.ok(legacy.formId);
    assert.equal((await pool.query("SELECT value FROM site_content WHERE key='hero.title'")).rows[0].value, 'Сохранённый заголовок');
    originalOrder = domain.mapOrder((await pool.query("SELECT * FROM orders WHERE order_number='OLD-01'")).rows[0]);
    assert.equal(originalOrder.stockReserved, false);
    assert.equal(originalOrder.items[0].name, 'Старое название');
    const migrated = (await domain.listProducts(true)).find(p => p.id !== 1);
    migratedId=migrated.id;
    assert.equal(migrated.stock,5); assert.equal(migrated.color.hex,'#b82035');
    assert.equal(migrated.image,'/api/uploads/ready-red.webp');
    assert.equal(migrated.scentId,1); assert.equal(migrated.hasVariants,false);
    assert.equal('color' in migrated.scent,false);
    assert.deepEqual(await domain.listProducts(true,2),[]);
    assert.equal((await pool.query('SELECT SUM(stock)::int AS n FROM products')).rows[0].n,17);
    assert.equal((await pool.query('SELECT SUM(stock)::int AS n FROM product_variants')).rows[0].n,0);
    const palette=(await pool.query('SELECT * FROM colors')).rows;
    assert.deepEqual(palette.map(row=>row.name).sort(),['Красный','Чёрный','Белый','Розовый'].sort());
    defaultColorId=Number(palette.find(row=>row.name==='Красный').id);
    const migratedRows=(await pool.query('SELECT * FROM products ORDER BY id')).rows;
    await pool.query("UPDATE scents SET name='Мой красный аромат', active=FALSE WHERE color_name='Красный'");
    globalThis.tihoSchemaReady = undefined; await domain.ensureSchema();
    assert.equal((await pool.query('SELECT * FROM scents')).rows.length, 30);
    assert.equal((await pool.query("SELECT active FROM scents WHERE name='Мой красный аромат'")).rows[0].active, false);
    assert.deepEqual((await pool.query('SELECT * FROM products ORDER BY id')).rows,migratedRows);
    await pool.query("UPDATE scents SET active=TRUE WHERE color_name='Красный'");
  });
  await t.test('cancelling a pre-migration reserved order returns stock to the migrated candle',async()=>{
    const old=domain.mapOrder((await pool.query("SELECT * FROM orders WHERE order_number='OLD-VARIANT'")).rows[0]);
    assert.equal(old.items[0].scentName,'Прежний аромат');assert.equal(old.items[0].color,'#b82035');
    await deleteOrder(old.id);
    assert.equal((await domain.listProducts(true,migratedId))[0].stock,7);
    assert.equal((await pool.query('SELECT stock FROM product_variants WHERE id=1')).rows[0].stock,0);
    await assert.rejects(createOrder(orderBody([{productId:2,variantId:1,scentId:1,quantity:1}])),error=>error.status===409);
  });
  await t.test('all four scents work with existing forms without photos or setup; stock stays shared', async () => {
    const defaults = (await pool.query('SELECT id FROM scents ORDER BY id LIMIT 4')).rows.map(row => Number(row.id));
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
  await t.test('three independent references create candles with their own quantities and photographs', async () => {
    red = Number((await pool.query("INSERT INTO scents(name,description,notes) VALUES('Вишня','Композиция',ARRAY['вишня']) RETURNING id")).rows[0].id);
    blue = Number((await pool.query("INSERT INTO scents(name) VALUES('Море') RETURNING id")).rows[0].id);
    redColor=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Вишнёвый','#c73548') RETURNING id")).rows[0].id);
    blueColor=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Морской','#517e9a') RETURNING id")).rows[0].id);
    formId=Number((await pool.query("INSERT INTO candle_forms(name,shape) VALUES('Колонна','ribbed') RETURNING id")).rows[0].id);
    const draft={formId,colorId:redColor,scentId:red,notes:'Ручное описание',price:2000,stock:3,published:true};
    for(const key of ['formId','colorId','scentId']) {
      await assert.rejects(saveProduct(formFor({...draft,[key]:null})),error=>error.status===400);
      await assert.rejects(saveProduct(formFor({...draft,[key]:99999})),error=>error.status===409);
    }
    const form=formFor(draft); form.set('image',imageFile());
    product=await saveProduct(form);
    assert.equal(product.name,'Колонна');assert.equal(product.formId,formId);assert.equal(product.scentId,red);assert.equal(product.colorId,redColor);
    assert.equal(product.notes,'Ручное описание');assert.equal(product.stock,3);assert.ok(product.image.startsWith('/api/uploads/'));
    const second=await saveProduct(formFor({...draft,colorId:blueColor,stock:4}));
    assert.notEqual(second.id,product.id);assert.equal(second.scentId,product.scentId);assert.notEqual(second.colorId,product.colorId);
    assert.equal((await domain.listProducts(true,product.id))[0].stock,3);
    const edit=formFor({...product,notes:'Новое описание'});
    product=await saveProduct(edit,product.id);assert.equal(product.notes,'Новое описание');assert.ok(product.image);
    await assert.rejects(pool.query("DELETE FROM candle_forms WHERE id=$1",[formId]),error=>['23503','23001'].includes(error.code));
    await assert.rejects(pool.query("DELETE FROM colors WHERE id=$1",[redColor]),error=>['23503','23001'].includes(error.code));
    await assert.rejects(pool.query("DELETE FROM scents WHERE id=$1",[red]),error=>['23503','23001'].includes(error.code));
  });
  const candleLine = (quantity=1) => ({productId:product.id,scentId:red,colorId:redColor,quantity});
  await t.test('orders require the configured combination, snapshot the current form and use the server price', async () => {
    await assert.rejects(createOrder(orderBody([{...candleLine(),scentId:blue}])),error=>error.status===409);
    await assert.rejects(createOrder(orderBody([{...candleLine(),colorId:blueColor}])),error=>error.status===409);
    await assert.rejects(createOrder(orderBody([candleLine(),{...candleLine(),productId:99999}])),error=>error.status===409);
    assert.equal((await domain.listProducts(true,product.id))[0].stock,3);
    await pool.query("UPDATE candle_forms SET name='Новая колонна' WHERE id=$1",[formId]);
    const order=await createOrder(orderBody([{...candleLine(),price:1}]));
    assert.equal(order.total,2000);assert.equal(order.items[0].name,'Новая колонна');assert.equal(order.items[0].scentName,'Вишня');
    await pool.query("UPDATE scents SET name='Другая вишня' WHERE id=$1",[red]);
    await pool.query("UPDATE colors SET hex='#bb3040' WHERE id=$1",[redColor]);
    const snapshot=domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]);
    assert.equal(snapshot.items[0].scentName,'Вишня');assert.equal(snapshot.items[0].color,'#c73548');
    const current=(await domain.listProducts(true,product.id))[0];
    await assert.rejects(saveProduct(formFor({...current,colorId:blueColor}),current.id),/незавершённые/);
    await deleteOrder(order.id);
    assert.equal((await domain.listProducts(true,product.id))[0].stock,3);
  });
  await t.test('disabled forms, colors and aromas hide their candles and prevent checkout and publishing', async () => {
    for(const [table,id] of [['candle_forms',formId],['colors',redColor],['scents',red]]) {
      await pool.query(`UPDATE ${table} SET active=FALSE WHERE id=$1`,[id]);
      assert.deepEqual(await domain.listProducts(false,product.id),[]);
      await assert.rejects(createOrder(orderBody([candleLine()])),error=>error.status===409);
      await assert.rejects(saveProduct(formFor(product),product.id),/публикации/);
      assert.equal((await domain.listProducts(true,product.id))[0].stock,3);
      await pool.query(`UPDATE ${table} SET active=TRUE WHERE id=$1`,[id]);
    }
  });
  await t.test('stock edits reject stale quantities, checkout cannot oversell and retries reserve once', async () => {
    product=await updateStock(product.id,{stock:1,expectedStock:3});
    await assert.rejects(updateStock(product.id,{stock:9,expectedStock:3}),error=>error.status===409);
    const results=await Promise.allSettled([createOrder(orderBody([candleLine()])),createOrder(orderBody([candleLine()]))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
    await assert.rejects(saveProduct(formFor(product),product.id),/Остаток изменился/);
    await assert.rejects(updateStock(product.id,{stock:9,expectedStock:1}),error=>error.status===409);
    await deleteOrder(results.find(r=>r.status==='fulfilled').value.id);
    const request=orderBody([candleLine()]);
    const [placed,retry]=await Promise.all([createOrder(request),createOrder(request)]);
    assert.equal(placed.id,retry.id);assert.equal((await domain.listProducts(true,product.id))[0].stock,0);
    await deleteOrder(placed.id);assert.equal((await domain.listProducts(true,product.id))[0].stock,1);
  });
  await t.test('completed orders consume stock and archived candles still retain restock targets', async () => {
    const order=await createOrder(orderBody([candleLine()]));
    await pool.query("UPDATE orders SET status='completed' WHERE id=$1",[order.id]);
    await deleteOrder(order.id);assert.equal((await domain.listProducts(true,product.id))[0].stock,0);
    await updateStock(product.id,{stock:1,expectedStock:0});
    const pending=await createOrder(orderBody([candleLine()]));
    await pool.query("UPDATE products SET archived=TRUE,published=FALSE WHERE id=$1",[product.id]);
    await deleteOrder(pending.id);
    assert.equal((await pool.query('SELECT stock FROM products WHERE id=$1',[product.id])).rows[0].stock,1);
    assert.deepEqual(await domain.listProducts(true,product.id),[]);
  });
  await t.test('uploaded silhouettes belong to forms; renaming preserves them and product photos can fall back to the silhouette', async () => {
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=','base64');
    const data=new FormData();data.set('name','Моя форма');data.set('active','true');data.set('silhouette',new File([png],'silhouette.png',{type:'image/png'}));
    const form=await saveForm(data);
    assert.equal(form.name,'Моя форма');assert.equal(form.shape,null);assert.match(form.silhouette,/^\/api\/uploads\/.+\.png$/);
    const renamed=new FormData();renamed.set('name','Мой силуэт');renamed.set('active','true');
    const updated=await saveForm(renamed,form.id);assert.equal(updated.silhouette,form.silhouette);assert.equal(updated.name,'Мой силуэт');
    const values={formId:form.id,colorId:redColor,scentId:red,notes:'Моя свеча',stock:2,price:1000,published:true};
    const candleData=formFor(values);candleData.set('image',imageFile());
    const photographed=await saveProduct(candleData);assert.ok(photographed.image);assert.equal(photographed.form.silhouette,form.silhouette);
    const clear=formFor(photographed);clear.set('removeImage','true');
    const candle=await saveProduct(clear,photographed.id);assert.equal(candle.image,null);assert.equal(candle.form.silhouette,form.silhouette);assert.equal(candle.name,'Мой силуэт');
    const placed=await createOrder(orderBody([{productId:candle.id,colorId:redColor,scentId:red,quantity:1}]));
    assert.equal(placed.items[0].image,null);assert.equal(placed.items[0].silhouette,form.silhouette);assert.equal(placed.items[0].shape,undefined);
    data.set('name','Новый силуэт');const replaced=await saveForm(data,form.id);assert.notEqual(replaced.silhouette,form.silhouette);
    assert.deepEqual(readFileSync(path.join(temp,'uploads',path.basename(form.silhouette))),png);
    const oldOrder=domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[placed.id])).rows[0]);assert.equal(oldOrder.items[0].silhouette,form.silhouette);
    await deleteOrder(placed.id);
    const bad=new FormData();bad.set('name','Нельзя');bad.set('active','true');bad.set('silhouette',new File(['<svg/>'],'silhouette.svg',{type:'image/svg+xml'}));
    await assert.rejects(saveForm(bad),error=>error.status===400);
    renamed.set('removeSilhouette','true');const removed=await saveForm(renamed,form.id);assert.equal(removed.silhouette,null);assert.equal(removed.shape,null);
    const emptyForm=await saveForm({name:'Форма без изображения',active:true});assert.equal(emptyForm.shape,null);assert.equal(emptyForm.silhouette,null);
  });
  await t.test('builder forms use server snapshots, reject disabled choices and never consume ready-made stock',async()=>{
    const data=new FormData();data.set('name','Авторская ракушка');data.set('active','true');
    data.set('silhouette',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=','base64')],'shell.png',{type:'image/png'}));
    const form=await saveForm(data);
    const customRecipe={formId:form.id,color:'red',top:'lemon',heart:'fig',base:'oud'};
    const request=orderBody([{customRecipe:{...customRecipe,formName:'Forged',silhouette:'/fake.png'},quantity:2}]);
    const before=(await pool.query('SELECT id,stock FROM products ORDER BY id')).rows;
    const [placed,retry]=await Promise.all([createOrder(request),createOrder(request)]);
    assert.equal(placed.id,retry.id);assert.equal(placed.stockReserved,false);assert.equal(placed.total,0);
    const item=placed.items[0];assert.equal(item.name,'Авторская свеча · Авторская ракушка');assert.equal(item.formName,form.name);assert.equal(item.silhouette,form.silhouette);assert.equal(item.quotePending,true);assert.deepEqual(item.customRecipe,customRecipe);
    assert.deepEqual((await pool.query('SELECT id,stock FROM products ORDER BY id')).rows,before);
    await saveForm({name:'Изменённая ракушка',active:false},form.id);
    await assert.rejects(createOrder(orderBody([{customRecipe,quantity:1}])),error=>error.status===409);
    await assert.rejects(createOrder(orderBody([{customRecipe:{...customRecipe,formId:999999},quantity:1}])),error=>error.status===409);
    const stock=(await domain.listProducts(true,1))[0].stock;
    await assert.rejects(createOrder(orderBody([{productId:1,scentId:1,colorId:defaultColorId,quantity:1},{customRecipe,quantity:1}])),error=>error.status===409);
    assert.equal((await domain.listProducts(true,1))[0].stock,stock);
    assert.equal((await createOrder(request)).id,placed.id);
    const stored=domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[placed.id])).rows[0]);
    assert.equal(stored.items[0].formName,'Авторская ракушка');assert.equal(stored.items[0].silhouette,form.silhouette);
    await pool.query('DELETE FROM candle_forms WHERE id=$1',[form.id]);assert.equal((await createOrder(request)).id,placed.id);
    await deleteOrder(placed.id);assert.deepEqual((await pool.query('SELECT id,stock FROM products ORDER BY id')).rows,before);
  });
  await t.test('multiple photographs preserve order, cover and legacy photos, reject foreign URLs and stale galleries',async()=>{
    const form=await saveForm({name:'Форма для галереи',active:true});
    const values={formId:form.id,colorId:redColor,scentId:red,notes:'Галерея',price:2000,stock:3,published:true};
    const data=formFor(values);data.set('photos',JSON.stringify([{upload:0},{upload:1}]));data.append('images',imageFile());data.append('images',imageFile());
    const candle=await saveProduct(data);assert.equal(candle.images.length,2);assert.equal(candle.image,candle.images[0]);assert.notEqual(candle.images[0],candle.images[1]);
    const beforeUploads=readdirSync(path.join(temp,'uploads')).length;
    const invalid=formFor(values);invalid.set('photos',JSON.stringify([{url:'/api/uploads/foreign.webp'}]));await assert.rejects(saveProduct(invalid,candle.id),error=>error.status===400);
    invalid.set('photos',JSON.stringify([{upload:0},{upload:0}]));invalid.append('images',imageFile());await assert.rejects(saveProduct(invalid,candle.id),error=>error.status===400);
    invalid.set('photos',JSON.stringify(Array.from({length:11},()=>({upload:0}))));await assert.rejects(saveProduct(invalid,candle.id),error=>error.status===400);
    const badFile=formFor(values);badFile.set('photos','[{"upload":0},{"upload":1}]');badFile.append('images',imageFile());badFile.append('images',new File(['bad'],'bad.svg',{type:'image/svg+xml'}));await assert.rejects(saveProduct(badFile,candle.id),error=>error.status===400);
    assert.equal(readdirSync(path.join(temp,'uploads')).length,beforeUploads);
    const reorder=formFor(values);reorder.set('expectedImages',JSON.stringify(candle.images));reorder.set('photos',JSON.stringify([{url:candle.images[1]},{upload:0},{url:candle.images[0]}]));reorder.append('images',imageFile());
    const reordered=await saveProduct(reorder,candle.id);assert.equal(reordered.images.length,3);assert.equal(reordered.image,candle.images[1]);assert.equal(reordered.images[2],candle.images[0]);
    await assert.rejects(saveProduct(reorder,candle.id),error=>error.status===409);
    const placed=await createOrder(orderBody([{productId:candle.id,scentId:red,colorId:redColor,quantity:1}]));assert.equal(placed.items[0].image,reordered.image);
    const clear=formFor({...values,stock:2});clear.set('expectedImages',JSON.stringify(reordered.images));clear.set('photos','[]');const cleared=await saveProduct(clear,candle.id);assert.equal(cleared.image,null);assert.deepEqual(cleared.images,[]);
    for(const url of reordered.images)assert.ok(readFileSync(path.join(temp,'uploads',path.basename(url))).length);
    globalThis.tihoSchemaReady=undefined;await domain.ensureSchema();assert.deepEqual((await domain.listProducts(true,candle.id))[0].images,[]);
    await deleteOrder(placed.id);
  });

  await t.test('catalog aroma orders store trusted chapters and remain unchanged after aroma rename or deletion',async()=>{
    const form=await saveForm({name:'Форма для аромата',active:true});
    const profile={top:{notes:'Цедра',description:'Яркое начало'},heart:{notes:'Чай',description:'Мягкое сердце'},base:{notes:'Дерево',description:'Долгий шлейф'}};
    const scent=Number((await pool.query("INSERT INTO scents(name,profile) VALUES('Авторский чай',$1::jsonb) RETURNING id",[JSON.stringify(profile)])).rows[0].id);
    const recipe={formId:form.id,color:'ivory',scentId:scent};const request=orderBody([{customRecipe:{...recipe,scentName:'Fake',aromaProfile:{},price:1},quantity:2}]);
    const before=(await pool.query('SELECT id,stock FROM products ORDER BY id')).rows;const placed=await createOrder(request);
    assert.equal(placed.stockReserved,false);assert.equal(placed.total,0);assert.deepEqual(placed.items[0].customRecipe,recipe);assert.equal(placed.items[0].scentName,'Авторский чай');assert.deepEqual(placed.items[0].aromaProfile,profile);
    assert.deepEqual((await pool.query('SELECT id,stock FROM products ORDER BY id')).rows,before);
    await pool.query("UPDATE scents SET name='Новое название',active=FALSE,profile='{}' WHERE id=$1",[scent]);
    await assert.rejects(createOrder(orderBody([{customRecipe:recipe,quantity:1}])),error=>error.status===409);
    await assert.rejects(createOrder(orderBody([{customRecipe:{...recipe,scentId:999999},quantity:1}])),error=>error.status===409);
    await assert.rejects(createOrder(orderBody([{productId:1,scentId:1,colorId:defaultColorId,quantity:1},{customRecipe:recipe,quantity:1}])),error=>error.status===409);
    assert.deepEqual((await pool.query('SELECT id,stock FROM products ORDER BY id')).rows,before);
    await pool.query('DELETE FROM scents WHERE id=$1',[scent]);
    assert.equal((await createOrder(request)).id,placed.id);
    const saved=domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[placed.id])).rows[0]);assert.equal(saved.items[0].scentName,'Авторский чай');assert.deepEqual(saved.items[0].aromaProfile,profile);
    await deleteOrder(placed.id);
  });

  await t.test('portrait migration preserves matching aromas and never recreates deleted collection entries',async()=>{
    const entries=(await pool.query("SELECT * FROM scents WHERE image LIKE '/assets/aromas/%' ORDER BY id")).rows;assert.equal(entries.length,26);assert.deepEqual(entries.map(s=>s.name).sort(),aromaPortraits.map(s=>s.name).sort());
    const cherry=entries.find(s=>s.name==='CHERRY');const profile={top:{notes:'Наше начало',description:'Текст'},heart:{notes:'Наше сердце',description:'Текст'},base:{notes:'Наш шлейф',description:'Текст'}};
    await pool.query("UPDATE scents SET name='Cherry',description='Описание мастерской',profile=$1::jsonb,active=FALSE,image='/api/uploads/old.webp' WHERE id=$2",[JSON.stringify(profile),cherry.id]);
    await pool.query("DELETE FROM app_migrations WHERE key='aroma-portraits-v1'");globalThis.tihoSchemaReady=undefined;await domain.ensureSchema();
    const saved=(await pool.query('SELECT * FROM scents WHERE id=$1',[cherry.id])).rows[0];assert.equal(saved.name,'Cherry');assert.equal(saved.description,'Описание мастерской');assert.deepEqual(saved.profile,profile);assert.equal(saved.active,false);assert.equal(saved.image,'/api/uploads/old.webp');assert.equal((await pool.query("SELECT count(*)::int AS n FROM scents WHERE LOWER(name)='cherry'")).rows[0].n,1);
    const cherryWine=entries.find(s=>s.name==='CHERRY WINE');
    await pool.query("UPDATE scents SET name='Cherry Wine',description='Наше вишнёвое вино',profile=$1::jsonb,active=FALSE,image='/assets/aromas/cherry.webp' WHERE id=$2",[JSON.stringify(profile),cherryWine.id]);
    await pool.query("DELETE FROM app_migrations WHERE key='cherry-wine-portrait-v1'");globalThis.tihoSchemaReady=undefined;await domain.ensureSchema();
    const attached=(await pool.query('SELECT * FROM scents WHERE id=$1',[cherryWine.id])).rows[0];assert.equal(attached.name,'Cherry Wine');assert.equal(attached.description,'Наше вишнёвое вино');assert.deepEqual(attached.profile,profile);assert.equal(attached.active,false);assert.equal(attached.image,'/assets/aromas/cherry-wine.webp');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM scents WHERE LOWER(name)='cherry wine'")).rows[0].n,1);
    await pool.query("UPDATE scents SET image='/api/uploads/later.webp' WHERE id=$1",[cherryWine.id]);globalThis.tihoSchemaReady=undefined;await domain.ensureSchema();assert.equal((await pool.query('SELECT image FROM scents WHERE id=$1',[cherryWine.id])).rows[0].image,'/api/uploads/later.webp');
    const wine=entries.find(s=>s.name==='WINE');await pool.query('DELETE FROM scents WHERE id=$1',[wine.id]);globalThis.tihoSchemaReady=undefined;await domain.ensureSchema();assert.equal((await pool.query("SELECT * FROM scents WHERE name='WINE'")).rowCount,0);
  });

  await t.test('aroma photos support library selection, multipart upload, rename and explicit removal',async()=>{
    const body={name:'Наша фотокомпозиция',description:'Авторское описание',notes:['нота'],active:true,image:'/assets/aromas/cherry.webp'};
    const jsonRequest=data=>new Request('http://test/api/scents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    let scent=await saveScent(jsonRequest(body));assert.equal(scent.image,body.image);
    const data=new FormData();data.set('data',JSON.stringify({...body,name:'Наш новый портрет'}));data.set('image',imageFile());scent=await saveScent(new Request('http://test/api/scents',{method:'PATCH',body:data}),scent.id);assert.match(scent.image,/^\/api\/uploads\/.+\.webp$/);const uploaded=scent.image;
    const {image,...withoutImage}=body;scent=await saveScent(jsonRequest({...withoutImage,name:'Переименованный аромат'}),scent.id);assert.equal(scent.image,uploaded);
    data.set('image',new File(['svg'],'bad.svg',{type:'image/svg+xml'}));await assert.rejects(saveScent(new Request('http://test/api/scents',{method:'PATCH',body:data}),scent.id),error=>error.status===400);
    await assert.rejects(saveScent(jsonRequest({...body,image:'https://untrusted.example/picture.png'}),scent.id),error=>error.status===400);
    scent=await saveScent(jsonRequest({...body,image:null}),scent.id);assert.equal(scent.image,null);assert.ok(readFileSync(path.join(temp,'uploads',path.basename(uploaded))).length);
  });

  await t.test('aroma profiles preserve three explicitly authored chapters independently of candle and scent notes', async () => {
    const profile={top:{notes:'Цитрус',description:'Первое впечатление'},heart:{notes:'Цветы',description:'Сердце композиции'},base:{notes:'Дерево',description:'Тёплый шлейф'}};
    assert.deepEqual(parseAromaProfile(profile),profile);
    assert.throws(()=>parseAromaProfile({...profile,heart:[]}));
    assert.throws(()=>parseAromaProfile({...profile,top:{notes:'a'.repeat(241),description:''}}));
    assert.throws(()=>parseForm({name:'Форма',shape:'unknown',active:true}));
    assert.equal(parseForm({name:' Своя форма ',shape:'shell',active:true}).name,'Своя форма');
    await pool.query('UPDATE scents SET profile=$1::jsonb WHERE id=$2',[JSON.stringify(profile),red]);
    assert.deepEqual(domain.mapScent((await pool.query('SELECT * FROM scents WHERE id=$1',[red])).rows[0]).profile,profile);
    assert.deepEqual(domain.mapScent((await pool.query('SELECT * FROM scents WHERE id=$1',[red])).rows[0]).notes,['вишня']);
  });
  await t.test('two-color templates, ready candles and custom recipes preserve trusted colors and stock',async()=>{
    const setup=new FormData();setup.set('name','Змея два цвета');setup.set('active','true');setup.set('twoTone','true');setup.set('silhouettePreset','snake-two-tone');
    const form=await saveForm(setup);assert.equal(form.twoTone,true);assert.equal(form.silhouette,'/assets/forms/snake-two-tone.png');
    const base=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Наш изумруд','#123456') RETURNING id")).rows[0].id);
    const accent=Number((await pool.query("INSERT INTO colors(name,hex) VALUES('Наше серебро','#c8c9cb') RETURNING id")).rows[0].id);
    const scent=Number((await pool.query("INSERT INTO scents(name) VALUES('Двухцветный аромат') RETURNING id")).rows[0].id);
    const recipe={formId:form.id,color:'ivory',colorId:base,accentColorId:accent,scentId:scent};
    const custom=await createOrder(orderBody([{customRecipe:recipe,quantity:2}]));
    assert.equal(custom.items[0].color,'#123456');assert.equal(custom.items[0].colorName,'Наш изумруд');assert.equal(custom.items[0].accentColorName,'Наше серебро');assert.equal(custom.items[0].twoTone,true);assert.equal(custom.stockReserved,false);
    await assert.rejects(createOrder(orderBody([{customRecipe:{...recipe,accentColorId:undefined},quantity:1}])),error=>error.status===409);
    const data=formFor({formId:form.id,colorId:base,scentId:scent,notes:'',price:1800,stock:3,published:true});data.set('accentColorId',String(accent));
    const candle=await saveProduct(data);assert.equal(candle.accentColorId,accent);assert.equal(candle.accentColor.name,'Наше серебро');
    const line={productId:candle.id,colorId:base,scentId:scent,accentColorId:accent,quantity:1};
    await assert.rejects(createOrder(orderBody([{...line,accentColorId:base}])),error=>error.status===409);
    const ready=await createOrder(orderBody([line]));assert.equal(ready.items[0].accentColorId,accent);assert.equal((await domain.listProducts(true,candle.id))[0].stock,2);
    data.set('stock','2');data.set('expectedStock','2');data.set('accentColorId',String(base));await assert.rejects(saveProduct(data,candle.id),error=>error.status===409);
    await assert.rejects(saveForm({name:form.name,active:true,twoTone:false},form.id),error=>error.status===409);
    await pool.query("UPDATE colors SET active=FALSE,name='Позднее название' WHERE id=$1",[accent]);
    await assert.rejects(createOrder(orderBody([{customRecipe:recipe,quantity:1}])),error=>error.status===409);
    assert.equal((await domain.listProducts()).some(p=>p.id===candle.id),false);
    const saved=domain.mapOrder((await pool.query('SELECT * FROM orders WHERE id=$1',[custom.id])).rows[0]);assert.equal(saved.items[0].accentColorName,'Наше серебро');
    await deleteOrder(ready.id);assert.equal((await domain.listProducts(true,candle.id))[0].stock,3);
    await deleteOrder(custom.id);
  });

});
