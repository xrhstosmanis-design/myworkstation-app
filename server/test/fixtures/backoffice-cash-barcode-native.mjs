import assert from 'node:assert/strict';
export function nativeCashBarcodeSeedPlan(){
 const rows=[],add=(table,row)=>rows.push({table,row});
 for(const [id,companyId,storeId]of [['own','company','selected'],['sibling','company','sibling'],['foreign','foreign','selected']]){
  const productId='legacy81-product-'+(id==='sibling'?'own':id),barcodeId='legacy85-barcode-'+id;
  add('ProductBarcode',{id:barcodeId,productId,barcode:'LEGACY85-'+id});
  add('ProductBarcodePriceRequest',{id:'legacy85-request-'+id,companyId,storeId,productId,barcodeId,barcode:'LEGACY85-'+id,oldPrice:null,requestedPrice:0,requestedBy:'staff',requestedByName:id==='own'?'Native requester':'LEGACY85_PRIVATE_CANARY'});
 }
 for(const [id,companyId,storeId,source,quantity,lineTotal]of [['own','company','selected','POS',2,5],['return','company','selected','POS',-1,-2],['waste','company','selected','WASTE',100,100],['sibling','company','sibling','POS',100,100],['foreign','foreign','selected','POS',100,100]]){
  const saleId='legacy85-sale-'+id;
  add('Sale',{id:saleId,companyId,storeId,source,status:'COMPLETED',total:lineTotal,occurredAt:new Date('2026-11-03T12:00Z')});
  add('SaleLine',{id:'legacy85-line-'+id,saleId,productId:'legacy81-product-'+(id==='foreign'?'foreign':'own'),description:id==='foreign'?'LEGACY85_PRIVATE_CANARY':'Native barcode line',scannedBarcode:'LEGACY85-own',quantity,lineTotal});
 }
 return rows;
}
export async function verifyNativeCashBarcode({db,get,prefix,mutate}){
 const before=(await db.$queryRawUnsafe('SELECT "capabilities","revision" FROM "BackofficeStaffGrant" WHERE "userId"=\'staff\' AND "storeId"=\'selected\''))[0];
 const caps=[...before.capabilities,'cash-daily-summary.read','cash-session-investigation.read','barcode-price-requests.read','barcode-sales.read'];
 const restore=()=>mutate('UPDATE "BackofficeStaffGrant" SET "capabilities"=$1::jsonb,"revision"=$2 WHERE "userId"=\'staff\' AND "storeId"=\'selected\'',JSON.stringify(before.capabilities),before.revision);
 try{
  await mutate('UPDATE "BackofficeStaffGrant" SET "capabilities"=$1::jsonb,"revision"="revision"+1 WHERE "userId"=\'staff\' AND "storeId"=\'selected\'',JSON.stringify(caps));
  const daily=await get(prefix+'/cash-daily-summary?from=2026-11-03&to=2026-11-03');assert.equal(daily.status,200,JSON.stringify(daily));assert.equal(daily.body.scope,'STORE');assert.equal(daily.body.storeId,'selected');assert.ok(daily.body.sessions.some(row=>row.id==='legacy81-shift-own'&&row.cashSales===20));assert.ok(daily.body.sessions.every(row=>!row.id.includes('sibling')&&!row.id.includes('foreign')));
  await mutate('UPDATE "CashShiftSession" SET "variance"=NULL WHERE "id"=\'legacy81-shift-own\'');try{const nullable=await get(prefix+'/cash-daily-summary?from=2026-11-03&to=2026-11-03');assert.equal(nullable.status,200,JSON.stringify(nullable));const row=nullable.body.sessions.find(s=>s.id==='legacy81-shift-own');assert.equal(row.variance,null);assert.equal(row.effectiveVariance,0,'native effective variance remains0 while missing stored variance remainsNULL')}finally{await mutate('UPDATE "CashShiftSession" SET "variance"=0 WHERE "id"=\'legacy81-shift-own\'')}
  const investigation=await get(prefix+'/cash-investigation/legacy81-shift-own');assert.equal(investigation.status,200,JSON.stringify(investigation));assert.equal(investigation.body.initialVariance,0);assert.equal(investigation.body.additionalEvidence.chatAuthorized,false);assert.ok(investigation.body.additionalEvidence.lines.some(line=>line.includes('Δεν υπάρχει πρόσβαση')));assert.equal((await get(prefix+'/cash-investigation/legacy81-shift-sibling')).status,404);
  const requests=await get(prefix+'/barcode-price-requests?status=ALL');assert.equal(requests.status,200,JSON.stringify(requests));const request=requests.body.items.find(row=>row.id==='legacy85-request-own');assert.equal(request.oldPrice,null);assert.equal(request.requestedPrice,0);assert.ok(!requests.body.items.some(row=>row.id==='legacy85-request-sibling'||row.id==='legacy85-request-foreign'));assert.doesNotMatch(JSON.stringify(requests.body),/LEGACY85_PRIVATE_CANARY|requestedBy"|barcodeId"/);
  const report=await get(prefix+'/barcode-sales?from=2026-11-03&to=2026-11-03');assert.equal(report.status,200,JSON.stringify(report));const product=report.body.products.find(row=>row.productId==='legacy81-product-own');assert.equal(product.quantity,1);assert.equal(product.revenue,3);assert.deepEqual(product.barcodes,[{barcode:'LEGACY85-own',quantity:1,revenue:3}]);assert.ok(!report.body.products.some(row=>row.productId==='legacy81-product-foreign'));
  assert.equal((await get(prefix+'/barcode-price-requests?status=BAD')).status,403);assert.equal((await get(prefix+'/barcode-sales?from=2026-02-30&to=2026-03-01')).status,403);
  await mutate('UPDATE "CompanyModule" SET "active"=false WHERE "companyId"=\'company\' AND "moduleKey"=\'STORE_MODE\'');try{assert.equal((await get(prefix+'/barcode-price-requests')).status,403);assert.equal((await get(prefix+'/cash-investigation/legacy81-shift-own')).status,200)}finally{await mutate('UPDATE "CompanyModule" SET "active"=true WHERE "companyId"=\'company\' AND "moduleKey"=\'STORE_MODE\'')}
  await mutate('UPDATE "CompanyModule" SET "active"=false WHERE "companyId"=\'company\' AND "moduleKey"=\'CASH_CONTROL\'');try{assert.equal((await get(prefix+'/cash-daily-summary?from=2026-11-03&to=2026-11-03')).status,403);assert.equal((await get(prefix+'/barcode-price-requests')).status,200)}finally{await mutate('UPDATE "CompanyModule" SET "active"=true WHERE "companyId"=\'company\' AND "moduleKey"=\'CASH_CONTROL\'')}
  await mutate('UPDATE "BackofficeStaffGrant" SET "capabilities"=$1::jsonb,"revision"="revision"+1 WHERE "userId"=\'staff\' AND "storeId"=\'selected\'',JSON.stringify(caps.filter(cap=>cap!=='cash-daily-summary.read')));assert.equal((await get(prefix+'/cash-investigation/legacy81-shift-own')).status,403);
 }finally{await restore()}
}
