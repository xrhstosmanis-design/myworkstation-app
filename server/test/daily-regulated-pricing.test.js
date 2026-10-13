import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DAILY_REGULATED_COMPANY_ID as companyId,DAILY_REGULATED_STORE_ID as storeId,DAILY_REGULATED_PRODUCTS,applyDailyRegulatedOnlinePrice} from '../../shared/daily-regulated-pricing.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const bootstrap=read('../src/kat-online-ordering-bootstrap.js');
const declarations=['onlineUnitPrice','onlineSurchargeAmount'].map(name=>bootstrap.split('\n').find(line=>line.startsWith(`export const ${name}=`)).replace('export const ','var ')).join('\n');
const context=vm.createContext({applyDailyRegulatedOnlinePrice});
vm.runInContext(declarations,context);
const {onlineUnitPrice,onlineSurchargeAmount}=context;
const scope={companyId,storeId};
const config={...scope,surchargeType:'FIXED',surchargeValue:0.10};
const product=DAILY_REGULATED_PRODUCTS.find(row=>row.sku==='DB000002');
const store={id:storeId,companyId,name:'DAILY'};
const money=n=>Math.round(Number(n||0)*100)/100;

test('actual exported pricing exempts every confirmed identity and caps stale prices',()=>{
  for(const p of DAILY_REGULATED_PRODUCTS){
    assert.equal(onlineUnitPrice(p.maxPrice,config,p),p.maxPrice);
    assert.equal(onlineSurchargeAmount(p.maxPrice,config,p),0);
    assert.equal(onlineUnitPrice(p.maxPrice+0.6,config,p),p.maxPrice);
    assert.equal(onlineUnitPrice(1,config,p),1);
    assert.equal(onlineUnitPrice(0,config,p),0);
    assert.equal(onlineUnitPrice(p.maxPrice,{...config,surchargeType:'PERCENT',surchargeValue:50},p),p.maxPrice);
  }
});

test('company/store/identity boundaries preserve all legacy and unrelated prices',()=>{
  for(const foreign of [{...scope,companyId:'other'},{...scope,storeId:'other'},{}])
    assert.equal(onlineUnitPrice(1.65,{...config,...foreign},product,foreign),1.75);
  for(const p of [null,{}, {id:'unknown',name:'FREDDO ESPRESSO',sku:'DB000002'}, {id:'24397aa6-20a7-4c10-93a6-1717a415b7b6'}])
    assert.equal(onlineUnitPrice(2.25,config,p),2.35);
  assert.equal(onlineUnitPrice(4.8,{surchargeType:'FIXED',surchargeValue:0.5}),5.3);
  assert.equal(onlineUnitPrice(4.8,{surchargeType:'PERCENT',surchargeValue:10}),5.28);
  assert.throws(()=>onlineUnitPrice(NaN,config,product));
  assert.throws(()=>onlineUnitPrice(-1,config,product));
});

test('actual public and admin catalogue projections use selected scope and DB identity',()=>{
  const fixture={...product,name:'FREDDO ESPRESSO',storePrice:2.25,vatRate:13,currentStock:0,trackStock:false};
  const common={store,config,rows:[fixture],products:[fixture],money,onlineUnitPrice,onlineSurchargeAmount,policyAvailable:()=>null,stockCheckEnabled:false,req:{params:{companyId}},res:{json:value=>{common.result=value;}}};
  const simple=read('../src/routes/kat-online-ordering.js').split('\n').find(l=>l.includes('products:rows.filter(row=>policyAvailable'));
  vm.runInNewContext(simple,common);
  assert.equal(common.result.products[0].onlinePrice,1.65);
  const admin=read('../src/routes/platform-admin.js').split('\n').find(l=>l.includes('products:products.map(row=>({...row,storePrice:'));
  vm.runInNewContext(admin,common);
  assert.equal(common.result.products[0].onlinePrice,1.65);
  const modified=read('../src/routes/kat-online-ordering-modifiers.js').split('\n').find(l=>l.includes('products:products.filter(p=>policyAvailable'));
  Object.assign(common,{member:{memberType:'DOCTOR'},memberDiscount:()=>10,specialPrice:(p)=>money(p*.9),groups:[],onlineStoreOpen:()=>true,onlineProductAvailable:()=>true,groupsForProduct:()=>[]});
  vm.runInNewContext(modified,common);
  assert.equal(common.result.products[0].onlinePrice,1.49);
});

test('actual order calculations match catalogue with quantities, discounts and optional extras',()=>{
  const fixture={...product,name:'FREDDO ESPRESSO',storePrice:2.25,currentStock:0};
  const simple=read('../src/routes/kat-online-ordering.js').split('\n');
  const start=simple.findIndex(l=>l.includes('const unit=onlineUnitPrice(product.storePrice'));
  const c={product:fixture,store,config,item:{quantity:3,modifiers:[]},money,onlineUnitPrice,onlineSurchargeAmount,lines:[]};
  vm.runInNewContext(simple.slice(start,start+2).join('\n'),c);
  assert.equal(c.lines[0].onlineUnitPrice,1.65);assert.equal(c.lines[0].lineTotal,4.95);
  const loop=read('../src/routes/kat-online-ordering-modifiers.js').split('\n').find(l=>l.includes('for(const item of body.items){const product=byId.get'));
  const m={...c,body:{items:[{productId:product.id,quantity:2,modifierIds:['extra']}]},byId:new Map([[product.id,fixture]]),groups:[],modifierById:new Map([['extra',{id:'extra',groupId:'g',groupDescription:'EXTRA',description:'Extra dose',price:.6}]]),groupsForProduct:()=>['g'],onlineProductAvailable:()=>true,member:{memberType:'DOCTOR'},specialPrice:p=>money(p*.9),lines:[],res:{status:()=>{throw new Error('unexpected denial');}}};
  vm.runInNewContext(`(function(){${loop}})()`,m);
  assert.equal(m.lines[0].onlineUnitPrice,2.09);assert.equal(m.lines[0].lineTotal,4.18);
  assert.equal(m.lines[0].modifiers[0].price,.6);
});

test('actual admin state update retains cap when fixed/percentage draft surcharge changes',()=>{
  const source=read('../../client/src/components/platform/OnlineStoreManager.jsx');
  const legacy=source.split('\n').find(l=>l.startsWith('const onlinePrice='));
  const updater=source.split('\n').find(l=>l.includes('const updateSettings='));
  let state={company:{id:companyId},store,settings:config,products:[{...product,storePrice:2.25},{id:'other',storePrice:2.25}]};
  const c={applyDailyRegulatedOnlinePrice,defaultHours:{},setManager:fn=>{state=fn(state);}};
  vm.runInNewContext(`${legacy}\n${updater}\nupdateSettings('surchargeValue',1);`,c);
  assert.equal(state.products[0].onlinePrice,1.65);assert.equal(state.products[1].onlinePrice,3.25);
});
