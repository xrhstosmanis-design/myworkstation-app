import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFtextPromotionItems} from '../src/services/ftext-promotion-lines.js';
import {assertFtextSimpleCash,prepareFtextCheckoutPlan} from '../src/services/ftext-cash-requests.js';
const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'};
const settings={...scope,serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0',cashEnabled:true,cashDepartments:[{department:5,vatRate:24,vatCode:'3'},{department:4,vatRate:13,vatCode:'2'}],cardEnabled:true,cardPayment:{code:2,posTerminalId:1,transactionType:6,resultFormat:'POS_LINE8_OS7',confirmed:true}};
const item=()=>({productId:'product-a',name:'SYNTHETIC OFFER',quantity:8,unitPrice:2.4,effectiveUnitPrice:2,discount:3.2,lineTotal:16,fiscalDepartment:5,vatRate:24,promotionId:'promo-a',promotionType:'LEAFLET',priceSource:'LEAFLET'});
const input=(items=[item()],summary={subtotal:19.2,discount:3.2,total:16},method='CASH')=>({settings,scope,clientTransactionId:'checkout-promo',checkout:{paymentMethod:method},items,summary});
test('FTEXT offer price is subtracted once; immutable original totals and promotion retained',()=>{
 for(const method of ['CASH','CARD']){
 const f=input(undefined,undefined,method),before=structuredClone(f);assert.doesNotThrow(()=>assertFtextSimpleCash({...f.checkout,paymentMethod:'CASH'},f.items));
 const plan=prepareFtextCheckoutPlan(f);assert.equal(plan.total,'16.00');assert.equal(plan.payment.method,method);assert.deepEqual(plan.lines.map(l=>[l.quantity,l.unitPrice,l.discount,l.lineTotal,l.department,l.vatCode]),[['8.000','2.00','0.00','16.00','5','3']]);assert.deepEqual(f,before);assert.equal(plan.planHash,prepareFtextCheckoutPlan(f).planHash);
 }
});
test('FTEXT bundle rounding preserves every quantity and cent, including zero-price gift lines',()=>{
 const f=input([{...item(),quantity:3,unitPrice:2,effectiveUnitPrice:1.33,discount:2,lineTotal:4,promotionType:'GIFT',priceSource:'GIFT'}],{subtotal:6,discount:2,total:4});
 const p=prepareFtextCheckoutPlan(f);assert.deepEqual(p.lines.map(l=>[l.quantity,l.unitPrice,l.lineTotal]),[['2.000','1.33','2.66'],['1.000','1.34','1.34']]);
 const gift={...item(),productId:'gift-a',quantity:1,unitPrice:2.4,effectiveUnitPrice:0,discount:2.4,lineTotal:0,promotionType:'GIFT',priceSource:'GIFT'};
 const mixed=input([item(),gift],{subtotal:21.6,discount:5.6,total:16});assert.equal(prepareFtextCheckoutPlan(mixed).lines[1].unitPrice,'0.00');
});
test('FTEXT promotion totals, precision, metadata, VAT and checkout exclusions fail closed',()=>{
 for(const patch of [{lineTotal:15.99},{discount:3.19},{effectiveUnitPrice:1.99},{unitPrice:2.41},{promotionType:'UNKNOWN'},{priceSource:'MANUAL'},{promotionId:''},{quantity:.5},{quantity:0},{lineTotal:-1},{discount:NaN},{lineTotal:'1e2'},{fiscalDepartment:4},{vatRate:13}]){
 const f=input([{...item(),...patch}]);assert.throws(()=>prepareFtextCheckoutPlan(f),JSON.stringify(patch));
 }
 for(const patch of [{subtotal:19.19},{discount:3.19},{total:15.99}])assert.throws(()=>prepareFtextCheckoutPlan(input(undefined,{subtotal:19.2,discount:3.2,total:16,...patch})));
 for(const patch of [{customerId:'customer'},{redeemPoints:1},{payments:[{}]},{audience:'STAFF'},{operationChannel:'DELIVERY_DELAYED'}])assert.throws(()=>assertFtextSimpleCash({paymentMethod:'CASH',...patch},[item()]));
 assert.throws(()=>assertFtextSimpleCash({paymentMethod:'CASH'},[{...item(),promotionId:null,promotionType:null,discount:1}]));
});
test('cent allocation invariant over bounded quantities and final amounts, mixed VAT stays distinct',()=>{
 for(let q=1;q<=50;q++)for(const n of [0,1,q-1,q,q+1,Math.min(137,q*200),q*200]){
 const total=n/100,effective=Number((total/q).toFixed(2)),discount=(q*200-n)/100;
 const f=input([{...item(),quantity:q,unitPrice:2,effectiveUnitPrice:effective,discount,lineTotal:total,promotionType:'GIFT',priceSource:'GIFT'}],{subtotal:q*2,discount,total});
 const projected=projectFtextPromotionItems(f.items,f.summary);assert.equal(projected.reduce((s,l)=>s+l.quantity,0),q);assert.equal(projected.reduce((s,l)=>s+Math.round(Number(l.lineTotal)*100),0),n);assert.ok(projected.length<=2);
 }
 const second={...item(),productId:'product-b',fiscalDepartment:4,vatRate:13};const p=prepareFtextCheckoutPlan(input([item(),second],{subtotal:38.4,discount:6.4,total:32}));assert.deepEqual(p.lines.map(l=>[l.department,l.vatRate,l.vatCode]),[['5','24.00','3'],['4','13.00','2']]);
});

test('POS half-cent display rounding never changes final fiscal cents',()=>{
 const f=input([{...item(),quantity:2,unitPrice:1.5,effectiveUnitPrice:Number((2.01/2).toFixed(2)),discount:.99,lineTotal:2.01}],{subtotal:3,discount:.99,total:2.01});
 assert.equal(f.items[0].effectiveUnitPrice,1);
 assert.deepEqual(prepareFtextCheckoutPlan(f).lines.map(l=>[l.quantity,l.unitPrice,l.lineTotal]),[['1.000','1.00','1.00'],['1.000','1.01','1.01']]);
});
