import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {z} from 'zod';
import {resolveProductCardVat,productCardVatOptions} from '../src/lib/product-card-vat.js';
const source=fs.readFileSync(new URL('../src/routes/owner-products.js',import.meta.url),'utf8');
function harness({department='dep13',rate=13,deny=false}={}){
 const routes=[],writes=[],committed=[],product={id:'p',companyId:'co',name:'Product',sku:'P',unit:'PIECE',vatRate:13,vatDepartmentId:department,salePrice:2,costPrice:1,vatVerified:true,trackStock:true,active:true};
 const query=async(parts,...values)=>{const q=parts.join('?');if(q.includes('FROM "ManagementVatDepartment"')){assert.ok(values.includes('co'));assert.match(q,/"active"=true/);return deny?[]:[{id:values[0],vatRate:rate}]};if(q.includes('SELECT p.*'))return [product];if(q.includes('FOR UPDATE'))return [{id:'p'}];if(q.includes('FROM "ProductBarcode"'))return [];if(q.includes('FROM "StoreProduct"'))return [{storeId:'store',salePrice:2,active:true}];if(q.includes('FROM "SupplierProductLink"'))return [];if(q.includes('FROM "PurchaseDocumentLine"'))return [];if(q.includes('FROM "Product"'))return [];throw Error(q)};
 const execute=async(parts,...values)=>{writes.push({q:parts.join('?'),values});return 1};
 const prisma={$queryRaw:query,store:{findMany:async()=>[{id:'store'}]},$transaction:async fn=>{const start=writes.length;try{await fn({$queryRaw:query,$executeRaw:execute});committed.push(...writes.slice(start))}catch(e){writes.splice(start);throw e}}};
 const router={get(){},post(){},delete(){},patch(path,...handlers){routes.push({path,handler:handlers.at(-1)})}};
 const context={crypto,z,prisma,resolveProductCardVat,productCardVatOptions,Router:()=>router,requireCompanyModule:()=>()=>{},XLSX:{},createScopedPromotionBatch(){},parsePromotionDate(){}};
 vm.createContext(context);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default router;',''),context);
 const handler=routes.find(r=>r.path==='/:productId/card').handler;
 const body={expectedBarcodeIds:[],name:'Product',sku:'P',description:'',unit:'PIECE',salePrice:2,costPrice:1,vatRate:13,vatVerified:true,trackStock:true,active:true,barcodes:[],supplierCodes:[],stores:[{storeId:'store',active:true,salePrice:2,minStock:null}]};
 return {writes,committed,body,run:async extra=>{let error,result;await handler({user:{companyId:'co',id:'owner'},params:{productId:'p'},body:{...body,...extra}},{status(){return this},json(v){result=v}},e=>error=e);return {error,result}}};
}
test('actual card handler persists explicit same-rate department and includes change in audit',async()=>{
 const h=harness(),{error,result}=await h.run({vatDepartmentId:'other13'});assert.ifError(error);assert.equal(result.ok,true);
 const dep=h.committed.find(x=>x.q.includes('SET "vatDepartmentId"'));assert.deepEqual(dep.values,['other13','co','p']);
 const audit=JSON.parse(h.committed.find(x=>x.q.includes('INSERT INTO "StoreOperatorAudit"')).values.at(-1));assert.ok(audit.changes.some(x=>x.field==='vatDepartmentId'&&x.before==='dep13'&&x.after==='other13'));
 assert.equal(h.committed.some(x=>x.q.includes('StockMovement')||x.q.includes('Sale"')),false);
});
for(const opts of [{deny:true},{rate:24}])test('actual card handler rolls back invalid/foreign/inactive or stale-rate department',async()=>{
 const h=harness(opts),r=await h.run({vatDepartmentId:'bad'});assert.equal(r.error.status,400);assert.equal(h.committed.length,0);
});
test('legacy card caller omitting department preserves existing mapping',async()=>{const h=harness();assert.ifError((await h.run({})).error);assert.equal(h.committed.some(x=>x.q.includes('SET "vatDepartmentId"')),false)});
test('VAT option read is active and company scoped; zero rate is a real choice',async()=>{
 let calls=0;const db={$queryRaw:async(parts,...values)=>{calls++;assert.deepEqual(values,['co']);assert.match(parts.join('?'),/"active"=true/);return [{id:'zero',vatRate:0}]}};
 assert.equal((await productCardVatOptions(db,'co'))[0].id,'zero');assert.equal(calls,1);
 const vat=await resolveProductCardVat({$queryRaw:async()=>[{id:'zero',vatRate:0}]},'co','zero',0);assert.equal(vat.vatRate,0);
});
