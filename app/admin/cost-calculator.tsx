"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
type Material={id:number;name:string;unit:string;price:number};
type Recipe={id:number;name:string;product_id:number|null;markup_pct:number;sale_price:number|null;items:Record<string,number>;note:string};
type History={id:number;recipe_id:number|null;snapshot:{name:string;total:number;sale_price:number|null;items:{name:string;quantity:number;unit:string;unit_price:number}[]};saved_at:string};
type Product={id:number;name:string;price:number};
type Payload={materials:Material[];recipes:Recipe[];products:Product[];history:History[]};
const fmt=(n:number)=>n.toLocaleString("ru-RU",{maximumFractionDigits:2})+" ₽";
const empty:Recipe={id:0,name:"",product_id:null,markup_pct:100,sale_price:null,items:{},note:""};
export function CostCalculator(){
 const [data,setData]=useState<Payload>({materials:[],recipes:[],products:[],history:[]});
 const [draft,setDraft]=useState<Recipe>(empty);const [tab,setTab]=useState<"recipes"|"materials"|"history">("recipes");
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const res=await fetch("/api/admin/costing",{cache:"no-store"});const json=await res.json();if(!res.ok)throw Error(json.error||"Не загрузились расчёты");setData(json);},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 const total=useMemo(()=>data.materials.reduce((sum,m)=>sum+(draft.items[String(m.id)]||0)*Number(m.price),0),[data.materials,draft.items]);
 const recommended=total*(1+Number(draft.markup_pct||0)/100);
 const profit=draft.sale_price==null?null:Number(draft.sale_price)-total;
 const margin=profit===null||!draft.sale_price?null:100*profit/draft.sale_price;
 const breakdown=data.materials.map(m=>({...m,qty:draft.items[String(m.id)]||0,cost:(draft.items[String(m.id)]||0)*Number(m.price)})).sort((a,b)=>b.cost-a.cost);
 const save=async(body:unknown)=>{setBusy(true);setError("");try{const response=await fetch("/api/admin/costing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||"Не удалось сохранить");await load();if((body as {action:string}).action==="recipe")setDraft({...empty});}catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения");}finally{setBusy(false);}};
 const input=(value:number|null|undefined,onChange:(v:number)=>void,step="0.01")=><input type="number" min="0" step={step} value={value??""} onChange={e=>onChange(Number(e.target.value))}/>;
 return <div className="costing">
 <p className="admin-intro">Себестоимость по закупочным ценам материалов. Рецептуры, история пересчётов и прайс сохраняются в PostgreSQL. Изменение прайса пересчитывает актуальные цифры, а старые снимки остаются неизменными.</p>
 <div className="costing-tabs">{([["recipes","Калькулятор"],["materials","Прайс материалов"],["history","История"]] as const).map(([key,label])=><button key={key} className={tab===key?"selected":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
 {error&&<p className="editor-error" role="alert">{error}</p>}
 {tab==="materials"&&<div className="costing-materials"><header><h2>Материалы и закупочные цены</h2><p>Все значения за 1 грамм или 1 штуку. Сначала уточните реальные закупочные цены.</p></header>{data.materials.map(m=><MaterialRow key={m.id} material={m} onSave={value=>save({action:"material",...value})} disabled={busy}/>)}
 <MaterialRow key="new" material={{id:0,name:"",unit:"шт",price:0}} onSave={value=>save({action:"material",...value})} disabled={busy}/></div>}
 {tab==="recipes"&&<><div className="costing-recipes"><h2>Сохранённые расчёты</h2><button onClick={()=>setDraft({...empty})}>+ Новый расчёт</button>{data.recipes.length===0&&<p>Пока нет ни одного сохранённого расчёта.</p>}<div>{data.recipes.map(r=><button className={draft.id===r.id?"active":""} key={r.id} onClick={()=>setDraft({...r,items:{...r.items}})}><strong>{r.name}</strong><small>{data.products.find(p=>p.id===r.product_id)?.name??"Без привязки к каталогу"}</small></button>)}</div></div>
 <div className="costing-editor"><div className="costing-fields"><label>Название модели<input value={draft.name} maxLength={160} placeholder="Например, Тыква" onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Связать с товаром сайта<select value={draft.product_id??""} onChange={e=>{const product=data.products.find(p=>p.id===Number(e.target.value));setDraft({...draft,product_id:product?.id??null,...(product?{sale_price:product.price}:{})});}}><option value="">Без привязки</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name} · №{p.id}</option>)}</select></label></div>
 <h3>Расход материалов на одну свечу</h3><div className="costing-lines">{data.materials.map(m=><label key={m.id}><span>{m.name}<small>{fmt(Number(m.price))} / {m.unit}</small></span>{input(draft.items[String(m.id)]??0,v=>setDraft({...draft,items:{...draft.items,[m.id]:v}}))}<span>{m.unit}</span><strong>{fmt((draft.items[String(m.id)]||0)*Number(m.price))}</strong></label>)}</div>
 <div className="costing-fields"><label>Наценка, %{input(draft.markup_pct,v=>setDraft({...draft,markup_pct:v}))}</label><label>Фактическая цена продажи, ₽{input(draft.sale_price,v=>setDraft({...draft,sale_price:v}))}</label></div>
 <div className="costing-metrics"><article><span>Себестоимость</span><strong>{fmt(total)}</strong></article><article><span>Рекомендованная цена</span><strong>{fmt(recommended)}</strong></article><article><span>Прибыль с одной свечи</span><strong>{profit===null?"Не задана цена":fmt(profit)}</strong></article><article><span>Маржа</span><strong>{margin===null?"—":margin.toFixed(1)+"%"}</strong></article></div>
 {profit!==null&&profit<0&&<p className="editor-error">Продажа ниже себестоимости. Вы теряете {fmt(-profit)} на изделии.</p>}
 <h3>Структура затрат</h3><div className="costing-breakdown">{breakdown.filter(m=>m.cost>0).map(m=><div key={m.id}><span>{m.name}</span><div><i style={{width:total?m.cost/total*100+"%":"0%"}}/></div><strong>{fmt(m.cost)}</strong><small>{total?(100*m.cost/total).toFixed(1):"0"}%</small></div>)}{total===0&&<p>Укажите расход материалов, чтобы увидеть структуру затрат.</p>}</div>
 <label className="costing-note">Примечание<textarea rows={2} maxLength={2000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
 <div className="costing-actions"><button disabled={busy||!draft.name.trim()} onClick={()=>void save({action:"recipe",...draft})}>Сохранить расчёт и снимок</button>{draft.id>0&&<button className="danger" disabled={busy} onClick={()=>{if(confirm("Удалить текущий расчёт? История его изменений сохранится."))void save({action:"remove-recipe",id:draft.id}).then(()=>setDraft({...empty}));}}>Удалить расчёт</button>}</div>
 <p className="costing-disclaimer">Расчёт пока не включает труд, налоги, комиссию эквайринга и доставку, если они отдельно не внесены в «Доп. расходы». Это прибыль до неучтённых затрат, а не чистая прибыль.</p>
 </div></>}
 {tab==="history"&&<div className="costing-history"><h2>История сохранённых себестоимостей</h2>{data.history.length===0&&<p>История появится после сохранения первого расчёта.</p>}{data.history.map(h=><article key={h.id}><span>{new Date(h.saved_at).toLocaleString("ru-RU")}</span><strong>{h.snapshot.name}</strong><span>{fmt(h.snapshot.total)} себестоимость</span><details><summary>Показать состав</summary>{h.snapshot.items.map((m,i)=><p key={i}>{m.name}: {m.quantity} {m.unit} × {fmt(m.unit_price)}</p>)}</details></article>)}</div>}
 </div>;
}
function MaterialRow({material,onSave,disabled}:{material:Material;onSave:(m:Material)=>void;disabled:boolean}){
 const [draft,setDraft]=useState(material);
 return <div className="costing-material-row"><input aria-label="Материал" value={draft.name} placeholder="Новый материал" onChange={e=>setDraft({...draft,name:e.target.value})}/><input aria-label="Единица" value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}/><input aria-label="Цена за единицу" type="number" min="0" step="0.0001" value={draft.price} onChange={e=>setDraft({...draft,price:Number(e.target.value)})}/><button disabled={disabled||!draft.name.trim()} onClick={()=>onSave(draft)}>Сохранить</button></div>;
}
