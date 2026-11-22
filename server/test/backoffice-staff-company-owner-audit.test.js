import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {readCompanyOwnerAudit} from '../src/services/backoffice-staff-company-owner-audit.js';

const at=new Date('2026-03-29T10:00:00Z');
const filters={from:new Date('2026-03-28T22:00:00Z'),toExclusive:new Date('2026-03-29T21:00:00Z'),fromDay:'2026-03-29',toDay:'2026-03-29',storeId:null,q:'',timeFrom:null,timeTo:null,operatorId:null,terminalPos:null,eventType:null,amountMin:null,amountMax:null};
function fixture(){
 const state={foreign:false,wrongStore:false,bad:false,overflow:false,queries:[],sets:[],snapshots:0};
 const common={companyId:'company',createdAt:at,storeId:'selected',storeName:'Own store',actorId:'PRIVATE_ACTOR',actorName:'Own operator',terminalPos:'MAIN'};
 const tx={async $executeRawUnsafe(sql){assert.ok(['SET TRANSACTION READ ONLY',"SET LOCAL statement_timeout = '5000ms'"].includes(sql));state.sets.push(sql)},async $executeRaw(){assert.fail('business writer')},async $queryRaw(strings,...values){
  const sql=strings.join('?');assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/);state.queries.push({sql,values});let rows;
  if(sql.includes('FROM "StoreTransaction" t'))rows=[{...common,id:'opaque-row-1729',eventType:'SALE_CASH',amount:new Prisma.Decimal(0),description:'Own recorded receipt',supplierId:'PRIVATE_SUPPLIER',supplierName:null,shiftId:'PRIVATE_SESSION',subtractFromShift:true,reversedAt:null,reversedByName:null,reversalReason:null}];
  else if(sql.includes('FROM "PosSaleActionAudit" a'))rows=[{...common,id:'action',actionType:'PRICE_CHANGE',reason:'Own price check',saleId:'PRIVATE_SALE',relatedSaleId:'PRIVATE_ORIGINAL',details:{productName:'Own product',sku:'OWN-SKU',oldPrice:'2.30',newPrice:0,password:'PRIVATE_PASSWORD',sessionId:'PRIVATE_SESSION',changes:[{label:'password',after:'PRIVATE_PASSWORD'}]}}];
  else if(sql.includes('FROM "StoreOperatorAudit" a'))rows=[{...common,id:'operator',operatorId:'PRIVATE_OPERATOR',eventType:'OPERATOR_PIN_CHANGED',details:{pin:'PRIVATE_PIN',token:'PRIVATE_TOKEN',employeeId:'PRIVATE_EMPLOYEE',changes:[{label:'PIN',after:'PRIVATE_PIN'}]}}];
  else if(sql.includes('FROM "StockMovement" m'))rows=[{...common,id:'stock',productId:'own-product',productName:'Own stock',sku:'OWN-STOCK',quantity:new Prisma.Decimal(2),unitCost:null,movementType:'ADJUSTMENT',sourceType:'MANUAL',sourceId:'PRIVATE_REFERENCE',note:'Own adjustment'}];
  else if(sql.includes('FROM "InventoryCountEvent" e'))rows=[{...common,id:'creation',productName:'Own new product',sku:'OWN-NEW',source:'PRIVATE_SOURCE'}];
  else assert.fail('Unexpected enrichment/lookup: '+sql);
  if(state.foreign)rows[0].companyId='foreign';
  if(state.wrongStore){rows[0].storeId='PRIVATE_FOREIGN_STORE';rows[0].storeName=null}
  if(state.bad&&rows[0].details)rows[0].details.oldPrice='not-a-number';
  if(state.overflow)rows=Array.from({length:10001},()=>rows[0]);
  return rows;
 }};
 return {state,db:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');state.snapshots++;return fn(tx)}}};
}
test('audit metadata reuses the native five sources in a real read-only transaction contract and keeps native zero/reference amounts',async()=>{
 const {db,state}=fixture(),r=await readCompanyOwnerAudit(db,'company',filters);
 assert.equal(r.count,5);assert.equal(state.snapshots,1);assert.equal(state.sets.length,2);assert.equal(state.queries.length,5);
 assert.equal(r.items.find(v=>v.id==='opaque-row-1729').amount,0);
 assert.equal(r.items.find(v=>v.id==='action').amount,-2.3);
 assert.equal(r.items.find(v=>v.id==='stock').amount,null);
 assert.ok(JSON.stringify(r).includes('Own new product'));
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_/);
 assert.equal(r.videoAccessAllowed,false);assert.equal(r.onlineEventsIncluded,false);
 assert.equal(r.window.kind,'NATIVE_SOURCE_WINDOWS_THEN_METADATA_SEARCH');
 assert.ok(r.items.every(row=>!Object.hasOwn(row,'financialDetails')&&!Object.hasOwn(row,'actorId')&&!Object.hasOwn(row,'shiftId')));
});
test('search and operator filters never query or match hidden JSON, actor/session IDs or row keys',async()=>{
 for(const patch of [{q:'PRIVATE_PASSWORD'},{q:'PRIVATE_SESSION'},{q:'opaque-row-1729'},{operatorId:'PRIVATE_ACTOR'}]){
  const {db,state}=fixture(),r=await readCompanyOwnerAudit(db,'company',{...filters,...patch});assert.equal(r.count,0);
  assert.ok(state.queries.every(({values})=>!values.some(v=>typeof v==='string'&&v.includes('PRIVATE_'))));
 }
 const {db}=fixture();assert.equal((await readCompanyOwnerAudit(db,'company',{...filters,q:'Own product'})).count,1);
});
test('foreign company rows, malformed numbers and overflow are rejected; absent store joins expose no foreign identifier',async()=>{
 for(const name of ['foreign','bad','overflow']){const {db,state}=fixture();state[name]=true;await assert.rejects(readCompanyOwnerAudit(db,'company',filters),e=>e.status===503)}
 const {db,state}=fixture();state.wrongStore=true;const r=await readCompanyOwnerAudit(db,'company',filters);assert.ok(r.items.every(row=>row.storeId===null&&row.storeName===null));assert.doesNotMatch(JSON.stringify(r),/PRIVATE_/);
 await assert.rejects(readCompanyOwnerAudit(db,'company',{...filters,storeId:'selected'}),e=>e.status===503);
});
test('native audit extraction retains all original SQL, financial calculations and descriptions outside its declared adapter switches',async()=>{
 const source=await readFile(new URL('../src/routes/kiosk-reports-audit.js',import.meta.url),'utf8');
 const start=source.indexOf('export async function readOwnerAuditReport('),end=source.indexOf('\n}\nrouter.get("/audit-events",',start);assert.ok(start>0&&end>start);
 let body=source.slice(source.indexOf('\n const prisma=db;\n',start)+'\n const prisma=db;\n'.length,end);
 body=body.replace('const readableItems=(enrichSaleItems?await enrichAuditSaleItems(prisma,items,{companyId,storeId}):items).map(auditReadableRecord);','const readableItems=(await enrichAuditSaleItems(prisma,items,{companyId,storeId})).map(auditReadableRecord);').replace("videoAccessAllowed:typeof videoAccessAllowed==='function'?await videoAccessAllowed():videoAccessAllowed",'videoAccessAllowed:VIDEO_ACCESS_VALUE').trim();
 // Allow only the exact reviewed withdrawal extension; every legacy byte and
 // the original frozen hash remain protected. Its behavior has independent
 // native transaction, formatter and HTTP authorization regression coverage.
 const withdrawalAdapters=[
  ["'OWNER_CASH_WITHDRAWAL_RECORDED','SUPPLIER_CREDIT_CASH_APPLIED'", "'SUPPLIER_CREDIT_CASH_APPLIED'"],
  ['const eventAmount=r.eventType==="OWNER_CASH_WITHDRAWAL_RECORDED"?n(details.amount):','const eventAmount='],
  ['      const withdrawalDescription=r.eventType==="OWNER_CASH_WITHDRAWAL_RECORDED"?ownerWithdrawalEventDescription(details,r.createdAt):null;\n',''],
  ['const description=withdrawalDescription||transferDescription||','const description=transferDescription||']
 ];
 for(const [addition,legacy]of withdrawalAdapters){assert.equal(body.split(addition).length,2,'only the exact reviewed withdrawal adapter is permitted');body=body.replace(addition,legacy);}
 assert.equal(createHash('sha256').update(body).digest('hex'),'41177f1b2306689c4dd74c22c4a5bc52fb9d369397e95d952c07128dcb4862e2');
 assert.match(source,/videoAccessAllowed:\(\)=>hasVideoAccess\(req\)/,'Owner video-access check remains at the original late return point');
});
