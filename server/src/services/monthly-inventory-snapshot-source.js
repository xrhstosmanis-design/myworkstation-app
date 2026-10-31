// Internal complete source adapter; no route, bootstrap or stock mutation.
import {readMonthlyInvoiceSnapshotProjectionInTransaction,readMonthlyInvoiceSnapshotProjectionForAutomationInTransaction,readMonthlyInvoiceSnapshotTransactionState} from './monthly-invoice-audit.js';
import {requireMonthlyCaptureContext,finishMonthlyCaptureSourceInTransaction} from './monthly-inventory-capture-authorization.js';
import {readLifecycleGeneration,normalizeLifecycleGeneration} from './store-lifecycle-generation.js';
import {monthlyInventorySnapshotPeriod} from './monthly-inventory-snapshot-period.js';

const MAX_ROWS=20000,MAX_BYTES=4*1024*1024;
const fail=(code,detail)=>{throw Object.assign(new Error(code),{code,status:422,...(detail?{detail}:{} )})};
const decimalPattern='^-?(0|[1-9][0-9]{0,17})([.][0-9]{1,12})?$';
function decimal(value){
 if(typeof value!=='string'||value.length>32||value.trim()!==value||! /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(value))fail('STOCK_SNAPSHOT_NUMERIC_INVALID');
 const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');
 return {n:BigInt(whole+fraction)*(negative?-1n:1n),scale:fraction.length};
}
function format(n,scale){
 if(n===0n)return '0';const negative=n<0n;let s=(negative?-n:n).toString().padStart(scale+1,'0');
 if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);if(scale)s=s.replace(/0+$/,'').replace(/\.$/,'');return (negative?'-':'')+s;
}
const gcd=(a,b)=>{a=a<0n?-a:a;while(b){const r=a%b;a=b;b=r}return a};
const known=value=>{if(value===null)return null;const parsed=decimal(value);return format(parsed.n,parsed.scale)};

// Original decimal operands only; never PostgreSQL division or Number money.
export function monthlySnapshotPurchaseUnitCost({found,cost,unit,packageQuantity,ambiguous,fallbackCost}){
 if(typeof found!=='boolean'||typeof ambiguous!=='boolean')fail('STOCK_SNAPSHOT_COST_INVALID');
 if(!found)return {value:known(fallbackCost),limitation:null};
 if(!['PIECE','PACKAGE'].includes(unit))fail('STOCK_SNAPSHOT_UNIT_INVALID');
 const amount=cost===null?null:decimal(cost);let pack;
 if(unit==='PACKAGE'){pack=decimal(packageQuantity);if(pack.n<=0n)fail('STOCK_SNAPSHOT_PACKAGE_INVALID')}
 if(ambiguous)return {value:false,limitation:'AMBIGUOUS_LATEST_PURCHASE_COST'};
 if(amount===null)return {value:known(fallbackCost),limitation:null};
 if(unit==='PIECE')return {value:format(amount.n,amount.scale),limitation:null};
 let numerator=amount.n*10n**BigInt(pack.scale),denominator=pack.n*10n**BigInt(amount.scale);
 const divisor=gcd(numerator,denominator);numerator/=divisor;denominator/=divisor;
 let twos=0,fives=0;while(denominator%2n===0n){denominator/=2n;twos++}while(denominator%5n===0n){denominator/=5n;fives++}
 const scale=Math.max(twos,fives);
 if(denominator!==1n||scale>12)return {value:false,limitation:'NON_REPRESENTABLE_PACKAGE_COST'};
 const integer=numerator*2n**BigInt(scale-twos)*5n**BigInt(scale-fives),value=format(integer,scale),unsigned=value.startsWith('-')?value.slice(1):value;
 if(unsigned.split('.')[0].length>18||value.length>32)return {value:false,limitation:'NON_REPRESENTABLE_PACKAGE_COST'};
 return {value,limitation:null};
}

function request(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==3)fail('STOCK_SNAPSHOT_INPUT_INVALID');
 for(const key of Reflect.ownKeys(input))if(typeof key!=='string'||!['storeId','month','lifecycleGeneration'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value'))fail('STOCK_SNAPSHOT_INPUT_INVALID');
 if(typeof input.storeId!=='string'||!input.storeId||input.storeId.trim()!==input.storeId||Buffer.byteLength(input.storeId)>160||/[\u0000-\u001f\u007f]/.test(input.storeId)||typeof input.lifecycleGeneration!=='string'||input.lifecycleGeneration.trim()!==input.lifecycleGeneration)fail('STOCK_SNAPSHOT_INPUT_INVALID');
 const lifecycleGeneration=normalizeLifecycleGeneration(input.lifecycleGeneration),period=monthlyInventorySnapshotPeriod(input.month);
 return {storeId:input.storeId,month:input.month,lifecycleGeneration,period};
}
export function normalizeMonthlyInventorySnapshotSourceInput(input){
 const selected=request(input);return Object.freeze({storeId:selected.storeId,month:selected.month,lifecycleGeneration:selected.lifecycleGeneration});
}
// Detach only the authorization fields read by the shared C core. In particular,
// do not enumerate/read unrelated credential/private getters or drop a
// restrictive support/super-admin flag while an awaited lookup is running.
export function normalizeMonthlyInventorySnapshotActor(actor){
 if(!actor||![Object.prototype,null].includes(Object.getPrototypeOf(actor)))fail('STOCK_SNAPSHOT_ACTOR_INVALID');
 const copy={};
 for(const key of ['id','companyId','role','storeId','ownerCompanyId','platformRole','isSuperAdmin','tokenType']){
  const descriptor=Object.getOwnPropertyDescriptor(actor,key);if(!descriptor)continue;
  if(!Object.hasOwn(descriptor,'value'))fail('STOCK_SNAPSHOT_ACTOR_INVALID');
  const value=descriptor.value;if(value!==null&&value!==undefined&&typeof value!==(key==='isSuperAdmin'?'boolean':'string'))fail('STOCK_SNAPSHOT_ACTOR_INVALID');
  copy[key]=value;
 }
 const support=Object.getOwnPropertyDescriptor(actor,'supportContext');
 if(support){
  if(!Object.hasOwn(support,'value'))fail('STOCK_SNAPSHOT_ACTOR_INVALID');
  const value=support.value;
  if(value===null||value===undefined)copy.supportContext=value;
  else{
   if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('STOCK_SNAPSHOT_ACTOR_INVALID');
   const selected={};for(const key of ['companyId','storeId']){const d=Object.getOwnPropertyDescriptor(value,key);if(d){if(!Object.hasOwn(d,'value')||d.value!==undefined&&d.value!==null&&typeof d.value!=='string')fail('STOCK_SNAPSHOT_ACTOR_INVALID');selected[key]=d.value}}
   copy.supportContext=Object.freeze(selected);
  }
 }
 return Object.freeze(copy);
}
const required={StoreProduct:['id','storeId','productId','currentStock','salePrice','active'],Product:['id','companyId','name','sku','unit','salePrice','costPrice','active'],PurchaseDocumentLine:['id','purchaseDocumentId','productId','unit','unitCost','unitsPerPackage'],PurchaseDocument:['id','companyId','storeId','status','documentDate','createdAt']};
const safeDecimal=expression=>`CASE WHEN ${expression} IS NULL THEN TRUE WHEN octet_length(${expression})<=32 THEN ${expression} !~ '[^0-9.-]' AND ${expression} ~ '${decimalPattern}' ELSE FALSE END`;
const validCost=alias=>`(${alias}."unit" IN ('PIECE','PACKAGE') AND ${safeDecimal(alias+'."unitCost"::text')} AND (${alias}."unit"<>'PACKAGE' OR (${alias}."unitsPerPackage">0 AND ${safeDecimal(alias+'."unitsPerPackage"::text')} AND ${alias}."unitsPerPackage" IS NOT NULL)))`;
const bounded=(expression,max)=>`CASE WHEN octet_length(${expression})<=${max} THEN ${expression} ELSE NULL END`;
const retail='COALESCE(sp."salePrice",p."salePrice")::text',fallback='p."costPrice"::text';
const tied=`d."documentDate" IS NOT DISTINCT FROM latest."documentDate" AND d."createdAt" IS NOT DISTINCT FROM latest."createdAt"`;
const costScope=`d."companyId"=$1 AND d."storeId"=$2 AND d."status"='APPROVED' AND l."productId"=p."id"`;
// Each cost lookup is an anchor plus EXISTS probes, never an expanding join or
// DISTINCT aggregation over an unbounded collection of tied cost facts.
const stockSql=`WITH source AS MATERIALIZED (
 SELECT ${bounded('p."id"',160)} AS "id",${bounded('p."name"',512)} AS "name",${bounded('COALESCE(p."sku",\'\')',128)} AS sku,${bounded('p."unit"',48)} AS "unit",${bounded('sp."currentStock"::text',32)} AS quantity,
 ${bounded(retail,32)} AS retail,
 CASE WHEN latest.found AND latest.cost IS NOT NULL THEN NULL ELSE ${bounded(fallback,32)} END AS fallback,
 COALESCE(latest.found,FALSE) AS found,latest.cost,latest.cost_unit,latest.pack,
 (${safeDecimal('sp."currentStock"::text')} AND sp."currentStock" IS NOT NULL AND ${safeDecimal(retail)} AND ${safeDecimal(fallback)}) AS fields_valid,
 CASE WHEN latest.found THEN NOT COALESCE(latest.valid,FALSE) OR EXISTS(SELECT 1 FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE ${costScope} AND ${tied} AND NOT COALESCE(${validCost('l')},FALSE)) ELSE FALSE END AS invalid_cost,
 CASE WHEN latest.found AND latest.valid THEN EXISTS(SELECT 1 FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE ${costScope} AND ${tied} AND CASE WHEN ${validCost('l')} THEN ROW(l."unitCost"::text,l."unit",CASE WHEN l."unit"='PACKAGE' THEN l."unitsPerPackage"::text ELSE NULL END) IS DISTINCT FROM ROW(latest.cost,latest.cost_unit,latest.pack) ELSE FALSE END) ELSE FALSE END AS ambiguous,
 (sp."active"=TRUE AND p."active"=TRUE) AS active,(sp."active" IS NOT NULL AND p."active" IS NOT NULL) AS status_valid
 FROM "StoreProduct" sp LEFT JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=$1
 LEFT JOIN LATERAL (SELECT TRUE AS found,${bounded('l."unitCost"::text',32)} AS cost,CASE WHEN l."unit" IN ('PIECE','PACKAGE') THEN l."unit" ELSE NULL END AS cost_unit,CASE WHEN l."unit"='PACKAGE' THEN ${bounded('l."unitsPerPackage"::text',32)} ELSE NULL END AS pack,COALESCE(${validCost('l')},FALSE) AS valid,d."documentDate",d."createdAt" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE ${costScope} ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1) latest ON TRUE
 WHERE sp."storeId"=$2
), shaped AS MATERIALIZED (
 SELECT "id",active,invalid_cost,
 CASE WHEN "id" IS NOT NULL AND octet_length("id") BETWEEN 1 AND 160 AND "name" IS NOT NULL AND octet_length("name")<=512 AND sku IS NOT NULL AND octet_length(sku)<=128 AND "unit" IS NOT NULL AND octet_length("unit") BETWEEN 1 AND 48 AND quantity IS NOT NULL AND fields_valid AND NOT invalid_cost AND status_valid
 THEN jsonb_build_object('id',"id",'name',"name",'sku',sku,'unit',"unit",'quantity',quantity,'retailUnitPrice',retail,'found',found,'cost',cost,'costUnit',cost_unit,'packageQuantity',pack,'ambiguous',ambiguous,'fallbackCost',fallback) ELSE NULL END AS "row"
 FROM source
), stats AS MATERIALIZED (
 SELECT COUNT(*)::text AS count,COUNT("id")::text AS linked,COUNT(DISTINCT "id")::text AS unique_count,COUNT("row")::text AS valid_count,COUNT(*) FILTER(WHERE invalid_cost)::text AS invalid_cost_count,COUNT(*) FILTER(WHERE active)::text AS active_count,COALESCE(SUM(octet_length("row"::text)),0)::text AS bytes FROM shaped
)
SELECT stats.*,CASE WHEN count::bigint<=20000 AND linked=count AND unique_count=count AND valid_count=count AND bytes::bigint+2*count::bigint+2<=4194304 THEN (SELECT COALESCE(jsonb_agg("row" ORDER BY "id"),'[]'::jsonb) FROM shaped) ELSE '[]'::jsonb END AS rows FROM stats`;
const count=(value,code)=>{if(typeof value!=='string'||! /^\d+$/.test(value)||BigInt(value)>BigInt(MAX_ROWS))fail(code);return Number(value)};
function label(value,max,{empty=false}={}){if(typeof value!=='string'||Buffer.byteLength(value)>max||/[\u0000-\u001f\u007f]/.test(value)||(!empty&&(!value||value.trim()!==value)))fail('STOCK_SNAPSHOT_TEXT_INVALID');return value}

export async function readMonthlyInventorySnapshotSourcesInTransaction(tx,actor,input){
 if(arguments.length!==3)fail('STOCK_SNAPSHOT_INPUT_INVALID');
 const selected=request(input),principal=normalizeMonthlyInventorySnapshotActor(actor),entry=await readMonthlyInvoiceSnapshotTransactionState(tx);
 if(entry.transactionStartedAt<selected.period.scheduledFor)fail('SNAPSHOT_BEFORE_DUE');
 const invoices=await readMonthlyInvoiceSnapshotProjectionInTransaction(tx,principal,{storeId:selected.storeId,month:selected.month});
 return readCompleteSources(tx,selected,entry,invoices);
}

// Only an actual job authorization in this same held source transaction admits
// this entry. A role-shaped object is never substituted for a logged-in user.
export async function readMonthlyInventorySnapshotSourcesForAutomationInTransaction(tx,context){
 if(arguments.length!==2)fail('STOCK_SNAPSHOT_INPUT_INVALID');
 const scope=requireMonthlyCaptureContext(tx,context,'SOURCE');
 const selected=request({storeId:scope.storeId,month:scope.month,lifecycleGeneration:scope.lifecycleGeneration}),entry=await readMonthlyInvoiceSnapshotTransactionState(tx);
 if(entry.transactionStartedAt<selected.period.scheduledFor)fail('SNAPSHOT_BEFORE_DUE');
 const invoices=await readMonthlyInvoiceSnapshotProjectionForAutomationInTransaction(tx,context);
 if(invoices.companyId!==scope.companyId||invoices.storeId!==scope.storeId)fail('STOCK_SNAPSHOT_SOURCE_INCOMPLETE');
 const result=await readCompleteSources(tx,selected,entry,invoices);
 await finishMonthlyCaptureSourceInTransaction(tx,context);
 return result;
}

async function readCompleteSources(tx,selected,entry,invoices){
 if(!invoices.coverage.complete||!invoices.freezeEligibility.eligible)fail('STOCK_SNAPSHOT_INVOICE_SOURCE_INCOMPLETE',invoices.freezeEligibility.reasons);
 const scope={companyId:invoices.companyId,storeId:invoices.storeId},generation=await readLifecycleGeneration(tx,scope);
 if(!generation.enrolled)fail('MONTHLY_SNAPSHOT_ENROLLMENT_REQUIRED');
 if(generation.maintenance||generation.retired)fail('STORE_LIFECYCLE_MAINTENANCE');
 if(generation.generation!==selected.lifecycleGeneration)fail('STORE_LIFECYCLE_STALE_GENERATION');
 const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,Object.keys(required));
 if(Object.entries(required).some(([table,names])=>names.some(name=>!columns.some(c=>c.table===table&&c.column===name))))fail('STOCK_SNAPSHOT_SOURCE_UNAVAILABLE');
 const base=(await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "StoreProduct" WHERE "storeId"=$1',scope.storeId))[0];
 const expected=count(base?.count,'STOCK_SNAPSHOT_ROW_LIMIT');
 // Check link multiplicity BEFORE cost probes or row JSON construction. A
 // removed/changed unique constraint must not produce a Cartesian projection.
 const links=(await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS count,COUNT(p."id")::text AS linked,COUNT(DISTINCT CASE WHEN octet_length(p."id")<=160 THEN p."id" ELSE NULL END)::text AS unique_count FROM "StoreProduct" sp LEFT JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=$1 WHERE sp."storeId"=$2',scope.companyId,scope.storeId))[0];
 if(!links||['count','linked','unique_count'].some(key=>links[key]!==String(expected)))fail('STOCK_SNAPSHOT_LINKS_INVALID');
 const result=(await tx.$queryRawUnsafe(stockSql,scope.companyId,scope.storeId))[0];
 if(!result)fail('STOCK_SNAPSHOT_SOURCE_INCOMPLETE');
 for(const key of ['count','linked','unique_count','valid_count','invalid_cost_count','active_count'])count(result[key],'STOCK_SNAPSHOT_SOURCE_INCOMPLETE');
 if(result.count!==String(expected)||result.linked!==result.count||result.unique_count!==result.count)fail('STOCK_SNAPSHOT_LINKS_INVALID');
 if(result.invalid_cost_count!=='0')fail('STOCK_SNAPSHOT_COST_INVALID');
 if(result.valid_count!==result.count)fail('STOCK_SNAPSHOT_SOURCE_FIELDS_INVALID');
 if(typeof result.bytes!=='string'||! /^\d+$/.test(result.bytes)||BigInt(result.bytes)+2n*BigInt(expected)+2n>BigInt(MAX_BYTES))fail('STOCK_SNAPSHOT_PAYLOAD_LIMIT');
 if(!Array.isArray(result.rows)||result.rows.length!==expected)fail('STOCK_SNAPSHOT_SOURCE_INCOMPLETE');
 const stockCostLimitations={NON_REPRESENTABLE_PACKAGE_COST:0,AMBIGUOUS_LATEST_PURCHASE_COST:0};let budget=1024;
 const products=result.rows.map(row=>{
  const cost=monthlySnapshotPurchaseUnitCost({found:row.found,cost:row.cost,unit:row.costUnit,packageQuantity:row.packageQuantity,ambiguous:row.ambiguous,fallbackCost:row.fallbackCost});
  if(cost.limitation)stockCostLimitations[cost.limitation]++;
  const value={id:label(row.id,160),...scope,name:label(row.name,512,{empty:true}),sku:label(row.sku,128,{empty:true}),unit:label(row.unit,48),quantity:known(row.quantity),retailUnitPrice:known(row.retailUnitPrice),purchaseUnitCost:cost.value};
  budget+=Buffer.byteLength(JSON.stringify(value))+1;if(budget>MAX_BYTES)fail('STOCK_SNAPSHOT_PAYLOAD_LIMIT');return value;
 });
 if(new Set(products.map(p=>p.id)).size!==expected)fail('STOCK_SNAPSHOT_LINKS_INVALID');
 const finished=await readMonthlyInvoiceSnapshotTransactionState(tx);
 if(finished.transactionStartedAt!==entry.transactionStartedAt||finished.readAt<entry.readAt)fail('INVOICE_SNAPSHOT_TRANSACTION_CHANGED');
 return {...scope,lifecycleGeneration:generation.generation,period:selected.period,products,invoices:invoices.invoices,pendingOriginals:invoices.pendingOriginals,coverage:{complete:true,productCount:expected,invoiceCount:invoices.coverage.invoiceCount,pendingOriginalCount:invoices.coverage.pendingOriginalCount},stockCostLimitations,stockPopulation:{basis:'ALL_STORE_PRODUCT_ROWS',activeCount:Number(result.active_count),inactiveCount:expected-Number(result.active_count)},observation:{transactionStartedAt:entry.transactionStartedAt,readStartedAt:entry.readAt,readFinishedAt:finished.readAt,snapshotBasis:'HELD_REPEATABLE_READ_TRANSACTION',authorizationBasis:'ASSESSED_IN_HELD_TRANSACTION_SNAPSHOT'}};
}
