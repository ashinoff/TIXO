import { Pool } from "pg";

declare global { var tihoPool: Pool | undefined; var tihoSchemaReady: Promise<void> | undefined; }

export type StoredProduct = {
  id: number; name: string; category: string; notes: string; price: number;
  stock: number; published: boolean; image: string | null; categoryId:number|null; categorySlug:string|null;
};
export type StoredCategory={id:number;name:string;slug:string;mood:string;description:string;notes:string[];paper:string;ink:string;accent:string;soft:string};

export type StoredOrder = {
  id:number; orderNumber:string; customerName:string; phone:string; email:string; address:string;
  delivery:string; comment:string; items:Array<{ productId:number; name:string; price:number; quantity:number }>;
  total:number; status:"new"|"in_progress"|"completed"; createdAt:string;
};

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  global.tihoPool ??= new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined });
  return global.tihoPool;
}

export async function ensureSchema() {
  global.tihoSchemaReady ??= (async () => {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      notes TEXT NOT NULL, price INTEGER NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), published BOOLEAN NOT NULL DEFAULT FALSE,
      image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
      mood TEXT NOT NULL, description TEXT NOT NULL, notes TEXT[] NOT NULL DEFAULT '{}',
      paper TEXT NOT NULL DEFAULT '#f4efe5', ink TEXT NOT NULL DEFAULT '#211d1a',
      accent TEXT NOT NULL DEFAULT '#6c1637', soft TEXT NOT NULL DEFAULT '#e8ddcb',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL");
    await db.query(`CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, order_number TEXT UNIQUE, customer_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL, delivery TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '', items JSONB NOT NULL, total INTEGER NOT NULL CHECK (total >= 0),
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const categoryCount=await db.query<{count:string}>("SELECT COUNT(*)::text AS count FROM categories");
    if(categoryCount.rows[0].count==="0"){
      const seedCategories=[
        ["Тепло","warm","Дом обнимает","Для вечера, когда хочется завернуться в плед, выключить уведомления и никуда не спешить.",["ваниль","сандал","тонка"],"#f4ede2","#2a201b","#8a3f2d","#dec4a7"],
        ["Свежо","fresh","Окна настежь","Чистый воздух после дождя, прохладный лён и зелёные ветви. Лёгкость без сладости.",["ветивер","нероли","мох"],"#edf4ef","#18322b","#397766","#c8ddd4"],
        ["Нежно","floral","Цветы без повода","Прозрачные лепестки, пудровая дымка и мягкое утреннее солнце.",["пион","ирис","мускус"],"#f7edf1","#3c2530","#a45a78","#ead0da"],
        ["Глубоко","deep","Свет после полуночи","Тёмное дерево, специи и едва заметный дым — камерный аромат с длинным послевкусием.",["кедр","кожа","амбра"],"#e9e5df","#211d1a","#51463f","#c8beb1"]
      ];
      for(const row of seedCategories)await db.query("INSERT INTO categories(name,slug,mood,description,notes,paper,ink,accent,soft) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",row);
    }
    const count = await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM products");
    if (count.rows[0].count === "0") {
      const seed = [
        ["Ещё пять минут","Тёплый · древесный","ваниль · сандал · бобы тонка",2490,8,true],
        ["Тёплый хлеб","Гурманский · мягкий","бриошь · кедр · морская соль",2290,4,true],
        ["После дождя","Свежий · зелёный","ветивер · мох · мокрый камень",2590,0,true],
        ["Яблоко & дым","Пряный · дымный","печёное яблоко · кожа · камин",2390,11,false],
        ["Белые простыни","Чистый · воздушный","хлопок · нероли · белый чай",2190,6,true],
        ["Без спешки","Зелёный · сливочный","инжир · чай матча · кашемир",2490,3,true],
      ];
      for (const row of seed) await db.query("INSERT INTO products(name,category,notes,price,stock,published) VALUES($1,$2,$3,$4,$5,$6)", row);
    }
    await db.query("UPDATE products SET category_id=(SELECT id FROM categories WHERE slug='warm') WHERE category_id IS NULL AND (category ILIKE 'тёпл%' OR category ILIKE 'гурман%')");
    await db.query("UPDATE products SET category_id=(SELECT id FROM categories WHERE slug='fresh') WHERE category_id IS NULL AND (category ILIKE 'свеж%' OR category ILIKE 'чист%' OR category ILIKE 'зелён%')");
    await db.query("UPDATE products SET category_id=(SELECT id FROM categories WHERE slug='deep') WHERE category_id IS NULL AND category ILIKE 'прян%'");
  })();
  return global.tihoSchemaReady;
}

export function mapProduct(row: Record<string, unknown>): StoredProduct {
  return { id:Number(row.id), name:String(row.name), category:String(row.category_name || row.category), notes:String(row.notes), price:Number(row.price), stock:Number(row.stock), published:Boolean(row.published), image:row.image ? String(row.image) : null, categoryId:row.category_id?Number(row.category_id):null, categorySlug:row.category_slug?String(row.category_slug):null };
}
export function mapCategory(row:Record<string,unknown>):StoredCategory{return{id:Number(row.id),name:String(row.name),slug:String(row.slug),mood:String(row.mood),description:String(row.description),notes:Array.isArray(row.notes)?row.notes.map(String):[],paper:String(row.paper),ink:String(row.ink),accent:String(row.accent),soft:String(row.soft)}}

export function mapOrder(row: Record<string, unknown>): StoredOrder {
  return { id:Number(row.id), orderNumber:String(row.order_number), customerName:String(row.customer_name), phone:String(row.phone), email:String(row.email), address:String(row.address), delivery:String(row.delivery), comment:String(row.comment || ""), items:Array.isArray(row.items) ? row.items as StoredOrder["items"] : [], total:Number(row.total), status:String(row.status) as StoredOrder["status"], createdAt:new Date(String(row.created_at)).toISOString() };
}
