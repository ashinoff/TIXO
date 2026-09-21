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
const products=['Спираль','Ракушка'].map((name,i)=>({id:i+1,name,shape:i?'shell':'twist',notes:'Форма',price:1500,stock:3,published:true,image:null,hasVariants:false,variants:[]}));
const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}));
const button=(name)=>[...document.querySelectorAll('button')].find(node=>node.textContent.includes(name));
const click=async node=>{assert.ok(node);await act(async()=>node.click());};
const setValue=async(node,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};

test('one scent selection updates every form, cart keeps prior colors and shared stock limits additions',async()=>{
  window.localStorage.clear();
  globalThis.fetch=async url=>url==='/api/products'?response(products):url==='/api/scents'?response(scents):response({});
  const root=createRoot(document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(Home)));
    assert.equal(document.querySelectorAll('.catalog-scent').length,4);
    assert.equal(document.querySelectorAll('.product-card').length,2);
    await click(document.querySelector('.quick-add'));
    for(const scent of scents.slice(1)) {
      await click(button(scent.name));
      assert.deepEqual([...document.querySelectorAll('.product-card')].map(node=>node.dataset.scentId),[String(scent.id),String(scent.id)]);
      assert.ok([...document.querySelectorAll('.product-category')].every(node=>node.textContent===scent.name));
    }
    await click(document.querySelector('.quick-add'));
    await click(button('Белая ваниль'));
    await click(document.querySelector('.quick-add'));
    await click(button('Сандал и дым'));
    await click(document.querySelector('.quick-add'));
    await click(document.querySelector('.cart-trigger'));
    assert.equal(document.querySelectorAll('.cart-item').length,3);
    const cart=document.querySelector('.cart-items').textContent;
    assert.match(cart,/Вишня и миндаль/);assert.match(cart,/Роза и пион/);assert.match(cart,/Белая ваниль/);assert.doesNotMatch(cart,/Сандал и дым/);
  } finally {await act(async()=>root.unmount());}
});

test('custom recipe snapshots survive edits and checkout retries reuse the same request',async()=>{
  window.localStorage.clear();
  const sent=[];
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/products')return response(products);
    if(url==='/api/scents')return response(scents);
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
  let edited; let brokenOrders=true;
  globalThis.fetch=async(url,init={})=>{
    if(url==='/api/admin/session') return response({authenticated:true});
    if(url==='/api/products?admin=1') return response(products);
    if(url==='/api/scents?admin=1') return response(edited?[edited,...scents.slice(1)]:scents);
    if(url==='/api/scents/1' && init.method==='PATCH') {edited=JSON.parse(init.body);return response(edited);}
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
    await setValue(document.querySelector('input[placeholder="Например, Вишня и миндаль"]'),'Моя вишня');
    await act(async()=>document.querySelector('.scent-editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(edited.name,'Моя вишня');assert.ok(document.querySelector('.admin-shell'));
    assert.equal(document.querySelector('[role=dialog]'),null);
    assert.match(document.querySelector('.scent-admin-card h2').textContent,/Моя вишня/);
    brokenOrders=false;
    await click(button('Заказы'));await click(button('Обновить данные'));
    assert.equal(document.querySelector('[role=alert]'),null);
    await click(button('Формы свечей'));await click(button('Добавить форму'));
    assert.match(document.querySelector('[role=dialog]').textContent,/Все включённые ароматы уже доступны/);
    assert.equal(document.querySelector('.stock-details').open,false);
  } finally {await act(async()=>root.unmount());}
});
