import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

// DOM component tests: exercise React effects and clicks without a browser or a live store.
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://test.local'});
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','FormData']) globalThis[key]=dom.window[key];
globalThis.self=dom.window;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=query=>({matches:query.includes("prefers-reduced-motion: reduce"),addEventListener(){},removeEventListener(){}});
// Decode downloaded portrait replacements before React starts their transition.
window.Image=class { set src(value){this.url=value;queueMicrotask(()=>this.onload?.());} decode(){return Promise.resolve();} };
window.HTMLCanvasElement.prototype.getContext=()=>null;
window.scrollTo=()=>{};
const {createRoot}=await import('react-dom/client');
const rootDir=path.resolve(import.meta.dirname,'..');
const temp=mkdtempSync(path.join(tmpdir(),'tixo-ui-'));
writeFileSync(path.join(temp,'package.json'),'{"type":"commonjs"}');
symlinkSync(path.join(rootDir,'node_modules'),path.join(temp,'node_modules'),'dir');
for(const file of ['lib/use-product-swipe.ts','lib/use-mobile-layout.ts','lib/section-scroll.ts','app/components/mobile-section-stack.tsx','lib/aroma-portraits.ts','lib/atelier.ts','lib/catalog.ts','app/page.tsx','app/admin/page.tsx','app/admin/editors.tsx','app/components/ui-icon.tsx','app/components/modal.tsx','app/components/candle-preview.tsx','app/components/product-card.tsx','app/components/atelier.tsx','app/components/workshop-scene.tsx','app/components/living-flame.tsx','app/components/evening-ritual.tsx','app/components/section-navigation.tsx','app/components/scent-portrait.tsx','app/components/storefront-commerce.tsx']) {
  const target=path.join(temp,file.replace(/\.tsx?$/,'.js'));
  mkdirSync(path.dirname(target),{recursive:true});
  const source=readFileSync(path.join(rootDir,file),'utf8').replace(/^import ".*\.css";$/gm,'').replace(/"@\/lib\/([\w-]+)"/g,(_,name)=>JSON.stringify(path.join(temp,`lib/${name}.js`)));
  writeFileSync(target,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
}
const require=createRequire(path.join(temp,'test.cjs'));
const Home=require('./app/page.js').default;
const Admin=require('./app/admin/page.js').default;
after(()=>{dom.window.close();rmSync(temp,{recursive:true,force:true});});
const scents=[['Вишня и миндаль','#b82035','Красный'],['Сандал и дым','#222225','Чёрный'],['Белая ваниль','#f7f5ef','Белый'],['Роза и пион','#e7a0b5','Розовый']].map(([name,color,colorName],i)=>({id:i+1,name,color,colorName,notes:['нота'],description:'Описание',active:true}));
const colors=scents.map(s=>({id:s.id,name:s.colorName,hex:s.color,active:true}));
const forms=[{id:1,name:'Спираль',shape:'twist',active:true},{id:2,name:'Ракушка',shape:'shell',active:true}];
const products=['Спираль','Ракушка'].map((name,i)=>({id:i+1,name,shape:i?'shell':'twist',notes:'Форма',price:1500,stock:3,published:true,image:null,hasVariants:false,variants:[]}));
const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}));
const button=(name)=>[...document.querySelectorAll('.catalog-filter-panel button'),...document.querySelectorAll('button')].find(node=>node.textContent.includes(name));
const click=async node=>{assert.ok(node);await act(async()=>node.click());};
const setValue=async(node,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};

test('color and aroma filters intersect independently and checkout keeps every combination',async()=>{
  window.localStorage.clear(); let sent;
  globalThis.fetch=async(url,init={})=>url==='/api/products'?response(products):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/orders'?(sent=JSON.parse(init.body),response({orderNumber:'T-COLORS',total:4500,quotePending:false},201)):response({});
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelectorAll('.catalog-filter-trigger').length,3);assert.equal(document.querySelector('.catalog-filter-panel'),null);
    assert.equal(document.querySelectorAll('.product-card').length,8);
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Красный"]'));
    assert.equal(document.querySelectorAll('.product-card').length,2);
    const silhouette=document.querySelector('.product-image .wax-stage').getAttribute('style');
    await click(document.querySelector('#filter-scent'));await click(button('Сандал и дым'));
    assert.equal(document.querySelector('.product-image .wax-stage').getAttribute('style'),silhouette);
    assert.ok([...document.querySelectorAll('.product-card')].every(node=>node.dataset.colorId==='1' && node.dataset.scentId==='2'));
    await click(document.querySelector('.quick-add'));
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Чёрный"]'));
    assert.match(document.querySelector('#filter-scent').textContent,/Сандал и дым/);
    await click(document.querySelector('.quick-add'));
    await click(document.querySelector('#filter-scent'));await click(button('Белая ваниль'));
    await click(document.querySelector('.quick-add'));
    await click(document.querySelector('#filter-scent'));await click(button('Вишня и миндаль'));
    await click(document.querySelector('.quick-add')); // The same form has only three units, across all combinations.
    await click(document.querySelector('.cart-trigger'));
    assert.equal(document.querySelectorAll('.cart-item').length,3);
    assert.match(document.querySelector('.cart-items').textContent,/Красный/);
    assert.match(document.querySelector('.cart-items').textContent,/Чёрный/);
    const form=document.querySelector('#checkout-form');
    for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Адрес'}))form.elements.namedItem(name).value=value;
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.deepEqual(sent.items.map(i=>i.colorId),[1,2,2]);
    assert.deepEqual(sent.items.map(i=>i.scentId),[2,2,3]);
    assert.match(document.querySelector('.order-success').textContent,/T-COLORS/);
  } finally {await act(async()=>root.unmount());}
});

test('unavailable filter combinations show an empty state and can be reset',async()=>{
  window.localStorage.clear();
  const product={...products[0],hasVariants:true,variants:[{id:1,scentId:1,colorId:1,stock:2,active:true,image:null,scent:scents[0],color:colors[0]},{id:2,scentId:2,colorId:2,stock:2,active:true,image:null,scent:scents[1],color:colors[1]}]};
  globalThis.fetch=async url=>url==='/api/products'?response([product]):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):response({});
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Home)));
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Красный"]'));await click(document.querySelector('#filter-scent'));await click(button('Сандал и дым'));
    assert.equal(document.querySelectorAll('.product-card').length,0);
    assert.match(document.querySelector('.catalog-message').textContent,/пока нет/);
    await click(button('Показать всю коллекцию'));
    assert.equal(document.querySelectorAll('.product-card').length,2);
  } finally {await act(async()=>root.unmount());}
});

test('custom recipe snapshots survive edits and checkout retries reuse the same request',async()=>{
  window.localStorage.clear();
  const sent=[];
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/products')return response(products);
    if(url==='/api/scents')return response(scents);
    if(url==='/api/colors')return response(colors);
    if(url==='/api/forms')return response(forms);
    if(url==='/api/orders'){
      sent.push(JSON.parse(init.body));
      return sent.length===1?response({error:'retry'},503):response({orderNumber:'T-TEST',total:0,quotePending:true},201);
    }
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Home)));
    await click(document.querySelector('#studio-step-3'));
    await click(document.querySelector('#add-custom'));
    await click(document.querySelector('#studio-step-2'));
    await click(document.querySelector('input[name="candle-color"][value="2"]'));
    await click(document.querySelector('#studio-step-3'));
    await click(document.querySelector('#add-custom'));
    await click(document.querySelector('.cart-trigger'));
    const cart=document.querySelector('.cart-items').textContent;
    assert.match(cart,/Красный/);assert.match(cart,/Чёрный/);
    assert.equal(document.querySelectorAll('.cart-item').length,2);
    const form=document.querySelector('#checkout-form');
    for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Тестовый адрес'}))form.elements.namedItem(name).value=value;
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(sent.length,1);
    assert.match(document.querySelector('.pending-order').textContent,/Повторить отправку/);
    await click(button('Повторить отправку'));
    assert.deepEqual(sent[1],sent[0]);
    assert.deepEqual(sent[0].items.map(item=>item.customRecipe.colorId),[1,2]);
    assert.match(document.querySelector('.order-success').textContent,/T-TEST/);
    assert.match(document.querySelector('.order-success').textContent,/мастер согласует/);
    assert.equal(document.querySelector('.cart-count').textContent,'(00)');
  } finally {await act(async()=>root.unmount());}
});

test('admin stays authenticated if orders fail; scents still load, edit and save without resetting login',async()=>{
  let edited; let editedColor; let brokenOrders=true;
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/admin/session') return response({authenticated:true});
    if(url==='/api/products?admin=1') return response(products);
    if(url==='/api/forms?admin=1') return response(forms);
    if(url==='/api/scents?admin=1') return response(edited?[edited,...scents.slice(1)]:scents);
    if(url==='/api/scents/1' && init.method==='PATCH') {edited=JSON.parse(init.body);return response(edited);}
    if(url==='/api/colors?admin=1') return response(editedColor?[editedColor,...colors.slice(1)]:colors);
    if(url==='/api/colors/1' && init.method==='PATCH') {editedColor=JSON.parse(init.body);return response(editedColor);}
    if(url==='/api/orders') return brokenOrders?response({error:'Временная ошибка заказов'},500):response([]);
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Admin)));
    assert.ok(document.querySelector('.admin-shell'));assert.equal(document.querySelector('.login-card'),null);
    await click(button('Заказы'));
    assert.match(document.querySelector('[role=alert]').textContent,/Временная ошибка/);
    await click(button('Ароматы'));
    assert.equal(document.querySelectorAll('.scent-admin-card').length,4);
    await click(document.querySelector('.scent-admin-card footer button'));
    assert.equal(document.querySelector('.scent-editor input[type=color]'),null);
    await setValue(document.querySelector('input[placeholder="Например, Вишня и миндаль"]'),'Моя вишня');
    await act(async()=>document.querySelector('.scent-editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(edited.name,'Моя вишня');assert.ok(document.querySelector('.admin-shell'));
    assert.equal(document.querySelector('[role=dialog]'),null);
    assert.match(document.querySelector('.scent-admin-card h2').textContent,/Моя вишня/);
    await click(button('Цвета'));
    await click(document.querySelector('.scent-admin-card footer button'));
    await setValue(document.querySelector('input[placeholder="Например, Слоновая кость"]'),'Гранат');
    await act(async()=>document.querySelector('.color-editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(editedColor.name,'Гранат');assert.equal(edited.name,'Моя вишня');
    brokenOrders=false;
    await click(button('Заказы'));await click(button('Обновить данные'));
    assert.equal(document.querySelector('[role=alert]'),null);
    await click(button('Остатки'));await click(button('Добавить свечу'));
    assert.equal(document.querySelectorAll('.candle-selects select').length,3);
    assert.equal(document.querySelector('.stock-details'),null);
  } finally {await act(async()=>root.unmount());}
});

const selectValue=async(node,value)=>{assert.ok(node);await act(async()=>{node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));});};
const submit=async form=>{assert.ok(form);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));};

test('inventory uses separate dropdowns for create/edit, quick stock updates and independent form catalog',async()=>{
  let saved;let stockBody;let addedForm;
  let candles=[{...products[0],formId:1,colorId:1,scentId:2,form:forms[0],color:colors[0],scent:scents[1]}];
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/admin/session')return response({authenticated:true});
    if(url==='/api/products?admin=1')return response(candles);
    if(url==='/api/forms?admin=1')return response(addedForm?[...forms,addedForm]:forms);
    if(url==='/api/colors?admin=1')return response(colors);
    if(url==='/api/scents?admin=1')return response(scents);
    if(url==='/api/orders')return response([]);
    if(url==='/api/forms'&&init.method==='POST'){addedForm={...Object.fromEntries(init.body.entries()),active:init.body.get('active')==='true',shape:null,id:3};return response(addedForm,201);}
    if((url==='/api/products/1'||url==='/api/products')&&['PATCH','POST'].includes(init.method)){saved=init.body;return response(candles[0]);}
    if(url==='/api/products/1/stock'){stockBody=JSON.parse(init.body);candles=[{...candles[0],stock:stockBody.stock}];return response(candles[0]);}
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Admin)));
    assert.match(document.querySelector('.inventory-table').textContent,/Красный/);assert.match(document.querySelector('.inventory-table').textContent,/Сандал и дым/);
    await click(document.querySelector('[aria-label="Редактировать свечу № 1"]'));
    let selects=[...document.querySelectorAll('.candle-selects select')];
    assert.deepEqual(selects.map(s=>s.value),['1','1','2']);
    await selectValue(selects[0],2);await selectValue(selects[1],3);await selectValue(selects[2],1);
    await submit(document.querySelector('.product-editor form'));
    assert.equal(saved.get('formId'),'2');assert.equal(saved.get('colorId'),'3');assert.equal(saved.get('scentId'),'1');assert.equal(saved.get('expectedStock'),'3');
    assert.equal(saved.has('variants'),false);
    await click(document.querySelector('[aria-label="Изменить остаток свечи № 1"]'));
    await setValue(document.querySelector('.stock-editor input[type=number]'),'7');
    await submit(document.querySelector('.stock-editor form'));
    assert.deepEqual(stockBody,{stock:7,expectedStock:3});assert.match(document.querySelector('.stock-button').textContent,/7/);
    await click(button('Формы'));await click(button('Добавить форму'));
    await setValue(document.querySelector('input[placeholder="Например, Колонна"]'),'Своя форма');
    await submit(document.querySelector('.product-editor form'));assert.equal(addedForm.name,'Своя форма');
    await click(button('Остатки'));await click(button('Добавить свечу'));
    selects=[...document.querySelectorAll('.candle-selects select')];assert.deepEqual(selects.map(s=>s.value),['','','']);
    assert.ok([...selects[0].options].some(option=>option.textContent==='Своя форма'));
    assert.equal(button('Сохранить свечу').disabled,true);
    await selectValue(selects[0],3);await selectValue(selects[1],2);await selectValue(selects[2],4);
    await submit(document.querySelector('.product-editor form'));
    assert.equal(saved.get('formId'),'3');assert.equal(saved.get('colorId'),'2');assert.equal(saved.get('scentId'),'4');
  }finally{await act(async()=>root.unmount());}
});

test('configured candles show one real combination and the merged aroma block uses authored chapters even without a photo',async()=>{
  window.localStorage.clear();
  const profile={top:{notes:'Лимон',description:'Яркое начало'},heart:{notes:'Инжир',description:'Мягкое сердце'},base:{notes:'Сандал',description:'Тёплый шлейф'}};
  const profiles=scents.map(scent=>({...scent,profile}));
  const candles=[{...products[0],formId:1,colorId:1,scentId:2,form:forms[0],color:colors[0],scent:profiles[1]}];
  globalThis.fetch=async url=>url==='/api/products'?response(candles):url==='/api/scents'?response(profiles):url==='/api/colors'?response(colors):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelectorAll('.product-card').length,1);
    assert.match(document.querySelector('.product-category').textContent,/Сандал и дым/);
    await click(document.querySelector('.product-image'));
    assert.equal(document.querySelector('#detail-scent'),null);
    assert.equal(document.querySelector('.detail-colors'),null);
    assert.match(document.querySelector('.detail-specs').textContent,/Сандал и дым/);
    assert.match(document.querySelector('.detail-specs').textContent,/Красный/);
    await click(document.querySelector('[aria-label="Закрыть карточку свечи"]'));
    assert.equal(document.querySelector('#ritual'),null);
    assert.equal(document.querySelectorAll('.scent-name-list button').length,4);
    await click(document.querySelector('[aria-label="Познакомиться с ароматом Сандал и дым"]'));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('.scent-portrait-caption').textContent,/Яркое начало/);
    assert.equal(document.querySelector('.note-mobile-description').textContent,'Яркое начало');
    assert.equal(document.querySelector('.scent-library-selection'),null);
    await click(document.querySelector('#note-tab-1'));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('.scent-portrait-caption').textContent,/Мягкое сердце/);
    assert.equal(document.querySelector('.note-mobile-description').textContent,'Мягкое сердце');
    await click(document.querySelector('#note-tab-2'));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('.scent-portrait-caption').textContent,/Тёплый шлейф/);
    assert.equal(document.querySelector('.note-mobile-description').textContent,'Тёплый шлейф');
    assert.ok(document.querySelector('#aromas #note-panel'));
    assert.match(document.querySelector('.scent-portrait-missing').textContent,/Портрет аромата/);
    await click(document.querySelector('[aria-label="Познакомиться с ароматом Вишня и миндаль"]'));
    assert.equal(document.querySelector('#note-tab-0').getAttribute('aria-selected'),'true');
    assert.doesNotMatch(document.querySelector('.scent-portrait-caption').textContent,/Тёплый шлейф/);
    await click(document.querySelector('[aria-label="Познакомиться с ароматом Сандал и дым"]'));
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Чёрный"]'));
    assert.equal(document.querySelectorAll('.product-card').length,0);
  }finally{await act(async()=>root.unmount());}
});

test('admin edits three chapters separately from basic scent properties',async()=>{
  let sent;
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/admin/session')return response({authenticated:true});
    if(url==='/api/scents?admin=1')return response(scents);
    if(url==='/api/products?admin=1'||url==='/api/orders')return response([]);
    if(url==='/api/forms?admin=1')return response(forms);
    if(url==='/api/colors?admin=1')return response(colors);
    if(url==='/api/scents/2/profile'){sent=JSON.parse(init.body);return response({...scents[1],profile:sent});}
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));
    await click(button('Искусство аромата'));await selectValue(document.querySelector('#admin-aroma'),2);
    const chapters=[...document.querySelectorAll('.aroma-chapter')];assert.equal(chapters.length,3);
    for(const [index,chapter] of chapters.entries())await setValue(chapter.querySelector('input'),['Лимон','Инжир','Сандал'][index]);
    await submit(document.querySelector('.aroma-profile-editor'));
    assert.deepEqual(Object.keys(sent),['top','heart','base']);assert.equal(sent.heart.notes,'Инжир');
  }finally{await act(async()=>root.unmount());}
});

test('uploaded form is the colored fallback in gallery, detail and cart; a candle photograph takes priority',async()=>{
  window.localStorage.clear();
  const form={id:10,name:'Моя ракушка',shape:null,silhouette:'/api/uploads/shell.png',active:true};
  const candle={...products[0],formId:10,form,colorId:1,scentId:1,color:colors[0],scent:scents[0]};
  globalThis.fetch=async url=>url==='/api/products'?response([candle,{...candle,id:20,image:'/api/uploads/candle.webp'}]):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    const cards=[...document.querySelectorAll('.product-card')];assert.equal(cards.length,2);
    assert.equal(cards[0].querySelector('img'),null);
    assert.match(cards[0].querySelector('.wax-uploaded').getAttribute('style'),/shell\.png/);
    assert.equal(cards[0].querySelector('.wax-uploaded').style.getPropertyValue('--wax'),'#b82035');
    assert.equal(cards[1].querySelector('img').getAttribute('src'),'/api/uploads/candle.webp');assert.equal(cards[1].querySelector('.wax-stage'),null);
    await click(cards[0].querySelector('.product-image'));
    assert.ok(document.querySelector('.detail-photo .wax-uploaded'));assert.equal(document.querySelector('.detail-photo img'),null);
    await click(button('Добавить в корзину'));await click(document.querySelector('.cart-trigger'));
    assert.match(document.querySelector('.cart-item .wax-uploaded').getAttribute('style'),/shell\.png/);
  }finally{await act(async()=>root.unmount());}
});

test('form editor uploads the named silhouette and candle photo removal previews the selected form',async()=>{
  let sent;let edited;
  const form={id:1,name:'Моя форма',shape:null,silhouette:'/api/uploads/my-form.png',active:true};
  const candle={...products[0],formId:1,form,colorId:2,scentId:1,color:colors[1],scent:scents[0],image:'/api/uploads/real-photo.webp'};
  const previousCreate=URL.createObjectURL;const previousRevoke=URL.revokeObjectURL;
  URL.createObjectURL=()=> 'blob:test-silhouette';URL.revokeObjectURL=()=>{};
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/admin/session')return response({authenticated:true});
    if(url==='/api/forms?admin=1')return response([form]);
    if(url==='/api/products?admin=1')return response([candle]);
    if(url==='/api/scents?admin=1')return response(scents);
    if(url==='/api/colors?admin=1')return response(colors);
    if(url==='/api/orders')return response([]);
    if(url==='/api/forms/1'){sent=init.body;return response(form);}
    if(url==='/api/products/1'){edited=init.body;return response(candle);}
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));
    await click(button('Формы'));await click(document.querySelector('.scent-admin-card footer button'));
    assert.equal(document.querySelector('.form-editor select'),null);
    await setValue(document.querySelector('input[placeholder="Например, Колонна"]'),'Свой силуэт');
    const file=new dom.window.File(['png'],'my-form.png',{type:'image/png'});
    const input=document.querySelector('[aria-label="Загрузить силуэт"]');Object.defineProperty(input,'files',{value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    assert.match(document.querySelector('.silhouette-preview .wax-uploaded').getAttribute('style'),/blob:test-silhouette/);
    await submit(document.querySelector('.form-editor form'));
    assert.equal(sent.get('name'),'Свой силуэт');assert.equal(sent.get('silhouette').name,'my-form.png');assert.equal(sent.has('shape'),false);
    await click(button('Остатки'));await click(document.querySelector('[aria-label="Редактировать свечу № 1"]'));
    assert.equal(document.querySelector('.editor-photo img').getAttribute('src'),candle.image);
    await click(button('Убрать фото'));
    assert.equal(document.querySelector('.editor-photo img'),null);
    assert.match(document.querySelector('.candle-editor-silhouette .wax-uploaded').getAttribute('style'),/my-form\.png/);
    assert.equal(document.querySelector('.candle-editor-silhouette .wax-uploaded').style.getPropertyValue('--wax'),'#222225');
    await submit(document.querySelector('.product-editor form'));assert.equal(edited.get('photos'),'[]');
  }finally{await act(async()=>root.unmount());URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});

test('workshop uses active catalog forms and carries their silhouettes through color changes, cart and checkout',async()=>{
  window.localStorage.clear();let sent;
  const palette=[{id:21,name:'Наша ракушка',shape:null,silhouette:'/api/uploads/our-shell.png',active:true},{id:22,name:'Наш куб',shape:null,silhouette:'/api/uploads/our-cube.png',active:true},{id:23,name:'Скрытая форма',shape:'twist',active:false}];
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/forms')return response(palette);
    if(url==='/api/products')return response([]);
    if(url==='/api/scents')return response(scents);
    if(url==='/api/colors')return response(colors);
    if(url==='/api/orders'){sent=JSON.parse(init.body);return response({orderNumber:'T-FORMS',total:0,quotePending:true},201);}
    return response({});
  };
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelectorAll('input[name="candle-shape"]').length,2);
    assert.match(document.querySelector('.shape-options').textContent,/Наша ракушка/);assert.doesNotMatch(document.querySelector('.shape-options').textContent,/Скрытая форма|Гладкая колонна/);
    assert.equal(document.querySelector('#studio-candle').dataset.formId,'21');
    assert.match(document.querySelector('#studio-candle .wax-uploaded').getAttribute('style'),/our-shell\.png/);
    await click(document.querySelector('#studio-step-2'));await click(document.querySelector('input[name="candle-color"][value="2"]'));
    assert.equal(document.querySelector('#studio-candle .wax-uploaded').style.getPropertyValue('--wax'),'#222225');
    await click(document.querySelector('#studio-step-3'));await click(document.querySelector('#add-custom'));
    await click(document.querySelector('#studio-step-1'));await click(document.querySelector('input[name="candle-shape"][value="22"]'));
    assert.match(document.querySelector('#scene-form').textContent,/Наш куб/);
    assert.match(document.querySelector('#studio-candle .wax-uploaded').getAttribute('style'),/our-cube\.png/);
    await click(document.querySelector('#studio-step-3'));await click(document.querySelector('#add-custom'));
    await click(document.querySelector('.cart-trigger'));
    assert.equal(document.querySelectorAll('.cart-item.custom').length,2);
    assert.match(document.querySelector('.cart-items').textContent,/Наша ракушка/);assert.match(document.querySelector('.cart-items').textContent,/Наш куб/);
    const masks=[...document.querySelectorAll('.cart-custom-preview .wax-uploaded')];assert.equal(masks.length,2);assert.match(masks[0].getAttribute('style'),/our-shell\.png/);assert.match(masks[1].getAttribute('style'),/our-cube\.png/);
    const checkout=document.querySelector('#checkout-form');for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Адрес'}))checkout.elements.namedItem(name).value=value;
    await submit(checkout);
    assert.deepEqual(sent.items.map(line=>line.customRecipe.formId),[21,22]);assert.ok(sent.items.every(line=>!Object.hasOwn(line.customRecipe,'shape')));assert.match(document.querySelector('.order-success').textContent,/T-FORMS/);
  }finally{await act(async()=>root.unmount());}
});

test('workshop handles failed and empty catalogs and blocks a saved cart form that has been disabled',async()=>{
  window.localStorage.clear();let mode='error';let orderCalls=0;
  globalThis.fetch=async(url)=>{
    if(url==='/api/forms')return mode==='error'?response({error:'offline'},503):response(mode==='empty'?[]:[{id:31,name:'Уже отключена',shape:'ribbed',active:false}]);
    if(url==='/api/products')return response(products);
    if(url==='/api/scents')return response(scents);
    if(url==='/api/colors')return response(colors);
    if(url==='/api/orders'){orderCalls++;return response({});}
    return response({});
  };
  let root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.match(document.querySelector('#studio [role=alert]').textContent,/Не удалось загрузить формы/);assert.equal(document.querySelector('#add-custom').disabled,true);assert.equal(document.querySelectorAll('.product-card').length,8);
    mode='empty';await click(document.querySelector('#studio .builder-form-message button'));
    assert.match(document.querySelector('#studio-panel-1').textContent,/готовит новые формы/);assert.equal(document.querySelector('#studio [role=alert]'),null);assert.equal(document.querySelector('#add-custom').disabled,true);
  }finally{await act(async()=>root.unmount());}
  window.localStorage.setItem('tixo.atelier.cart.v1',JSON.stringify([{customRecipe:{formId:31,color:'ivory',top:'bergamot',heart:'honey',base:'tonka'},formName:'Моя форма',silhouette:'/api/uploads/old-form.png',quantity:1}]));mode='disabled';root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));await click(document.querySelector('.cart-trigger'));
    assert.match(document.querySelector('.cart-items').textContent,/Моя форма/);assert.match(document.querySelector('.cart-items').textContent,/Форма больше недоступна/);
    assert.equal(document.querySelector('#checkout-form button[type=submit]').disabled,true);assert.equal(orderCalls,0);
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('admin order uses the saved builder form name and silhouette even when the live form no longer exists',async()=>{
  const recipe={formId:61,color:'red',top:'lemon',heart:'fig',base:'oud'};
  globalThis.fetch=async url=>url==='/api/admin/session'?response({authenticated:true}):url==='/api/orders'?response([{id:77,orderNumber:'T-SNAPSHOT',customerName:'Тест',phone:'+79990000000',email:'test@example.com',address:'Адрес',delivery:'Самовывоз',comment:'',items:[{productId:0,name:'Авторская свеча · Старое название формы',formName:'Старое название формы',silhouette:'/api/uploads/historical-form.png',color:'#6d2636',customRecipe:recipe,price:0,quantity:1,quotePending:true}],total:0,status:'new',createdAt:'2026-09-23T00:00:00.000Z',stockReserved:false}]):url==='/api/content'?response({}):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));await click(button('Заказы'));
    assert.match(document.querySelector('.order-recipe').textContent,/Старое название формы/);assert.doesNotMatch(document.querySelector('.order-recipe').textContent,/undefined/);
    assert.match(document.querySelector('.order-candle-preview .wax-uploaded').getAttribute('style'),/historical-form\.png/);
  }finally{await act(async()=>root.unmount());}
});

test('builder chooses catalog aromas and displays their authored chapters without mixing individual notes',async()=>{
  window.localStorage.clear();let sent;
  const profile={top:{notes:'Цедра',description:'Свежий старт'},heart:{notes:'Тёмный чай',description:'Глубокое сердце'},base:{notes:'Кедр',description:'Древесное послевкусие'}};
  const aromas=[{...scents[0],profile},{...scents[1],profile:{...profile,heart:{notes:'Сандал',description:'Тёплое дерево'}}},{...scents[2],active:false}];
  globalThis.fetch=async(url,init={})=>url==='/api/forms'?response(forms):url==='/api/products'?response([]):url==='/api/scents'?response(aromas):url==='/api/colors'?response(colors):url==='/api/orders'?(sent=JSON.parse(init.body),response({orderNumber:'T-AROMAS',total:0,quotePending:true},201)):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    await click(document.querySelector('#studio-step-0'));
    assert.equal(document.querySelectorAll('input[name="recipe-scent"]').length,2);assert.equal(document.querySelector('input[name="recipe-top"]'),null);
    assert.match(document.querySelector('.builder-aroma').textContent,/Цедра/);assert.match(document.querySelector('.builder-aroma').textContent,/Древесное послевкусие/);
    await click(document.querySelector('#studio-step-3'));await click(document.querySelector('#add-custom'));
    await click(document.querySelector('#studio-step-0'));await click(document.querySelector('input[name="recipe-scent"][value="2"]'));
    assert.match(document.querySelector('.builder-aroma').textContent,/Тёплое дерево/);assert.doesNotMatch(document.querySelector('.builder-aroma').textContent,/Глубокое сердце/);
    await click(document.querySelector('#studio-step-3'));assert.match(document.querySelector('#recipe-summary').textContent,/Сандал и дым/);await click(document.querySelector('#add-custom'));
    await click(document.querySelector('.cart-trigger'));assert.equal(document.querySelectorAll('.cart-item.custom').length,2);
    assert.match(document.querySelector('.cart-items').textContent,/Вишня и миндаль/);assert.match(document.querySelector('.cart-items').textContent,/Сандал и дым/);
    const form=document.querySelector('#checkout-form');for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Адрес'}))form.elements.namedItem(name).value=value;
    await submit(form);assert.deepEqual(sent.items.map(item=>item.customRecipe),[{formId:1,color:'ivory',colorId:1,scentId:1},{formId:1,color:'ivory',colorId:1,scentId:2}]);
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('disabled saved aroma blocks checkout and empty aroma catalog blocks the builder',async()=>{
  window.localStorage.clear();window.localStorage.setItem('tixo.atelier.cart.v1',JSON.stringify([{customRecipe:{formId:1,color:'ivory',scentId:1},formName:'Спираль',scentName:'Старый аромат',quantity:1}]));
  globalThis.fetch=async url=>url==='/api/forms'?response(forms):url==='/api/scents'?response([{...scents[0],active:false}]):url==='/api/colors'?response(colors):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));assert.equal(document.querySelector('#add-custom').disabled,true);assert.match(document.querySelector('#studio-panel-0').textContent,/готовит новые ароматы/);
    await click(document.querySelector('.cart-trigger'));assert.match(document.querySelector('.cart-items').textContent,/Старый аромат/);assert.match(document.querySelector('.stock-error').textContent,/аромат больше недоступны/);assert.equal(document.querySelector('#checkout-form button[type=submit]').disabled,true);
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('aroma editor saves three chapters in the same settings as the scent name',async()=>{
  let saved;
  globalThis.fetch=async(url,init={})=>url==='/api/admin/session'?response({authenticated:true}):url==='/api/scents?admin=1'?response(scents):url==='/api/scents/1'?(saved=JSON.parse(init.body),response(saved)):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));await click(button('Ароматы'));await click(document.querySelector('.scent-admin-card footer button'));
    const chapters=[...document.querySelectorAll('.scent-editor .aroma-chapter')];assert.equal(chapters.length,3);
    for(const [index,chapter] of chapters.entries()){
      await setValue(chapter.querySelector('input'),['Цедра','Чай','Дерево'][index]);
      const textarea=chapter.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,['Первое','Второе','Третье'][index]);textarea.dispatchEvent(new Event('input',{bubbles:true}));});
    }
    await submit(document.querySelector('.scent-editor form'));assert.equal(saved.profile.heart.notes,'Чай');assert.equal(saved.profile.base.description,'Третье');assert.equal(saved.name,scents[0].name);
  }finally{await act(async()=>root.unmount());}
});

test('admin appends photos, selects a new cover and removes individual photos while preserving upload order',async()=>{
  let saved;const candle={...products[0],formId:1,colorId:1,scentId:1,form:forms[0],color:colors[0],scent:scents[0],image:'/old.png',images:['/old.png']};
  const previousCreate=URL.createObjectURL;const previousRevoke=URL.revokeObjectURL;URL.createObjectURL=file=>`blob:${file.name}`;URL.revokeObjectURL=()=>{};
  globalThis.fetch=async(url,init={})=>url==='/api/admin/session'?response({authenticated:true}):url==='/api/products?admin=1'?response([candle]):url==='/api/forms?admin=1'?response(forms):url==='/api/scents?admin=1'?response(scents):url==='/api/colors?admin=1'?response(colors):url==='/api/products/1'?(saved=init.body,response(candle)):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));await click(document.querySelector('[aria-label="Редактировать свечу № 1"]'));
    const input=document.querySelector('[aria-label="Фотографии свечи"]');assert.equal(input.multiple,true);Object.defineProperty(input,'files',{value:[new dom.window.File(['a'],'a.png',{type:'image/png'}),new dom.window.File(['b'],'b.png',{type:'image/png'})]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));assert.equal(document.querySelectorAll('.editor-photo').length,3);
    await click(document.querySelectorAll('.editor-photo')[2].querySelector('button'));
    assert.equal(document.querySelector('.editor-photo img').getAttribute('src'),'blob:b.png');await click(document.querySelector('[aria-label="Удалить фото 2"]'));
    await submit(document.querySelector('.product-editor form'));
    assert.deepEqual(JSON.parse(saved.get('photos')),[{upload:0},{upload:1}]);assert.deepEqual(saved.getAll('images').map(file=>file.name),['b.png','a.png']);assert.equal(saved.get('expectedImages'),'["/old.png"]');
  }finally{await act(async()=>root.unmount());URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});

test('candle gallery switches photos by thumbnails, buttons and keyboard while keeping cover in cart',async()=>{
  window.localStorage.clear();const candle={...products[0],formId:1,colorId:1,scentId:1,form:forms[0],color:colors[0],scent:scents[0],image:'/one.png',images:['/one.png','/two.png','/three.png']};
  globalThis.fetch=async url=>url==='/api/products'?response([candle]):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/forms'?response(forms):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));assert.equal(document.querySelector('.product-image img').getAttribute('src'),'/one.png');await click(document.querySelector('.product-image'));
    const src=()=>document.querySelector('.detail-photo img').getAttribute('src');assert.equal(src(),'/one.png');assert.equal(document.querySelectorAll('.photo-thumbnails button').length,3);
    await click(document.querySelector('[aria-label="Фото 3"]'));assert.equal(src(),'/three.png');await click(document.querySelector('[aria-label="Следующее фото"]'));assert.equal(src(),'/one.png');
    await act(async()=>document.querySelector('[aria-label="Фото 1"]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})));assert.equal(src(),'/three.png');
    await click(button('Добавить в корзину'));await click(document.querySelector('.cart-trigger'));assert.equal(document.querySelector('.cart-candle-visual img').getAttribute('src'),'/one.png');
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('inventory groups exact form-color-scent combinations and exposes SVG edit/delete actions next to stock',async()=>{
  const snake={...forms[0],name:'Змея'};let removed;
  let candles=[{...products[0],id:41,name:'Змея',formId:1,form:snake,colorId:1,color:colors[0],scentId:1,scent:scents[0],stock:2},{...products[0],id:42,name:'Змея',formId:1,form:snake,colorId:2,color:colors[1],scentId:1,scent:scents[0],stock:7},{...products[0],id:43,name:'Змея',formId:1,form:snake,colorId:1,color:colors[0],scentId:1,scent:scents[0],stock:3}];
  const previousConfirm=globalThis.confirm;globalThis.confirm=()=>true;
  globalThis.fetch=async(url,init={})=>url==='/api/admin/session'?response({authenticated:true}):url==='/api/products?admin=1'?response(candles):url==='/api/forms?admin=1'?response([snake]):url==='/api/scents?admin=1'?response(scents):url==='/api/colors?admin=1'?response(colors):init.method==='DELETE'?(removed=url,candles=candles.filter(p=>p.id!==42),response({ok:true})):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));const groups=[...document.querySelectorAll('.inventory-group')];assert.equal(groups.length,2);assert.equal(groups[0].querySelectorAll('.inventory-entry').length,2);assert.match(groups[0].querySelector('.inventory-group-total').textContent,/5 шт/);assert.match(groups[1].querySelector('.inventory-group-total').textContent,/7 шт/);
    assert.equal(document.querySelector('.inventory-groups .admin-table-wrap'),null);assert.equal(document.querySelectorAll('.inventory-entry-actions svg').length,6);
    await click(document.querySelector('[aria-label="Редактировать свечу № 42"]'));assert.equal(document.querySelectorAll('.candle-selects select')[1].value,'2');await click(document.querySelector('[aria-label="Закрыть редактор"]'));
    await click(document.querySelector('[aria-label="Удалить свечу № 42"]'));assert.equal(removed,'/api/products/42');assert.equal(document.querySelectorAll('.inventory-group').length,1);assert.equal(document.querySelectorAll('.inventory-entry').length,2);
  }finally{await act(async()=>root.unmount());globalThis.confirm=previousConfirm;}
});

test('portrait browsing preserves the catalog until explicitly applying its aroma filter',async()=>{
  window.localStorage.clear();const portraits=require('./lib/aroma-portraits.js').aromaPortraits;
  const aromas=portraits.map((portrait,index)=>({...scents[0],id:index+10,name:portrait.name,image:portrait.image,description:`Описание ${portrait.name}`}));
  const candles=[{...products[0],id:1,formId:1,form:forms[0],colorId:1,color:colors[0],scentId:10,scent:aromas[0]},{...products[1],id:2,formId:2,form:forms[1],colorId:2,color:colors[1],scentId:11,scent:aromas[1]},{...products[0],id:3,formId:1,form:forms[0],colorId:2,color:colors[1],scentId:11,scent:aromas[1]}];
  const scroll=HTMLElement.prototype.scrollIntoView;HTMLElement.prototype.scrollIntoView=()=>{};
  globalThis.fetch=async url=>url==='/api/products'?response(candles):url==='/api/scents'?response([...aromas,{...scents[1],id:100,active:false,image:'/hidden.png'}]):url==='/api/colors'?response(colors):url==='/api/forms'?response(forms):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.deepEqual([...document.querySelectorAll('.tiho-site main>section')].slice(0,3).map(section=>section.id),['home','aromas','collection']);
    assert.equal(document.querySelectorAll('.scent-name-list button').length,26);assert.equal(document.querySelectorAll('.catalog-filter-trigger').length,3);assert.equal(document.querySelector('.color-filter'),null);assert.equal(document.querySelector('.aroma-filters'),null);assert.equal(document.querySelectorAll('.product-card').length,3);
    assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/assets/aromas/cherry.webp');
    await click(document.querySelector('[aria-label="Познакомиться с ароматом WINE"]'));
    assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/assets/aromas/wine.webp');assert.equal(document.querySelector('.scent-portrait-caption h3').textContent,'WINE');assert.match(document.querySelector('#filter-scent').textContent,/Все ароматы/);assert.equal(document.querySelectorAll('.product-card').length,3);assert.equal(document.querySelector('#ritual-aroma'),null);assert.equal(document.querySelector('#ritual'),null);assert.equal(document.querySelector('.scent-discovery-heading .eyebrow').textContent,'01 / ИСКУССТВО АРОМАТА');assert.ok(document.querySelector('#aromas #note-panel'));
    await click(document.querySelector('.scent-library>.button'));
    assert.match(document.querySelector('#filter-scent').textContent,/WINE/);assert.equal(document.querySelectorAll('.product-card').length,2);
    await click(document.querySelector('#filter-form'));assert.ok(document.querySelector('.filter-form-preview .wax-stage'));await click(document.querySelector('[aria-label="Форма: Спираль"]'));
    assert.equal(document.querySelectorAll('.product-card').length,1);assert.equal(document.querySelector('.product-card').dataset.productId,'3');assert.equal(document.activeElement.id,'filter-form');
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Красный"]'));assert.equal(document.querySelectorAll('.product-card').length,0);
    await click(document.querySelector('.catalog-reset'));assert.equal(document.querySelectorAll('.product-card').length,3);
    await click(document.querySelector('#filter-scent'));assert.equal(document.querySelectorAll('.filter-aroma-list button').length,27);
    await click([...document.querySelectorAll('.filter-aroma-list button')].find(node=>node.textContent.includes('CHERRY')));assert.equal(document.querySelectorAll('.product-card').length,1);assert.equal(document.querySelector('.scent-portrait-caption h3').textContent,'WINE');
    await click(document.querySelector('[aria-label="Следующий аромат"]'));assert.equal(document.querySelector('.scent-portrait-caption h3').textContent,'BLACK HONEY');await click(document.querySelector('[aria-label="Предыдущий аромат"]'));await click(document.querySelector('.scent-library>.button'));assert.match(document.querySelector('#filter-scent').textContent,/WINE/);
    await click(document.querySelector('#filter-color'));assert.equal(document.querySelectorAll('.catalog-filter-panel').length,1);
    await act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelector('.catalog-filter-panel'),null);assert.equal(document.activeElement.id,'filter-color');
    await click(document.querySelector('#filter-form'));await act(async()=>document.querySelector('#hero-title').dispatchEvent(new Event('pointerdown',{bubbles:true})));assert.equal(document.querySelector('.catalog-filter-panel'),null);
  }finally{await act(async()=>root.unmount());HTMLElement.prototype.scrollIntoView=scroll;window.localStorage.clear();}
});

test('portrait image failure has a readable fallback and changing aroma restores the picture',async()=>{
  window.localStorage.clear();const aromas=[{...scents[0],name:'CHERRY',image:'/assets/aromas/cherry.webp'},{...scents[1],name:'WINE',image:'/assets/aromas/wine.webp'}];
  globalThis.fetch=async url=>url==='/api/scents'?response(aromas):url==='/api/products'?response([]):url==='/api/colors'?response(colors):url==='/api/forms'?response(forms):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));await act(async()=>document.querySelector('.scent-portrait img').dispatchEvent(new Event('error')));assert.match(document.querySelector('.scent-portrait-missing').textContent,/Портрет аромата/);
    await click(document.querySelector('[aria-label="Следующий аромат"]'));assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/assets/aromas/wine.webp');
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('aroma settings select generated portraits and upload a replacement with its authored chapters',async()=>{
  let saved;let initial={...scents[0],image:'/assets/aromas/cherry.webp'};
  const previousCreate=URL.createObjectURL;const previousRevoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:aroma';URL.revokeObjectURL=()=>{};
  globalThis.fetch=async(url,init={})=>url==='/api/admin/session'?response({authenticated:true}):url==='/api/scents?admin=1'?response([initial]):url==='/api/scents/1'?(saved=init.body,initial=typeof init.body==='string'?JSON.parse(init.body):JSON.parse(init.body.get('data')),response(initial)):response([]);
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Admin)));await click(button('Ароматы'));await click(document.querySelector('.scent-admin-card footer button'));
    assert.equal(document.querySelector('.scent-editor-photo img').getAttribute('src'),initial.image);await selectValue(document.querySelector('.scent-portrait-editor select'),'/assets/aromas/wine.webp');assert.equal(document.querySelector('.scent-editor-photo img').getAttribute('src'),'/assets/aromas/wine.webp');
    await submit(document.querySelector('.scent-editor form'));assert.equal(JSON.parse(saved).image,'/assets/aromas/wine.webp');
    await click(document.querySelector('.scent-admin-card footer button'));const input=document.querySelector('[aria-label="Фото аромата"]');Object.defineProperty(input,'files',{value:[new dom.window.File(['photo'],'aroma.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    assert.equal(document.querySelector('.scent-editor-photo img').getAttribute('src'),'blob:aroma');await setValue(document.querySelector('.aroma-chapter input'),'Своя нота');await submit(document.querySelector('.scent-editor form'));assert.equal(saved.get('image').name,'aroma.png');assert.equal(JSON.parse(saved.get('data')).profile.top.notes,'Своя нота');
  }finally{await act(async()=>root.unmount());URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});

test('aroma portraits retain the decoded frame, discard stale loads and support mouse inspection',async()=>{
  window.localStorage.clear();
  const originalImage=window.Image, originalMedia=window.matchMedia;
  const requested=[];
  window.Image=class { constructor(){requested.push(this);} set src(value){this.url=value;} decode(){return Promise.resolve();} };
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const aromas=['CHERRY','WINE','YUZU'].map((name,i)=>({...scents[i],name,image:`/${name}.webp`,description:`Образ аромата ${name}`,profile:{top:{notes:'Цитрус',description:'Лёгкое начало.'},heart:{notes:'Цветы',description:'Цветочное сердце композиции с длинным описанием.'},base:{notes:'Древесина',description:'Мягкий древесный шлейф.'}}}));
  globalThis.fetch=async url=>url==='/api/scents'?response(aromas):url==='/api/products'?response([]):url==='/api/colors'?response(colors):url==='/api/forms'?response(forms):response({});
  const root=createRoot(document.getElementById('root'));
  const pointer=async(type,pointerType='mouse',x=160,y=40)=>{
    const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,relatedTarget:document.body});Object.defineProperty(event,'pointerType',{value:pointerType});
    await act(async()=>document.querySelector('.scent-portrait').dispatchEvent(event));
  };
  try{
    await act(async()=>root.render(React.createElement(Home)));
    const surface=document.querySelector('.scent-portrait');surface.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200});
    await pointer('pointerover');await pointer('pointermove');assert.equal(surface.style.getPropertyValue('--zoom-scale'),'1.18');assert.equal(surface.style.getPropertyValue('--zoom-x'),'80%');assert.equal(surface.style.getPropertyValue('--zoom-y'),'20%');
    await pointer('pointerout');assert.equal(surface.style.getPropertyValue('--zoom-scale'),'1');assert.equal(surface.style.getPropertyValue('--zoom-x'),'50%');
    await pointer('pointerover','touch');assert.equal(surface.style.getPropertyValue('--zoom-scale'),'1');
    await click(document.querySelector('[aria-label="Познакомиться с ароматом WINE"]'));
    const stale=requested.at(-1).onload;
    assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/CHERRY.webp');assert.equal(document.querySelector('.scent-portrait-images').getAttribute('aria-busy'),'true');
    assert.equal(document.querySelector('.scent-portrait-caption h3').textContent,'CHERRY');
    await click(document.querySelector('[aria-label="Познакомиться с ароматом YUZU"]'));
    await act(async()=>stale());assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/CHERRY.webp');
    await act(async()=>requested.at(-1).onload());
    const layers=document.querySelectorAll('.scent-portrait-frame');assert.equal(layers.length,2);assert.equal(layers[0].getAttribute('aria-hidden'),'true');assert.equal(layers[1].querySelector('img').getAttribute('src'),'/YUZU.webp');assert.ok(layers[1].classList.contains('is-revealing'));
    assert.equal(document.querySelector('.scent-portrait-caption:not([aria-hidden]) h3').textContent,'YUZU');
    await act(async()=>layers[1].dispatchEvent(new Event('animationend',{bubbles:true})));assert.equal(document.querySelectorAll('.scent-portrait-frame').length,1);assert.equal(document.querySelector('.scent-portrait-images').getAttribute('aria-busy'),'false');
    const caption=document.querySelector('.scent-portrait-caption'),title=caption.querySelector('h3'),overview=caption.querySelector('.scent-portrait-description'),photo=document.querySelector('.scent-portrait img'),drift=document.querySelector('.scent-portrait-drift'),loads=requested.length;
    const assertStableIdentity=()=>{
      assert.equal(document.querySelector('.scent-portrait-caption'),caption);assert.equal(caption.querySelector('h3'),title);assert.equal(caption.querySelector('.scent-portrait-description'),overview);
      assert.equal(document.querySelector('.scent-portrait img'),photo);assert.equal(document.querySelector('.scent-portrait-drift'),drift);assert.equal(requested.length,loads);
      assert.ok(!caption.classList.contains('is-revealing'));assert.equal(document.querySelectorAll('.scent-portrait-caption').length,1);
    };
    await act(async()=>document.querySelector('#note-tab-0').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));assert.equal(document.activeElement.id,'note-tab-1');assert.equal(document.querySelector('#note-panel').getAttribute('aria-labelledby'),'note-tab-1');
    assertStableIdentity();assert.match(caption.querySelector('.scent-chapter-copy.is-revealing').textContent,/Цветочное сердце/);assert.equal(caption.querySelector('.scent-chapter-copy.is-leaving').getAttribute('aria-hidden'),'true');
    await act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})));assert.equal(document.activeElement.id,'note-tab-2');
    assertStableIdentity();assert.match(caption.querySelector('.scent-chapter-copy.is-revealing').textContent,/Мягкий древесный/);
    await act(async()=>caption.querySelector('.scent-chapter-copy.is-revealing').dispatchEvent(new Event('animationend',{bubbles:true})));
    assertStableIdentity();assert.equal(caption.querySelectorAll('.scent-chapter-copy').length,1);
    window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    await pointer('pointerover');assert.equal(surface.style.getPropertyValue('--zoom-scale'),'1');
    await click(document.querySelector('[aria-label="Познакомиться с ароматом WINE"]'));await act(async()=>requested.at(-1).onload());assert.equal(document.querySelectorAll('.scent-portrait-frame').length,1);assert.equal(document.querySelector('.scent-portrait img').getAttribute('src'),'/WINE.webp');
  }finally{await act(async()=>root.unmount());window.Image=originalImage;window.matchMedia=originalMedia;window.localStorage.clear();}
});

test('workshop begins with aroma and keeps the photo, chapters and candle mounted across steps and searches',async()=>{
  window.localStorage.clear();
  const profile={top:{notes:'Вишня',description:'Первая нота'},heart:{notes:'Вино',description:'Сердце аромата'},base:{notes:'Древесина',description:'Тихий шлейф'}};
  const aromas=[{...scents[0],name:'CHERRY',image:'/cherry.webp',profile},{...scents[1],name:'WINE',image:'/wine.webp',profile}];
  globalThis.fetch=async url=>url==='/api/scents'?response(aromas):url==='/api/forms'?response(forms):url==='/api/colors'?response(colors):url==='/api/products'?response([]):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.match(document.querySelector('#studio-title').textContent,/Твоя мастерская/);
    assert.deepEqual([...document.querySelectorAll('.studio-steps button')].map(el=>el.textContent),['01Аромат','02Форма','03Цвет','04Результат']);
    assert.equal(document.querySelector('#studio-panel-0').hidden,false);
    await setValue(document.querySelector('.studio-search input'),'wine');
    assert.equal(document.querySelectorAll('input[name="recipe-scent"]').length,1);
    await click(document.querySelector('input[name="recipe-scent"][value="2"]'));
    assert.equal(document.querySelector('.workshop-background img').getAttribute('src'),'/wine.webp');
    const candle=document.querySelector('#studio-candle'),photo=document.querySelector('.workshop-background img'),title=document.querySelector('.builder-aroma h3');
    const chapterTabs=[...document.querySelectorAll('.workshop-chapter-tabs button')];
    await click(chapterTabs[1]);assert.match(document.querySelector('.builder-aroma-chapters section:not([hidden])').textContent,/Сердце аромата/);
    for(const step of [1,2,3,0]){
      await click(document.querySelector(`#studio-step-${step}`));
      assert.equal(document.querySelector('#studio-candle'),candle);assert.equal(document.querySelector('.workshop-background img'),photo);assert.equal(document.querySelector('.builder-aroma h3'),title);
      assert.equal(document.querySelector('.workshop-chapter-tabs button[aria-selected=true]'),chapterTabs[1]);
    }
    await setValue(document.querySelector('#studio-panel-0 .studio-search input'),'нет такого аромата');
    assert.equal(document.querySelectorAll('input[name="recipe-scent"]').length,0);assert.match(document.querySelector('#studio-panel-0 .studio-search-empty').textContent,/Попробуй/);
    assert.equal(document.querySelector('.builder-aroma h3'),title);assert.match(document.querySelector('#recipe-summary').textContent,/WINE/);
    await click(document.querySelector('#studio-step-1'));await setValue(document.querySelector('#studio-panel-1 .studio-search input'),'ракушка');
    assert.equal(document.querySelectorAll('input[name="candle-shape"]').length,1);await click(document.querySelector('input[name="candle-shape"][value="2"]'));
    await click(document.querySelector('#studio-next'));assert.equal(document.querySelector('#studio-panel-2').hidden,false);
    await click(document.querySelector('input[name="candle-color"][value="2"]'));assert.equal(document.querySelector('.workshop-background img'),photo);
    await click(document.querySelector('#studio-next'));assert.equal(document.querySelector('#studio-panel-3').hidden,false);assert.match(document.querySelector('#recipe-summary').textContent,/Ракушка/);
    await click(document.querySelector('#add-custom'));await click(document.querySelector('.cart-trigger'));
    assert.match(document.querySelector('.cart-item.custom').textContent,/WINE/);assert.match(document.querySelector('.cart-item.custom').textContent,/Ракушка/);
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('workshop atmosphere waits for the selected photo and ignores stale downloads',async()=>{
  const {WorkshopScene}=require('./app/components/workshop-scene.js');
  const originalImage=window.Image,originalMedia=window.matchMedia,requests=[];
  window.Image=class {constructor(){requests.push(this);}set src(value){this.url=value;}decode(){return Promise.resolve();}};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  const aromas=['CHERRY','WINE','COAL'].map((name,index)=>({...scents[index],name,image:`/${name}.webp`}));
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(WorkshopScene,{scent:aromas[0]})));
    await act(async()=>root.render(React.createElement(WorkshopScene,{scent:aromas[1]})));const stale=requests.at(-1).onload;
    assert.equal(document.querySelector('.builder-aroma h3').textContent,'CHERRY');
    await act(async()=>root.render(React.createElement(WorkshopScene,{scent:aromas[2]})));
    await act(async()=>stale());assert.equal(document.querySelector('.builder-aroma h3').textContent,'CHERRY');
    await act(async()=>requests.at(-1).onload());
    const current=document.querySelector('.workshop-atmosphere-layer.is-revealing');
    assert.match(current.textContent,/COAL/);assert.equal(current.querySelector('img').getAttribute('src'),'/COAL.webp');
    assert.equal(document.querySelector('.workshop-atmosphere-layer.is-leaving').hasAttribute('inert'),true);
    await act(async()=>current.dispatchEvent(new Event('animationend',{bubbles:true})));assert.equal(document.querySelectorAll('.workshop-atmosphere-layer').length,1);
    await act(async()=>current.querySelector('img').dispatchEvent(new Event('error')));assert.equal(document.querySelector('.workshop-background img'),null);assert.match(current.textContent,/COAL/);
  }finally{await act(async()=>root.unmount());window.Image=originalImage;window.matchMedia=originalMedia;}
});

test('hero keeps the burning photograph without controls and section numbers follow the page',async()=>{
  globalThis.fetch=async url=>url==='/api/forms'?response(forms):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/products'?response([]):response({});
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelector('#evening-light'),null);assert.equal(document.querySelector('#flame-toggle'),null);assert.equal(document.querySelector('.night-layer'),null);
    assert.equal(document.querySelector('#hero-image img').getAttribute('src'),'/assets/hero.png');assert.ok(document.querySelector('#home .button-glass'));
    assert.equal(document.querySelector('.wordmark').textContent,'тихо');assert.equal(document.querySelector('.footer-wordmark').textContent,'тихо');assert.equal(document.querySelector('#care details'),null);
    const labels=['.scent-discovery-heading .eyebrow','#collection .section-heading .eyebrow','#workshop .section-heading .eyebrow','#studio .studio-heading .eyebrow','#care .ritual-story-heading .eyebrow'].map(selector=>document.querySelector(selector).textContent.slice(0,2));
    assert.deepEqual(labels,['01','02','03','04','05']);assert.equal(document.querySelectorAll('.ritual-story button').length,0);
    const links=[...document.querySelectorAll('.section-navigation a')];assert.deepEqual(links.map(link=>link.getAttribute('href')),['#home','#aromas','#collection','#workshop','#studio','#care']);assert.ok(links.every(link=>document.querySelector(link.getAttribute('href')) && link.getAttribute('aria-label')));
  }finally{await act(async()=>root.unmount());}
});

test('button-free ritual supports keyboard, horizontal wheel, mouse swipes and touch cancellation',async t=>{
  const {EveningRitual}=require('./app/components/evening-ritual.js');const root=createRoot(document.getElementById('root'));
  t.mock.timers.enable({apis:['Date']});
  const pointer=async(type,x,y=200)=>{const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:7});await act(async()=>document.querySelector('.ritual-story').dispatchEvent(event));};
  const key=async key=>act(async()=>document.querySelector('.ritual-story').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));
  const wheel=async options=>{const event=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,...options});await act(async()=>document.querySelector('.ritual-story').dispatchEvent(event));return event.defaultPrevented;};
  try{
    await act(async()=>root.render(React.createElement(EveningRitual)));
    const scene=()=>Number(document.querySelector('.ritual-story').dataset.scene);
    assert.equal(document.querySelector('.ritual-story button'),null);
    await key('ArrowLeft');assert.equal(scene(),4);assert.match(document.querySelector('.ritual-story-care').textContent,/полностью остынет/);
    await key('ArrowRight');assert.equal(scene(),0);
    await key('ArrowRight');await key('ArrowRight');assert.equal(scene(),2);assert.match(document.querySelector('.ritual-story-frame img').getAttribute('src'),/03-stay/);
    await key('ArrowRight');assert.equal(scene(),3);
    await pointer('pointerdown',200);await pointer('pointerup',100);assert.equal(scene(),4);
    await pointer('pointerdown',100);await pointer('pointerup',200);assert.equal(scene(),3);
    await pointer('pointerdown',200);await pointer('pointerup',195,400);assert.equal(scene(),3,'Vertical scrolling must not change the scene');
    await pointer('pointerdown',200);await pointer('pointercancel',80);assert.equal(scene(),3);
    await key('Home');assert.equal(scene(),0);
    assert.equal(await wheel({deltaY:200}),false,'Vertical wheel remains available to the page');assert.equal(scene(),0);
    assert.equal(await wheel({deltaX:100,ctrlKey:true}),false,'Zoom gesture remains untouched');
    assert.equal(await wheel({deltaX:20}),true);assert.equal(scene(),0);
    await wheel({deltaX:30});assert.equal(scene(),1);
    await wheel({deltaX:200});assert.equal(scene(),1,'Wheel inertia advances only one scene');
    t.mock.timers.tick(1000);await wheel({deltaX:-80});assert.equal(scene(),0);
    t.mock.timers.tick(1000);await wheel({deltaY:80,shiftKey:true});assert.equal(scene(),1,'Shift + wheel supports ordinary mouse wheels');
    await key('End');assert.equal(scene(),4);await key('Home');assert.equal(scene(),0);
    assert.equal(document.querySelector('.ritual-story').dataset.playing,'false','Reduced motion disables autoplay');assert.equal(document.querySelectorAll('.ritual-story-frame').length,1);
  }finally{await act(async()=>root.unmount());t.mock.timers.reset();}
});

test('ritual advances every two seconds during hover, focus and scrolling, with explicit pause support',async t=>{
  const {EveningRitual}=require('./app/components/evening-ritual.js');
  const oldMedia=window.matchMedia,hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});Object.defineProperty(document,'hidden',{configurable:true,value:false});
  t.mock.timers.enable({apis:['setTimeout']});const root=createRoot(document.getElementById('root'));
  const tick=async ms=>act(async()=>t.mock.timers.tick(ms));
  const hover=async type=>{const event=new MouseEvent(type,{bubbles:true,relatedTarget:document.body});Object.defineProperty(event,'pointerType',{value:'mouse'});await act(async()=>document.querySelector('.ritual-story').dispatchEvent(event));};
  const space=async()=>act(async()=>document.querySelector('.ritual-story').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true})));
  try{
    await act(async()=>root.render(React.createElement(EveningRitual)));
    // No DOM load event: the first SSR photograph may already be cached before hydration.
    const scene=()=>Number(document.querySelector('.ritual-story').dataset.scene);
    assert.equal(document.querySelector('.ritual-story').dataset.playing,'true');await tick(1999);assert.equal(scene(),0);await tick(1);assert.equal(scene(),1);
    await hover('pointerover');await tick(2000);assert.equal(scene(),2);assert.equal(document.querySelector('.ritual-story').dataset.playing,'true');
    await act(async()=>document.querySelector('.ritual-story').focus());await tick(2000);assert.equal(scene(),3,'Keyboard focus does not silently stop playback');
    await act(async()=>window.dispatchEvent(new Event('scroll')));await tick(2000);assert.equal(scene(),4,'Scrolling does not reset the timer');
    await hover('pointerout');await tick(2000);assert.equal(scene(),0);
    await space();await tick(24000);assert.equal(scene(),0);
    await space();await tick(2000);assert.equal(scene(),1);
    await act(async()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await tick(24000);assert.equal(scene(),1);
  }finally{await act(async()=>root.unmount());t.mock.timers.reset();window.matchMedia=oldMedia;if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;}
});

test('left-button hold freezes the ritual until release, without losing swipe or explicit pause',async t=>{
  const {EveningRitual}=require('./app/components/evening-ritual.js');
  const oldMedia=window.matchMedia,hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  t.mock.timers.enable({apis:['setTimeout']});const root=createRoot(document.getElementById('root'));
  const carousel=()=>document.querySelector('.ritual-story');
  const scene=()=>Number(carousel().dataset.scene);
  const tick=async ms=>act(async()=>t.mock.timers.tick(ms));
  const pointer=async(type,{target=carousel(),button=0,x=200,pointerType='mouse',id=7}={})=>{
    const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:200,button});
    Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});
    await act(async()=>target.dispatchEvent(event));
  };
  try{
    await act(async()=>root.render(React.createElement(EveningRitual)));await tick(2000);
    assert.equal(scene(),1);assert.equal(document.querySelectorAll('.ritual-story-frame').length,2);
    await pointer('pointerdown');assert.equal(carousel().dataset.playing,'false');assert.ok(carousel().classList.contains('is-held'));
    await pointer('pointerup',{target:document.body,id:8});assert.equal(carousel().dataset.playing,'false','An unrelated pointer cannot end the hold');
    await tick(8000);assert.equal(scene(),1);assert.equal(document.querySelectorAll('.ritual-story-frame').length,2,'Keep both photographs when a crossfade is frozen');
    await pointer('pointerup',{target:document.body});assert.equal(carousel().dataset.playing,'true');assert.ok(!carousel().classList.contains('is-dragging'));
    await tick(1999);assert.equal(scene(),1);await tick(1);assert.equal(scene(),2);
    await pointer('pointerdown',{button:2});await tick(2000);assert.equal(scene(),3,'Right mouse button does not pause autoplay');
    await pointer('pointerdown',{target:document.querySelector('.ritual-story-frame:last-child .ritual-story-care')});
    assert.ok(!carousel().classList.contains('is-dragging'),'Text can still be selected');await tick(6000);assert.equal(scene(),3);
    await pointer('pointerup',{target:document.body});assert.equal(carousel().dataset.playing,'true');
    await pointer('pointerdown');await tick(6000);assert.equal(scene(),3);await pointer('pointerup',{x:100});assert.equal(scene(),4,'A held horizontal drag still changes the scene on release');
    for(const type of ['pointercancel','lostpointercapture','blur']){
      await pointer('pointerdown');assert.equal(carousel().dataset.playing,'false');
      if(type==='blur')await act(async()=>window.dispatchEvent(new Event('blur')));else await pointer(type);
      assert.equal(carousel().dataset.playing,'true',`${type} must clear the hold`);
    }
    await pointer('pointerdown',{pointerType:'touch'});assert.equal(carousel().dataset.playing,'false','A finger freezes the photograph');await pointer('pointercancel',{pointerType:'touch'});assert.equal(carousel().dataset.playing,'true','Native vertical scrolling cancels the hold and resumes playback');
    await act(async()=>carousel().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true})));
    const paused=scene();await pointer('pointerdown');await pointer('pointerup');await tick(6000);assert.equal(scene(),paused);assert.equal(carousel().dataset.playing,'false','Release preserves an explicit Space-key pause');
  }finally{await act(async()=>root.unmount());t.mock.timers.reset();window.matchMedia=oldMedia;if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;}
});

test('a photograph finishing its download cannot replace the scene while held',async t=>{
  const {EveningRitual}=require('./app/components/evening-ritual.js');
  const oldMedia=window.matchMedia,oldImage=window.Image,hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden'),requests=[];
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.Image=class {constructor(){requests.push(this);}set src(value){this.url=value;}decode(){return Promise.resolve();}};
  t.mock.timers.enable({apis:['setTimeout']});const root=createRoot(document.getElementById('root'));
  const pointer=async type=>{const event=new MouseEvent(type,{bubbles:true,button:0});Object.defineProperties(event,{pointerId:{value:7},pointerType:{value:'mouse'}});await act(async()=>document.querySelector('.ritual-story').dispatchEvent(event));};
  try{
    await act(async()=>root.render(React.createElement(EveningRitual)));await act(async()=>requests[0].onload());
    await act(async()=>t.mock.timers.tick(2000));const stale=requests.at(-1).onload;
    assert.equal(document.querySelector('.ritual-story').getAttribute('aria-busy'),'true');
    await pointer('pointerdown');await act(async()=>stale());await act(async()=>t.mock.timers.tick(6000));
    assert.equal(document.querySelector('.ritual-story').dataset.scene,'0');
    await pointer('pointerup');await act(async()=>requests.at(-1).onload());
    assert.equal(document.querySelector('.ritual-story').dataset.scene,'1');assert.equal(document.querySelector('.ritual-story').dataset.playing,'true');
  }finally{await act(async()=>root.unmount());t.mock.timers.reset();window.matchMedia=oldMedia;window.Image=oldImage;if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;}
});

test('mobile section order and navigation numbers change together without losing catalog choices',async()=>{
  const oldMedia=window.matchMedia,subscribers=new Set();let mobile=true;
  window.matchMedia=query=>({matches:query==='(max-width: 760px)'?mobile:query.includes('prefers-reduced-motion: reduce'),addEventListener(type,listener){if(query==='(max-width: 760px)')subscribers.add(listener);},removeEventListener(type,listener){subscribers.delete(listener);}});
  window.localStorage.clear();
  globalThis.fetch=async url=>url==='/api/forms'?response(forms):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/products'?response(products):response({});
  const root=createRoot(document.getElementById('root'));
  const order=()=>[...document.querySelectorAll('.tiho-site main>section')].map(section=>section.id);
  const nav=()=>[...document.querySelectorAll('.section-navigation a')].map(link=>[link.getAttribute('href'),link.querySelector('.section-navigation-circle').textContent]);
  const resize=async value=>act(async()=>{mobile=value;for(const notify of subscribers)notify();});
  try{
    await act(async()=>root.render(React.createElement(Home)));
    assert.deepEqual(order(),['home','collection','aromas','intro','workshop','studio','care']);
    assert.deepEqual(nav(),[['#home',''],['#collection','01'],['#aromas','02'],['#workshop','03'],['#studio','04'],['#care','05']]);
    assert.match(document.querySelector('#collection .eyebrow').textContent,/^01/);assert.match(document.querySelector('#aromas .eyebrow').textContent,/^02/);
    assert.equal(document.querySelector('.scroll-cue').getAttribute('href'),'#collection');
    await click(document.querySelector('#filter-color'));await click(document.querySelector('[aria-label="Цвет: Чёрный"]'));
    await click(document.querySelector('[aria-label="Познакомиться с ароматом Сандал и дым"]'));
    const catalog=document.querySelector('#collection'),aromas=document.querySelector('#aromas');
    await resize(false);
    assert.deepEqual(order().slice(0,3),['home','aromas','collection']);
    assert.deepEqual(nav().slice(0,3),[['#home',''],['#aromas','01'],['#collection','02']]);
    assert.equal(document.querySelector('#collection'),catalog);assert.equal(document.querySelector('#aromas'),aromas);
    assert.match(document.querySelector('#filter-color').textContent,/Чёрный/);assert.match(document.querySelector('#filter-scent').textContent,/Все ароматы/);assert.match(document.querySelector('.scent-portrait-caption h3').textContent,/Сандал и дым/);
    await resize(true);
    assert.deepEqual(order().slice(0,3),['home','collection','aromas']);assert.equal(document.querySelector('#collection'),catalog);
    await click(document.querySelector('.cart-trigger'));assert.equal(document.querySelector('.empty-cart>p').textContent,'Здесь пока ТИХО');
  }finally{await act(async()=>root.unmount());window.matchMedia=oldMedia;window.localStorage.clear();}
});

test('touch hold freezes transitions, swipes on captions work both ways, and vertical cancellation resumes autoplay',async t=>{
  const {EveningRitual}=require('./app/components/evening-ritual.js');
  const oldMedia=window.matchMedia,hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});Object.defineProperty(document,'hidden',{configurable:true,value:false});
  t.mock.timers.enable({apis:['setTimeout']});const root=createRoot(document.getElementById('root'));
  const carousel=()=>document.querySelector('.ritual-story');
  const scene=()=>Number(carousel().dataset.scene);
  const tick=async ms=>act(async()=>t.mock.timers.tick(ms));
  const pointer=async(type,{target=carousel(),x=200,y=200,id=21,primary=true}={})=>{
    const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});
    Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'},isPrimary:{value:primary}});
    await act(async()=>target.dispatchEvent(event));
  };
  try{
    await act(async()=>root.render(React.createElement(EveningRitual)));await tick(2000);assert.equal(scene(),1);
    await pointer('pointerdown');assert.equal(carousel().dataset.playing,'false');
    await tick(8000);assert.equal(scene(),1);assert.equal(document.querySelectorAll('.ritual-story-frame').length,2,'Crossfade layers stay frozen together');
    await pointer('pointerdown',{id:22,primary:false});await pointer('pointerup',{id:22});assert.equal(carousel().dataset.playing,'false','A second finger cannot release the first');
    await pointer('pointerup',{target:document.body});assert.equal(carousel().dataset.playing,'true');await tick(2000);assert.equal(scene(),2);
    await pointer('pointerdown',{target:document.querySelector('.ritual-story-frame:last-child .ritual-story-copy')});await tick(5000);assert.equal(scene(),2);
    await pointer('pointerup',{x:110});assert.equal(scene(),3,'A swipe left on the caption advances');
    await pointer('pointerdown',{target:document.querySelector('.ritual-story-frame:last-child .ritual-story-care'),x:110});
    await pointer('pointerup',{x:210});assert.equal(scene(),2,'A swipe right returns to the previous scene');
    await pointer('pointerdown');await pointer('pointercancel',{y:350});assert.equal(scene(),2);assert.equal(carousel().dataset.playing,'true');
    await tick(2000);assert.equal(scene(),3,'Autoplay resumes after the browser starts vertical scrolling');
    await pointer('pointerdown');await pointer('lostpointercapture');assert.equal(carousel().dataset.playing,'true');
  }finally{await act(async()=>root.unmount());t.mock.timers.reset();window.matchMedia=oldMedia;if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;}
});

test('product swipes follow the filtered catalog, separate photo gestures and preserve modal lifetime',async()=>{
  window.localStorage.clear();
  const candles=[1,2,3].map((id,i)=>({...products[i%2],id,name:`Свеча ${id}`,formId:i%2+1,form:forms[i%2],colorId:1,color:colors[0],scentId:i===1?2:1,scent:scents[i===1?1:0],image:`/${id}-a.png`,images:i===0?[`/${id}-a.png`,`/${id}-b.png`]:[`/${id}-a.png`]}));
  globalThis.fetch=async url=>url==='/api/products'?response(candles):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/forms'?response(forms):response({});
  const root=createRoot(document.getElementById('root'));
  const oldScroll=window.scrollTo;const restored=[];window.scrollTo=value=>restored.push(value);
  const touch=async(type,target,x,y,{id=1,more=false}={})=>{
    const event=new Event(type,{bubbles:true,cancelable:true});
    const point={identifier:id,clientX:x,clientY:y};
    Object.defineProperties(event,{touches:{value:type==='touchend'||type==='touchcancel'?[]:more?[point,{identifier:2,clientX:250,clientY:300}]:[point]},changedTouches:{value:[point]}});
    await act(async()=>target.dispatchEvent(event));
    return event;
  };
  const swipe=async(selector,dx,dy=0)=>{
    const target=document.querySelector(selector);assert.ok(target);
    await touch('touchstart',target,220,300);const event=await touch('touchmove',target,220+dx,300+dy);await touch('touchend',target,220+dx,300+dy);return event;
  };
  try{
    await act(async()=>root.render(React.createElement(Home)));
    await click(document.querySelector('#filter-scent'));await click([...document.querySelectorAll('.filter-aroma-list button')].find(n=>n.textContent.includes(scents[0].name)));
    assert.deepEqual([...document.querySelectorAll('.product-card')].map(n=>n.dataset.productId),['1','3']);
    const trigger=document.querySelector('.product-image');trigger.focus();await click(trigger);
    const modal=document.querySelector('.product-dialog');
    assert.equal(document.querySelector('#detail-scent'),null);assert.equal(document.querySelector('.detail-colors'),null);
    assert.equal(document.documentElement.style.overflow,'hidden');assert.equal(document.body.style.position,'');
    const src=()=>document.querySelector('.detail-photo img').getAttribute('src');
    const current=()=>document.querySelector('.product-detail-body').dataset.productId;
    await swipe('.detail-photo',-95);assert.equal(src(),'/1-b.png');assert.equal(current(),'1');
    await swipe('.detail-photo',95);assert.equal(src(),'/1-a.png');
    await click(document.querySelector('[aria-label="Увеличить количество"]'));
    await swipe('.detail-content h2',-110);assert.equal(current(),'3');assert.equal(document.querySelector('.qty-picker output').textContent,'1');
    assert.equal(document.querySelector('.product-dialog'),modal);assert.equal(restored.length,0,'Do not unlock and refocus the page between products');
    await swipe('.detail-photo',-100);assert.equal(current(),'3','A single photo must not switch the product');
    await swipe('.detail-content h2',-100);assert.equal(current(),'3','Catalog navigation stops at the filtered end');
    await swipe('.detail-content h2',100);assert.equal(current(),'1');assert.equal(src(),'/1-a.png');
    await swipe('.detail-content h2',100);assert.equal(current(),'1','Catalog navigation stops at the first candle');
    await swipe('.detail-content h2',25);assert.equal(current(),'1','Small drags are not navigation');
    const target=document.querySelector('.detail-content h2');
    await touch('touchstart',target,220,300);await touch('touchmove',target,100,300,{more:true});await touch('touchend',target,100,300);assert.equal(current(),'1','Ignore multi-touch');
    await touch('touchstart',target,220,300);await touch('touchmove',target,100,300);await touch('touchcancel',target,100,300);assert.equal(current(),'1','Cancellation never navigates');
    modal.scrollTop=180;
    assert.equal((await swipe('.detail-content h2',0,120)).defaultPrevented,false,'Scrolling down from the middle stays native');assert.ok(document.querySelector('.product-dialog'));
    modal.scrollTop=0;await swipe('.detail-content h2',0,120);
    assert.equal(document.querySelector('.product-dialog'),null);assert.equal(document.body.style.position,'');assert.equal(document.activeElement,trigger);assert.equal(restored.length,1);
    assert.match(document.querySelector('#filter-scent').textContent,new RegExp(scents[0].name));
    await click(trigger);await click(document.querySelector('[aria-label="Следующая свеча"]'));
    await click(button('Добавить в корзину'));await click(document.querySelector('.cart-trigger'));
    assert.match(document.querySelector('.cart-item').textContent,/Свеча 3/);assert.match(document.querySelector('.cart-item').textContent,new RegExp(scents[0].name));
  }finally{await act(async()=>root.unmount());window.scrollTo=oldScroll;window.localStorage.clear();}
});

test('two-color workshop uses the administrator palette and keeps both colors through cart restore and checkout',async()=>{
  window.localStorage.clear();let sent;
  const palette=[{id:21,name:'Изумруд мастерской',hex:'#12563b',active:true},{id:22,name:'Серебро мастерской',hex:'#c8c9cb',active:true},{id:23,name:'Золото мастерской',hex:'#baa35a',active:true},{id:24,name:'Отключённый',hex:'#cc00cc',active:false}];
  const shapes=[{id:51,name:'Змея',shape:null,silhouette:'/assets/forms/snake-two-tone.png',twoTone:true,active:true},forms[0]];
  globalThis.fetch=async(url,init={})=>url==='/api/colors'?response(palette):url==='/api/forms'?response(shapes):url==='/api/products'?response([]):url==='/api/scents'?response(scents):url==='/api/orders'?(sent=JSON.parse(init.body),response({orderNumber:'T-TWO-TONE',total:0,quotePending:true})):response({});
  let root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(Home)));
    await click(document.querySelector('#studio-step-2'));
    assert.equal(document.querySelectorAll('input[name="candle-color"]').length,3);
    assert.equal(document.querySelectorAll('input[name="candle-accent-color"]').length,3);
    assert.doesNotMatch(document.querySelector('#studio-panel-2').textContent,/Отключённый/);
    const initial=document.querySelector('#studio-candle feColorMatrix').getAttribute('values');
    await click(document.querySelector('#studio-step-3'));await click(document.querySelector('#add-custom'));
    await click(document.querySelector('#studio-step-2'));await click(document.querySelector('input[name="candle-accent-color"][value="23"]'));
    assert.notEqual(document.querySelector('#studio-candle feColorMatrix').getAttribute('values'),initial);
    await click(document.querySelector('#studio-step-3'));await click(document.querySelector('#add-custom'));
    await click(document.querySelector('#studio-step-1'));await click(document.querySelector('input[name="candle-shape"][value="1"]'));
    assert.equal(document.querySelectorAll('input[name="candle-accent-color"]').length,0);
    await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
    await act(async()=>root.render(React.createElement(Home)));await click(document.querySelector('.cart-trigger'));
    assert.equal(document.querySelectorAll('.cart-item.custom').length,2);
    assert.equal(document.querySelectorAll('.cart-custom-preview .wax-two-tone').length,2);
    assert.match(document.querySelector('.cart-items').textContent,/Изумруд мастерской.*Серебро мастерской/s);assert.match(document.querySelector('.cart-items').textContent,/Золото мастерской/);
    const checkout=document.querySelector('#checkout-form');for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Адрес'}))checkout.elements.namedItem(name).value=value;
    await submit(checkout);assert.deepEqual(sent.items.map(item=>[item.customRecipe.colorId,item.customRecipe.accentColorId]),[[21,22],[21,23]]);
  }finally{await act(async()=>root.unmount());window.localStorage.clear();}
});

test('form editor installs the prepared two-color snake template without an upload',async()=>{
  const {FormEditor}=require('./app/admin/editors.js');let saved;
  const root=createRoot(document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(FormEditor,{form:{id:0,name:'Змея',active:true,shape:null},onClose(){},onSave:async data=>{saved=data;}})));
    await click(button('Использовать готовый силуэт'));
    assert.equal(document.querySelector('.silhouette-preview .wax-color-map image').getAttribute('href'),'/assets/forms/snake-two-tone.png');
    await submit(document.querySelector('.form-editor form'));
    assert.equal(saved.get('twoTone'),'true');assert.equal(saved.get('silhouettePreset'),'snake-two-tone');
  }finally{await act(async()=>root.unmount());}
});
