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
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
window.HTMLCanvasElement.prototype.getContext=()=>null;
const {createRoot}=await import('react-dom/client');
const rootDir=path.resolve(import.meta.dirname,'..');
const temp=mkdtempSync(path.join(tmpdir(),'tixo-ui-'));
writeFileSync(path.join(temp,'package.json'),'{"type":"commonjs"}');
symlinkSync(path.join(rootDir,'node_modules'),path.join(temp,'node_modules'),'dir');
for(const file of ['lib/atelier.ts','lib/catalog.ts','app/page.tsx','app/admin/page.tsx','app/admin/editors.tsx','app/components/modal.tsx','app/components/candle-preview.tsx','app/components/product-card.tsx','app/components/atelier.tsx','app/components/living-flame.tsx','app/components/storefront-commerce.tsx']) {
  const target=path.join(temp,file.replace(/\.tsx?$/,'.js'));
  mkdirSync(path.dirname(target),{recursive:true});
  const source=readFileSync(path.join(rootDir,file),'utf8').replace(/^import ".*\.css";$/gm,'').replace(/"@\/lib\/(\w+)"/g,(_,name)=>JSON.stringify(path.join(temp,`lib/${name}.js`)));
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
const button=(name)=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes(name));
const click=async node=>{assert.ok(node);await act(async()=>node.click());};
const setValue=async(node,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};

test('color and aroma filters intersect independently and checkout keeps every combination',async()=>{
  window.localStorage.clear(); let sent;
  globalThis.fetch=async(url,init={})=>url==='/api/products'?response(products):url==='/api/scents'?response(scents):url==='/api/colors'?response(colors):url==='/api/orders'?(sent=JSON.parse(init.body),response({orderNumber:'T-COLORS',total:4500,quotePending:false},201)):response({});
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelectorAll('.color-filter-option').length,4);
    assert.equal(document.querySelectorAll('.product-card').length,8);
    await click(document.querySelector('[aria-label="Цвет: Красный"]'));
    assert.equal(document.querySelectorAll('.product-card').length,2);
    const silhouette=document.querySelector('.product-image .wax-stage').getAttribute('style');
    await click(button('Сандал и дым'));
    assert.equal(document.querySelector('.product-image .wax-stage').getAttribute('style'),silhouette);
    assert.ok([...document.querySelectorAll('.product-card')].every(node=>node.dataset.colorId==='1' && node.dataset.scentId==='2'));
    await click(document.querySelector('.quick-add'));
    await click(document.querySelector('[aria-label="Цвет: Чёрный"]'));
    assert.equal(document.querySelector('.aroma-filters [aria-pressed="true"]').textContent,'Сандал и дым');
    await click(document.querySelector('.quick-add'));
    await click(button('Белая ваниль'));
    await click(document.querySelector('.quick-add'));
    await click(button('Вишня и миндаль'));
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
    await click(document.querySelector('[aria-label="Цвет: Красный"]'));await click(button('Сандал и дым'));
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
    await click(document.querySelector('#studio-step-1'));
    await click(document.querySelector('input[name="candle-color"][value="red"]'));
    await click(document.querySelector('#studio-step-3'));
    await click(document.querySelector('#add-custom'));
    await click(document.querySelector('.cart-trigger'));
    const cart=document.querySelector('.cart-items').textContent;
    assert.match(cart,/Слоновая кость/);assert.match(cart,/Винный/);
    assert.equal(document.querySelectorAll('.cart-item').length,2);
    const form=document.querySelector('#checkout-form');
    for(const [name,value] of Object.entries({name:'Тест',phone:'+79990000000',email:'test@example.com',address:'Тестовый адрес'}))form.elements.namedItem(name).value=value;
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(sent.length,1);
    assert.match(document.querySelector('.pending-order').textContent,/Повторить отправку/);
    await click(button('Повторить отправку'));
    assert.deepEqual(sent[1],sent[0]);
    assert.deepEqual(sent[0].items.map(item=>item.customRecipe.color),['ivory','red']);
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

test('configured candles show one real combination, while aroma chapters use authored text and the original photograph',async()=>{
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
    assert.equal(document.querySelector('#detail-scent').value,'2');
    assert.equal(document.querySelectorAll('.detail-colors button').length,1);
    assert.equal(document.querySelectorAll('#detail-scent option').length,2);
    await click(document.querySelector('[aria-label="Закрыть карточку свечи"]'));
    const photo=document.querySelector('.ritual-visual img').getAttribute('src');
    assert.equal(photo,'/assets/hero.png');
    assert.equal(document.querySelector('#ritual-aroma').options.length,4);
    await selectValue(document.querySelector('#ritual-aroma'),2);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('#note-panel').textContent,/Яркое начало/);
    await click(document.querySelector('#note-tab-1'));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('#note-panel').textContent,/Мягкое сердце/);
    await click(document.querySelector('#note-tab-2'));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.match(document.querySelector('#note-panel').textContent,/Тёплый шлейф/);
    assert.equal(document.querySelector('.ritual-visual img').getAttribute('src'),photo);
    await click(document.querySelector('[aria-label="Цвет: Чёрный"]'));
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
    assert.equal(document.querySelector('.image-upload img').getAttribute('src'),candle.image);
    await click(button('Убрать фото'));
    assert.equal(document.querySelector('.image-upload img'),null);
    assert.match(document.querySelector('.candle-editor-silhouette .wax-uploaded').getAttribute('style'),/my-form\.png/);
    assert.equal(document.querySelector('.candle-editor-silhouette .wax-uploaded').style.getPropertyValue('--wax'),'#222225');
    await submit(document.querySelector('.product-editor form'));assert.equal(edited.get('removeImage'),'true');
  }finally{await act(async()=>root.unmount());URL.createObjectURL=previousCreate;URL.revokeObjectURL=previousRevoke;}
});
