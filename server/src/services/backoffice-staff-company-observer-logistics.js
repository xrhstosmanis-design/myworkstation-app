import {Prisma} from '@prisma/client';
import * as contract from '../../../shared/backoffice-staff-company-observer-logistics.mjs';
import {staffError} from './backoffice-staff-access.js';
const invalid=()=>{throw staffError(400,'STAFF_OPERATIONS_QUERY_INVALID')};
const bad=()=>{throw staffError(503,'STAFF_OPERATIONS_DATA_INVALID')};
const bound=rows=>{if(!Array.isArray(rows)||rows.length>10000)throw staffError(503,'STAFF_OPERATIONS_LIMIT');return rows};
export function operationsProject(row,map){if(!row||typeof row!=='object'||Array.isArray(row))bad();return Object.fromEntries(Object.entries(map).map(([key,spec])=>{let value=row[key];const nullable=spec.endsWith('?'),kind=spec.replace('?','');if(nullable&&value===null)return[key,null];if(kind==='text'){if(typeof value!=='string'||value.length>20000)bad()}else if(kind==='boolean'){if(typeof value!=='boolean')bad()}else if(kind==='date'){if(!(value instanceof Date)&&typeof value!=='string')bad();const d=new Date(value);if(!Number.isFinite(d.getTime()))bad();value=d.toISOString()}else {if(Prisma.Decimal.isDecimal(value))value=value.toNumber();if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER||kind==='integer'&&(!Number.isSafeInteger(value)||value<0))bad()}return[key,value]}))}
export function observerLogisticsFilters(query,route){
 if(!query||typeof query!=='object'||Array.isArray(query))invalid();
 const observer=['observer-status.read','observer-events.read'].includes(route.capability),list=route.capability==='dispatch-notes.read'&&!route.detailId,allowed=observer?['storeId',...(route.capability==='observer-events.read'?['source']:[])]:list?['storeId']:[];
 if(Object.keys(query).some(key=>!allowed.includes(key)))invalid();const f={};
 for(const key of allowed){const value=query[key];if(value!==undefined&&(typeof value!=='string'||!value||value.length>160||value.trim()!==value||/[\x00-\x1f\x7f]/.test(value)))invalid();if(value!==undefined)f[key]=value}
 if((observer||list)&&!f.storeId)invalid();if(f.source&&!['CAPDRIVER','RBS','KIOSK_MANAGER'].includes(f.source))invalid();return f;
}
// Only these known, static native readers enter this adapter. No dynamic SQL or
// native middleware is invoked. Source limits and Owner calculation code stay native.
export function operationsReadDb(db){return new Proxy(db,{get(target,key){const value=target[key];if(['$executeRaw','$executeRawUnsafe','$queryRawUnsafe','$transaction'].includes(key))return()=>bad();if(key==='$queryRaw')return async(parts,...values)=>{
 const sql=parts.join('?');if(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/i.test(sql))bad();
 const secured=parts.map(part=>part
  .replace(/JOIN "Store" s ON s\."id"=d\."storeId"/g,'JOIN "Store" s ON s."id"=d."storeId" AND s."companyId"=d."companyId"')
  .replace(/AND d\."companyId"=o\."companyId"/g,'AND d."companyId"=o."companyId" AND EXISTS(SELECT 1 FROM "Store" scopeStore WHERE scopeStore."id"=d."storeId" AND scopeStore."companyId"=d."companyId")')
  .replace(/LEFT JOIN "Product" p ON p\."id"=l\."productId"/g,'LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=(SELECT scopeNote."companyId" FROM "DispatchNote" scopeNote WHERE scopeNote."id"=l."dispatchNoteId")'));
 if(!/\bLIMIT\s+(?:\d+|\?)\s*$/i.test(sql))secured[secured.length-1]+=' LIMIT 10001';secured.raw=[...secured];return bound(await value.call(target,secured,...values));
 };return typeof value==='function'?value.bind(target):value}})}
async function ownStore(db,companyId,storeId){const rows=await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "companyId"=${companyId} AND "id"=${storeId} AND "active"=true LIMIT 1`;if(rows.length!==1)throw staffError(404,'STAFF_OPERATIONS_STORE_NOT_FOUND');return rows[0]}
async function readObserverLogisticsData(db,companyId,capability,path,query={}){
 const route=contract.observerLogisticsRequest('GET',path);if(route?.capability!==capability)throw staffError();const f=observerLogisticsFilters(query,route),readDb=operationsReadDb(db);if(f.storeId)await ownStore(db,companyId,f.storeId);
 let data;const items=(rows,map)=>bound(rows).map(row=>operationsProject(row,map));
 if(capability==='connector-store-options.read')data={items:items(await db.$queryRaw`SELECT "id","name" FROM "Store" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name","id" LIMIT 10001`,{id:'text',name:'text'}),window:{limit:10000,kind:'COMPLETE_FILTERED_SOURCE'}};
 else if(capability==='observer-status.read'){
  const native=await (await import('../routes/connector-observer.js')).readConnectorObserverStatus(companyId,f,{db:readDb});
  data={storeId:f.storeId,mode:'READ_ONLY',capabilities:{captureMetadataOnly:true,rawPayloadUpload:false,outboundCommands:false,fiscalIssuance:false,fiscalConfirmation:false},items:items(native.devices,contract.observerDeviceFields),window:{limit:10000,kind:'COMPLETE_FILTERED_SOURCE'}};
 }else if(capability==='observer-events.read'){
  const native=await (await import('../routes/connector-observer.js')).readConnectorObserverEvents(companyId,{...f,limit:200},{db:readDb});
  data={storeId:f.storeId,source:f.source??null,items:items(native.map(row=>({...row,payloadHashPrefix:hashPrefix(row.payloadHash,16,true)})),contract.observerEventFields),window:{limit:200,kind:'NATIVE_WINDOW'},fiscalConfirmation:false};
 }else if(capability==='logistics-readiness.read'){
  const native=await (await import('../routes/provider-logistics.js')).readProviderReadiness(companyId,{},null,{db:readDb});
  data={connection:operationsProject(native.connection,{providerName:'text?',environment:'text',status:'text',lastHealthAt:'date?'}),...operationsProject(native,{externalTransmissionEnabled:'boolean',sandboxRequired:'boolean',localSandboxValidationAvailable:'boolean',pendingDocuments:'integer',validatedDocuments:'integer',reconciliationErrors:'integer',message:'text'})};
 }else if(capability==='provider-outbox.read'){
  const native=await (await import('../routes/provider-logistics.js')).readProviderOutbox(companyId,{},null,{db:readDb});
  data={items:items(native.map(row=>({...row,payloadHashPrefix:hashPrefix(row.payloadHash,12)})),contract.providerOutboxFields),window:{limit:300,kind:'NATIVE_WINDOW'},externalTransmissionEnabled:false};
 }else if(capability==='dispatch-notes.read'){
  const native=await import('../routes/provider-logistics.js');
  if(route.detailId){
   const owned=await db.$queryRaw`SELECT d."id",d."storeId" FROM "DispatchNote" d JOIN "Store" s ON s."id"=d."storeId" AND s."companyId"=d."companyId" WHERE d."companyId"=${companyId} AND d."id"=${route.detailId} LIMIT 1`;
   if(owned.length!==1)throw staffError(404,'STAFF_DISPATCH_NOTE_NOT_FOUND');
   const raw=await native.readDispatchNote(companyId,{},route.detailId,{db:readDb});
   const productIds=[...new Set(bound(raw.lines).map(row=>row.productId).filter(value=>typeof value==='string'&&value))],known=productIds.length?await db.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${productIds}::text[])`:[],ownedProducts=new Set(known.map(row=>row.id));
   const after=await db.$queryRaw`SELECT d."id",d."storeId" FROM "DispatchNote" d JOIN "Store" s ON s."id"=d."storeId" AND s."companyId"=d."companyId" WHERE d."companyId"=${companyId} AND d."id"=${route.detailId} LIMIT 1`;if(after.length!==1||after[0].storeId!==owned[0].storeId)throw staffError(404,'STAFF_DISPATCH_NOTE_NOT_FOUND');
   data={note:operationsProject(raw.note,contract.dispatchNoteFields),items:items(raw.lines.map(row=>({...row,productId:ownedProducts.has(row.productId)?row.productId:null,sku:ownedProducts.has(row.productId)?row.sku:null})),contract.dispatchLineFields),window:{limit:10000,kind:'COMPLETE_FILTERED_SOURCE'},externalTransmissionEnabled:false};
  }else data={storeId:f.storeId,items:items(await native.readDispatchNotes(companyId,f,null,{db:readDb}),contract.dispatchListFields),window:{limit:300,kind:'NATIVE_WINDOW'},externalTransmissionEnabled:false};
 }else throw staffError();
 if(f.storeId)await ownStore(db,companyId,f.storeId);return {scope:'COMPANY',companyId,...data};
}

function hashPrefix(value,length,nullable=false){if(nullable&&value===null)return null;if(typeof value!=='string'||value.length>20000)bad();return value.slice(0,length)}
export async function readObserverLogistics(...args){try{return await readObserverLogisticsData(...args)}catch(error){if(error?.status===404&&!error.code)throw staffError(404,'STAFF_OPERATIONS_OBJECT_NOT_FOUND');throw error}}
