import { Pool } from "pg";

declare global { var tihoPool: Pool | undefined; var tihoSchemaReady: Promise<void> | undefined; }

export type StoredProduct = {
  id: number; name: string; category: string; notes: string; price: number;
  stock: number; published: boolean; image: string | null;
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
  })();
  return global.tihoSchemaReady;
}

export function mapProduct(row: Record<string, unknown>): StoredProduct {
  return { id:Number(row.id), name:String(row.name), category:String(row.category), notes:String(row.notes), price:Number(row.price), stock:Number(row.stock), published:Boolean(row.published), image:row.image ? String(row.image) : null };
}
