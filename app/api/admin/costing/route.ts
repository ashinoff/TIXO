import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/auth";
import { ensureSchema, getPool } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
const defaults: [string,string,number][] = [["Гипс","г",0.13],["Воск","г",0.65],["Отдушка","г",20],["Фитиль","шт",5],["Краска","шт",50],["Упаковка S","шт",87],["Упаковка L","шт",103],["Доп. расходы","усл. ед.",10],["Подставка S","шт",50],["Подставка L","шт",80],["Спички","шт",70]];
async function prepare() {
  await ensureSchema();
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS costing_materials (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL, unit_price NUMERIC(14,4) NOT NULL CHECK(unit_price >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS costing_recipes (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, product_id BIGINT REFERENCES products(id) ON DELETE SET NULL, markup_pct NUMERIC(9,2) NOT NULL DEFAULT 100, sale_price NUMERIC(14,2), items JSONB NOT NULL DEFAULT '{}'::jsonb, note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.query(`CREATE TABLE IF NOT EXISTS costing_history (id BIGSERIAL PRIMARY KEY, recipe_id BIGINT REFERENCES costing_recipes(id) ON DELETE SET NULL, snapshot JSONB NOT NULL, saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // One-time import of price assumptions from the provided workbook; don't overwrite later manual edits.
  for(const [name,unit,price] of defaults) await db.query("INSERT INTO costing_materials(name,unit,unit_price) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING",[name,unit,price]);
}
const number=(x:unknown,max=100000000)=>{const n=Number(x);if(!Number.isFinite(n)||n<0||n>max)throw Error("Укажите корректное неотрицательное число");return n;};
const fail=(error:unknown)=>error instanceof Error&&/корректное|название|Не найдено|не более|Некорректная/.test(error.message)?NextResponse.json({error:error.message},{status:400}):apiError(error);
export async function GET() {
 if(!await isAdmin())return NextResponse.json({error:"Требуется вход"},{status:401});
 try{await prepare();const db=getPool();const [m,r,h,p]=await Promise.all([
 db.query("SELECT id,name,unit,unit_price::float8 AS price FROM costing_materials ORDER BY id"),
 db.query("SELECT id,name,product_id,markup_pct::float8 AS markup_pct,sale_price::float8 AS sale_price,items,note,updated_at FROM costing_recipes ORDER BY updated_at DESC,id DESC"),
 db.query("SELECT id,recipe_id,snapshot,saved_at FROM costing_history ORDER BY id DESC LIMIT 50"),
 db.query("SELECT id,name,price FROM products WHERE NOT archived ORDER BY name,id")]);
 return NextResponse.json({materials:m.rows,recipes:r.rows,history:h.rows,products:p.rows});}catch(e){return apiError(e);}
}
export async function POST(request:Request) {
 if(!await isAdmin())return NextResponse.json({error:"Требуется вход"},{status:401});
 try{
  await prepare();const body=await request.json();const db=getPool();
  if(body.action==="material"){
    const name=String(body.name??"").trim().slice(0,160),unit=String(body.unit??"").trim().slice(0,32);
    if(!name||!unit)throw Error("Укажите название материала и единицу");
    const price=number(body.price),id=Number(body.id);
    if(Number.isSafeInteger(id)&&id>0)await db.query("UPDATE costing_materials SET name=$1,unit=$2,unit_price=$3,updated_at=NOW() WHERE id=$4",[name,unit,price,id]);
    else await db.query("INSERT INTO costing_materials(name,unit,unit_price) VALUES($1,$2,$3)",[name,unit,price]);
  }else if(body.action==="recipe"){
    const name=String(body.name??"").trim().slice(0,160);if(!name)throw Error("Укажите название расчёта");
    const items=body.items;if(!items||typeof items!=="object"||Array.isArray(items)||Object.keys(items).length>150)throw Error("Некорректная рецептура");
    const materials=(await db.query("SELECT id,unit_price::float8 AS price,name,unit FROM costing_materials")).rows;
    const valid=new Set(materials.map(row=>String(row.id))),quantities:Record<string,number>={};
    for(const [key,value] of Object.entries(items)){if(!valid.has(key))throw Error("Некорректная рецептура");quantities[key]=number(value);}
    const markup=number(body.markup_pct,100000),sale=body.sale_price==null||body.sale_price===""?null:number(body.sale_price);
    const note=String(body.note??"").slice(0,2000);
    const productId=body.product_id==null||body.product_id===""?null:Number(body.product_id);
    if(productId!==null&&(!Number.isSafeInteger(productId)||!(await db.query("SELECT 1 FROM products WHERE id=$1 AND NOT archived",[productId])).rowCount))throw Error("Не найдено связанное изделие");
    const total=materials.reduce((s,m)=>s+(quantities[m.id]??0)*Number(m.price),0);
    const snapshot={name,items:materials.filter(m=>quantities[m.id]>0).map(m=>({name:m.name,unit:m.unit,quantity:quantities[m.id],unit_price:Number(m.price)})),total:Number(total.toFixed(2)),markup_pct:markup,sale_price:sale,recommended:Number((total*(1+markup/100)).toFixed(2)),profit:sale===null?null:Number((sale-total).toFixed(2)),margin:sale?Number(((sale-total)/sale*100).toFixed(2)):null,note};
    const id=Number(body.id);const client=await db.connect();
    try{await client.query("BEGIN");let actual;
      if(Number.isSafeInteger(id)&&id>0){const result=await client.query("UPDATE costing_recipes SET name=$1,product_id=$2,markup_pct=$3,sale_price=$4,items=$5::jsonb,note=$6,updated_at=NOW() WHERE id=$7 RETURNING id",[name,productId,markup,sale,JSON.stringify(quantities),note,id]);if(!result.rowCount)throw Error("Не найдено расчёта");actual=id;}
      else actual=Number((await client.query("INSERT INTO costing_recipes(name,product_id,markup_pct,sale_price,items,note) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING id",[name,productId,markup,sale,JSON.stringify(quantities),note])).rows[0].id);
      await client.query("INSERT INTO costing_history(recipe_id,snapshot) VALUES($1,$2::jsonb)",[actual,JSON.stringify(snapshot)]);
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }else if(body.action==="remove-recipe"){
    const id=Number(body.id);if(!Number.isSafeInteger(id)||id<1)throw Error("Некорректная запись");
    await db.query("DELETE FROM costing_recipes WHERE id=$1",[id]);
  }else throw Error("Некорректная операция");
  return NextResponse.json({ok:true});
 }catch(e){return fail(e);}
}
