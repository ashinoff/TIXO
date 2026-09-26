import { Pool } from "pg";
import { aromaPortraits } from "../aroma-portraits";
import type { Product, OrderItem, Scent, Variant, CandleColor, CandleForm } from "../catalog";
import { candleShapes, emptyAromaProfile, productShape, type CandleShape } from "../catalog";

declare global { var tihoPool: Pool | undefined; var tihoSchemaReady: Promise<void> | undefined; }

export type StoredProduct = Product;
export type StoredCategory={id:number;name:string;slug:string;mood:string;description:string;notes:string[];paper:string;ink:string;accent:string;soft:string};

export type StoredOrder = {
  id:number; orderNumber:string; customerName:string; phone:string; email:string; address:string;
  delivery:string; comment:string; items:OrderItem[]; stockReserved:boolean;
  total:number; status:"new"|"in_progress"|"completed"; createdAt:string;
};

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  global.tihoPool ??= new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined });
  return global.tihoPool;
}

export async function ensureSchema() {
  global.tihoSchemaReady ??= (async () => {
    const db = await getPool().connect();
    try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(84173026)");
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
    await db.query(`CREATE TABLE IF NOT EXISTS scents (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      notes TEXT[] NOT NULL DEFAULT '{}', color TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
      color_name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS scents_name_unique ON scents (LOWER(name))");

    await db.query("CREATE TABLE IF NOT EXISTS app_migrations (key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const presets = await db.query("INSERT INTO app_migrations(key) VALUES('global-scents-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (presets.rowCount) {
      const colors = [
        ["Вишня и миндаль", "Спелая вишня, мягкий миндаль и тёплая ваниль.", ["вишня", "миндаль", "ваниль"], "#b82035", "Красный"],
        ["Сандал и дым", "Сухое дерево, пряный кардамон и лёгкий дым.", ["сандал", "кардамон", "дым"], "#222225", "Чёрный"],
        ["Белая ваниль", "Нежная ваниль с нотами хлопка и белого мускуса.", ["ваниль", "хлопок", "белый мускус"], "#f7f5ef", "Белый"],
        ["Роза и пион", "Свежие лепестки розы и пиона с пудровым послевкусием.", ["роза", "пион", "пудра"], "#e7a0b5", "Розовый"],
      ];
      for (const row of colors) await db.query("INSERT INTO scents(name,description,notes,color,color_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", row);
    }
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS shape TEXT");
    await db.query(`CREATE TABLE IF NOT EXISTS product_variants (
      id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      scent_id BIGINT NOT NULL REFERENCES scents(id) ON DELETE RESTRICT,
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0), image TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE(product_id, scent_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("CREATE INDEX IF NOT EXISTS product_variants_scent_idx ON product_variants (scent_id)");
    await db.query(`CREATE TABLE IF NOT EXISTS colors (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, hex TEXT NOT NULL CHECK (hex ~ '^#[0-9a-f]{6}$'),
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS colors_hex_unique ON colors (LOWER(hex))");
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS colors_name_unique ON colors (LOWER(name))");
    await db.query("ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_id BIGINT REFERENCES colors(id) ON DELETE RESTRICT");
    const independent = await db.query("INSERT INTO app_migrations(key) VALUES('independent-colors-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (independent.rowCount) {
      // Copy existing physical colors once; never re-create deleted colors on startup.
      await db.query(`INSERT INTO colors(name,hex) SELECT DISTINCT ON (LOWER(color)) CASE WHEN COUNT(*) OVER (PARTITION BY LOWER(color_name)) > 1 THEN color_name || ' · ' || LOWER(color) ELSE color_name END,LOWER(color)
        FROM scents WHERE color IS NOT NULL ORDER BY LOWER(color),id ON CONFLICT DO NOTHING`);
      // Preserve IDs, photographs and stock of every existing variant and old order.
      await db.query(`UPDATE product_variants v SET color_id=c.id FROM scents s JOIN colors c ON c.hex=LOWER(s.color)
        WHERE v.scent_id=s.id AND v.color_id IS NULL`);
      await db.query("ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_product_id_scent_id_key");
      await db.query("DROP INDEX IF EXISTS scents_color_unique");
      await db.query("ALTER TABLE scents ALTER COLUMN color DROP NOT NULL, ALTER COLUMN color_name DROP NOT NULL");
      await db.query("ALTER TABLE product_variants ALTER COLUMN color_id SET NOT NULL");
    }
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS product_variants_combination_unique ON product_variants(product_id,scent_id,color_id)");
    await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE");
    await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_key TEXT");
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key_unique ON orders (request_key) WHERE request_key IS NOT NULL");
    await db.query(`CREATE TABLE IF NOT EXISTS candle_forms (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, shape TEXT NOT NULL DEFAULT 'ribbed', active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query("ALTER TABLE candle_forms ADD COLUMN IF NOT EXISTS silhouette TEXT, ADD COLUMN IF NOT EXISTS two_tone BOOLEAN NOT NULL DEFAULT FALSE");
    await db.query("ALTER TABLE candle_forms ALTER COLUMN shape DROP NOT NULL, ALTER COLUMN shape DROP DEFAULT");
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS candle_forms_name_unique ON candle_forms(LOWER(name))");
    await db.query("ALTER TABLE scents ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb");
    await db.query(`ALTER TABLE products
      ADD COLUMN IF NOT EXISTS form_id BIGINT REFERENCES candle_forms(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS color_id BIGINT REFERENCES colors(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS accent_color_id BIGINT REFERENCES colors(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS scent_id BIGINT REFERENCES scents(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS legacy_variant_id BIGINT UNIQUE,
      ADD COLUMN IF NOT EXISTS legacy_parent_id BIGINT`);
    const inventory = await db.query("INSERT INTO app_migrations(key) VALUES('individual-candles-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (inventory.rowCount) {
      await db.query(`INSERT INTO candle_forms(name,shape)
        SELECT DISTINCT ON (LOWER(name)) name, COALESCE(shape,CASE (id-1)%6 WHEN 0 THEN 'twist' WHEN 1 THEN 'ribbed' WHEN 2 THEN 'bubble' WHEN 3 THEN 'arch' WHEN 4 THEN 'shell' ELSE 'knot' END) FROM products ORDER BY LOWER(name),id ON CONFLICT DO NOTHING`);
      await db.query("UPDATE products p SET form_id=f.id FROM candle_forms f WHERE LOWER(p.name)=LOWER(f.name) AND p.form_id IS NULL");
      // One physical variant becomes one candle. Preserve a link for cancellation of historical orders.
      await db.query(`INSERT INTO products(name,category,category_id,notes,price,stock,published,image,shape,form_id,color_id,scent_id,legacy_variant_id,legacy_parent_id)
        SELECT p.name,p.category,p.category_id,p.notes,p.price,v.stock,p.published AND v.active,COALESCE(v.image,p.image),p.shape,p.form_id,v.color_id,v.scent_id,v.id,p.id
        FROM product_variants v JOIN products p ON p.id=v.product_id ORDER BY v.id`);
      await db.query("UPDATE products SET archived=TRUE,published=FALSE,stock=0 WHERE id IN (SELECT product_id FROM product_variants)");
      await db.query("UPDATE product_variants SET stock=0,active=FALSE");
    }
    // Null marks legacy single-photo rows; an explicit empty list means silhouette only.
    await db.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB");
    await db.query("ALTER TABLE scents ADD COLUMN IF NOT EXISTS image TEXT");
    const portraits = await db.query("INSERT INTO app_migrations(key) VALUES('aroma-portraits-v1') ON CONFLICT DO NOTHING RETURNING key");
    if (portraits.rowCount) {
      for (const portrait of aromaPortraits) {
        // Keep live IDs, descriptions, chapters and availability; attach only a missing portrait.
        await db.query(`INSERT INTO scents(name,image) VALUES($1,$2)
          ON CONFLICT (LOWER(name)) DO UPDATE SET image=COALESCE(scents.image,EXCLUDED.image)`, [portrait.name, portrait.image]);
      }
    }
    const cherryWine = aromaPortraits.find(portrait => portrait.slug === "cherry-wine");
    if (cherryWine && (await db.query("INSERT INTO app_migrations(key) VALUES('cherry-wine-portrait-v1') ON CONFLICT DO NOTHING RETURNING key")).rowCount) {
      // Attach the requested photo to the existing aroma; keep its ID and authored content.
      // Run only once so later photo edits in the workshop remain authoritative.
      await db.query(`INSERT INTO scents(name,image) VALUES($1,$2)
        ON CONFLICT (LOWER(name)) DO UPDATE SET image=EXCLUDED.image,updated_at=NOW()`, [cherryWine.name, cherryWine.image]);
    }
    await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  })().catch(error => { global.tihoSchemaReady = undefined; throw error; });
  return global.tihoSchemaReady;
}

export function mapProduct(row: Record<string, unknown>): StoredProduct {
  const images = Array.isArray(row.images) ? row.images.map(String) : row.image ? [String(row.image)] : [];
  return { formId: row.form_id ? Number(row.form_id) : null, colorId: row.color_id ? Number(row.color_id) : null, scentId: row.scent_id ? Number(row.scent_id) : null,
    images, accentColorId: row.accent_color_id ? Number(row.accent_color_id) : null, accentColor: row.accent_color ? mapColor(row.accent_color as Record<string, unknown>) : null,
    form: row.form ? mapForm(row.form as Record<string, unknown>) : null, color: row.color ? mapColor(row.color as Record<string, unknown>) : null, scent: row.scent ? mapScent(row.scent as Record<string, unknown>) : null,
    id:Number(row.id), name:String(row.form_name || row.name), category:String(row.category_name || row.category), notes:String(row.notes), price:Number(row.price), stock:Number(row.stock), published:Boolean(row.published), image:row.image ? String(row.image) : null, categoryId:row.category_id?Number(row.category_id):null, categorySlug:row.category_slug?String(row.category_slug):null, hasVariants:Boolean(row.has_variants), variants:[], shape: typeof row.shape === "string" && Object.hasOwn(candleShapes, row.shape) ? row.shape as CandleShape : productShape({id:Number(row.id)}) };
}
export function mapCategory(row:Record<string,unknown>):StoredCategory{return{id:Number(row.id),name:String(row.name),slug:String(row.slug),mood:String(row.mood),description:String(row.description),notes:Array.isArray(row.notes)?row.notes.map(String):[],paper:String(row.paper),ink:String(row.ink),accent:String(row.accent),soft:String(row.soft)}}

export function mapOrder(row: Record<string, unknown>): StoredOrder {
  return { id:Number(row.id), orderNumber:String(row.order_number), customerName:String(row.customer_name), phone:String(row.phone), email:String(row.email), address:String(row.address), delivery:String(row.delivery), comment:String(row.comment || ""), items:Array.isArray(row.items) ? row.items as StoredOrder["items"] : [], total:Number(row.total), status:String(row.status) as StoredOrder["status"], stockReserved:Boolean(row.stock_reserved), createdAt:new Date(String(row.created_at)).toISOString() };
}

export function mapScent(row: Record<string, unknown>): Scent {
  return { id: Number(row.id), name: String(row.name), description: String(row.description),
    image: row.image ? String(row.image) : null,
    profile: { ...emptyAromaProfile(), ...(row.profile && typeof row.profile === "object" ? row.profile : {}) },
    notes: Array.isArray(row.notes) ? row.notes.map(String) : [], active: Boolean(row.active) };
}

export function mapColor(row: Record<string, unknown>): CandleColor {
  return { id: Number(row.id), name: String(row.name), hex: String(row.hex), active: Boolean(row.active) };
}

export function mapVariant(row: Record<string, unknown>): Variant {
  return { id: Number(row.id), scentId: Number(row.scent_id), colorId: Number(row.color_id), color: mapColor(row.color as Record<string, unknown>), stock: Number(row.stock),
    image: row.image ? String(row.image) : null, active: Boolean(row.active),
    scent: mapScent(row.scent as Record<string, unknown>) };
}

export function mapForm(row: Record<string, unknown>): CandleForm {
  return { id: Number(row.id), name: String(row.name), active: Boolean(row.active), shape: typeof row.shape === "string" && Object.hasOwn(candleShapes, row.shape) ? row.shape as CandleShape : null, silhouette: row.silhouette ? String(row.silhouette) : null, twoTone: Boolean(row.two_tone) };
}

export async function listProducts(admin = false, id?: number): Promise<Product[]> {
  await ensureSchema();
  const result = await getPool().query(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, f.name AS form_name,
    COALESCE(f.shape,p.shape) AS shape, to_jsonb(f) AS form, to_jsonb(cl) AS color, to_jsonb(ac) AS accent_color, to_jsonb(s) AS scent
    FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN candle_forms f ON f.id=p.form_id
    LEFT JOIN colors cl ON cl.id=p.color_id LEFT JOIN colors ac ON ac.id=p.accent_color_id LEFT JOIN scents s ON s.id=p.scent_id
    WHERE NOT p.archived AND ($1::boolean OR (p.published AND COALESCE(f.active,TRUE) AND COALESCE(cl.active,TRUE) AND COALESCE(ac.active,TRUE) AND COALESCE(s.active,TRUE)))
      AND ($2::bigint IS NULL OR p.id=$2) ORDER BY p.id`, [admin, id ?? null]);
  return result.rows.map(mapProduct);
}
