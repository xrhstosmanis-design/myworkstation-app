import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFtextSalePlan} from '../src/services/ftext-sale-plan.js';
const scope={companyId:'company-a',storeId:'store-a',terminalPos:'POS-01',fiscalDeviceCode:'FISCAL-01'};
const settings={...scope,serialNumber:'SYNTHETIC01',workFolder:'C:\\Synthetic',protocol:'SOLIDUS(II)T',configurationId:'38cc2dfa-365a-4c00-aa0a-e713555352cd',lifecycleGeneration:'0'};
const fixture=()=>({scope:{...scope},settings:{...settings},clientTransactionId:'checkout-01',items:[{...scope,lineId:'line-01',productId:'product-01',description:'ΕΙΔΟΣ',quantity:'1',unitPrice:'1.25',discount:'0',lineTotal:'1.25',department:'004',vatRate:13,vatCode:'2'}],total:'1.25',payments:[{method:'CASH',amount:'1.25'}],departmentProfiles:[{...scope,department:4,vatRate:13,vatCode:'2',confirmed:true}],paymentProfiles:[{...scope,method:'CASH',code:1,confirmed:true}]});
const reject=(change,code)=>{const input=fixture();change(input);assert.throws(()=>prepareFtextSalePlan(input),e=>e.code===code);};
test('ftext plan is deterministic, data-only, exact decimal and does not mutate input',()=>{
 const input=fixture(),before=JSON.stringify(input),p=prepareFtextSalePlan(input);
 assert.equal(p.fiscalExecution,false);assert.equal(p.lines[0].department,'4');assert.equal(p.total,'1.25');assert.equal(p.lines[0].quantity,'1.000');assert.equal(p.planHash,prepareFtextSalePlan(input).planHash);assert.equal(JSON.stringify(input),before);assert.equal('command' in p,false);
 input.clientTransactionId='checkout-02';assert.notEqual(prepareFtextSalePlan(input).planHash,p.planHash);
});
test('ftext zero-rate departments remain distinct from VAT code5 and 5percent',()=>{
 const f=fixture();f.departmentProfiles=[1,3].map(department=>({...scope,department,vatRate:0,vatCode:'5',confirmed:true}));
 f.items=[1,3].map((department,i)=>({...f.items[0],lineId:'line-0'+i,department,vatRate:0,vatCode:'5',unitPrice:'1.00',lineTotal:'1.00'}));f.total='2';f.payments[0].amount='2';
 assert.deepEqual(prepareFtextSalePlan(f).lines.map(l=>[l.department,l.vatRate]),[['1','0.00'],['3','0.00']]);
 f.items[0].vatRate=5;assert.throws(()=>prepareFtextSalePlan(f),e=>e.code==='FTEXT_DEPARTMENT_MISMATCH');
});
test('ftext accepts explicit24percent goods/service mappings without inferring by VAT',()=>{
 const f=fixture();f.departmentProfiles=[5,7].map(department=>({...scope,department,vatRate:24,vatCode:'3',confirmed:true}));f.items[0]={...f.items[0],department:7,vatRate:24,vatCode:3};assert.equal(prepareFtextSalePlan(f).lines[0].department,'7');f.items[0].department=11;assert.throws(()=>prepareFtextSalePlan(f),e=>e.code==='FTEXT_DEPARTMENT_MISMATCH');
});
for(const key of Object.keys(scope))test('ftext rejects foreign '+key,()=>{
 reject(f=>f.items[0][key]='foreign','FTEXT_SCOPE_MISMATCH');reject(f=>f.scope[key]='foreign','FTEXT_SCOPE_MISMATCH');reject(f=>f.departmentProfiles[0][key]='foreign','FTEXT_DEPARTMENTS_UNCONFIRMED');reject(f=>f.paymentProfiles[0][key]='foreign','FTEXT_PAYMENT_UNCONFIRMED');
});
for(const value of ['A|PAY','A\nPAY','A\rPAY','A\tB','{h}text','😀','A\x00B',''])test('ftext rejects unsafe description '+JSON.stringify(value),()=>reject(f=>f.items[0].description=value,'FTEXT_INVALID_DESCRIPTION'));
test('ftext reconciles fractional quantity and discount using integer arithmetic',()=>{const f=fixture();Object.assign(f.items[0],{quantity:'0.125',unitPrice:'1.00',discount:'0.01',lineTotal:'0.12'});f.total=f.payments[0].amount='0.12';assert.equal(prepareFtextSalePlan(f).total,'0.12');});
test('ftext rejects unexplained totals, discounts, duplicate identities and precision',()=>{
 reject(f=>f.items[0].discount='0.01','FTEXT_LINE_TOTAL_MISMATCH');reject(f=>f.items[0].discount='2','FTEXT_LINE_TOTAL_MISMATCH');reject(f=>f.total='1.24','FTEXT_SALE_TOTAL_MISMATCH');reject(f=>f.payments[0].amount='1.24','FTEXT_PAYMENT_TOTAL_MISMATCH');reject(f=>f.items.push({...f.items[0]}),'FTEXT_DUPLICATE_LINE');reject(f=>f.items[0].quantity='0','FTEXT_INVALID_QUANTITY');
 for(const quantity of ['-1','1e3','1.0001',NaN,Infinity,null])reject(f=>f.items[0].quantity=quantity,'FTEXT_INVALID_AMOUNT');
});
test('ftext requires exact confirmed single payment mapping; never guesses card2',()=>{
 reject(f=>f.payments[0].method='CARD','FTEXT_PAYMENT_UNCONFIRMED');reject(f=>f.paymentProfiles[0].confirmed=false,'FTEXT_PAYMENT_UNCONFIRMED');reject(f=>f.paymentProfiles[0].code=2,'FTEXT_PAYMENT_CODE_INVALID');reject(f=>f.paymentProfiles.push({...f.paymentProfiles[0]}),'FTEXT_PAYMENT_UNCONFIRMED');
 for(const method of ['IRIS','CREDIT','MIXED'])reject(f=>f.payments[0].method=method,'FTEXT_PAYMENT_UNSUPPORTED');
 const f=fixture();f.payments[0].method='CARD';Object.assign(f.paymentProfiles[0],{method:'CARD',code:9});assert.equal(prepareFtextSalePlan(f).payment.code,9);
});
test('ftext refuses missing, ambiguous and unconfirmed department profiles',()=>{
 reject(f=>f.departmentProfiles=[],'FTEXT_DEPARTMENTS_UNCONFIRMED');reject(f=>f.departmentProfiles[0].confirmed=false,'FTEXT_DEPARTMENTS_UNCONFIRMED');reject(f=>f.departmentProfiles.push({...f.departmentProfiles[0]}),'FTEXT_AMBIGUOUS_DEPARTMENT');reject(f=>f.items[0].department=201,'FTEXT_INVALID_DEPARTMENT');reject(f=>f.items[0].vatCode=5,'FTEXT_DEPARTMENT_MISMATCH');
});
test('ftext VAT group codes are explicit1to5, never a percent or arbitrary identifier',()=>{for(const code of ['A','0','6','05',null]){reject(f=>f.departmentProfiles[0].vatCode=code,'FTEXT_INVALID_VAT_CODE');reject(f=>f.items[0].vatCode=code,'FTEXT_INVALID_VAT_CODE');}});
