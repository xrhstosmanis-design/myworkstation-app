import {randomUUID} from 'node:crypto';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const cents=value=>Math.round(Number(value)*100);
export function priceInput(body){
  const price=body?.newPrice,expected=body?.expectedPrice;
  if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>999999||Math.abs(price*100-cents(price))>0.000001)fail(400,'Βάλε έγκυρη τιμή με έως δύο δεκαδικά.');
  if(typeof expected!=='number'||!Number.isFinite(expected)||expected<0)fail(400,'Ανανέωσε την τρέχουσα τιμή καταστήματος.');
  const reason=String(body.reason||'').trim(),requestId=String(body.requestId||'');
  if(reason.length<3||reason.length>300)fail(400,'Συμπλήρωσε αιτιολογία αλλαγής τιμής.');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)||body.confirm!==true)fail(400,'Επιβεβαίωσε τη μόνιμη αλλαγή τιμής.');
  return {newPrice:price,expectedPrice:expected,reason,requestId};
}
export function assertPriceAccess(req,store,access){
  if(!store?.id||!req.user?.companyId||store.companyId!==req.user.companyId)fail(403,'Δεν επιτρέπεται το κατάστημα.');
  if(req.params?.storeId!==store.id)fail(403,'Δεν αντιστοιχεί το επιλεγμένο κατάστημα.');
  if(req.user.tokenType==='STORE_OPERATOR'&&req.user.storeId!==store.id)fail(403,'Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.');
  if(req.user.tokenType!=='STORE_OPERATOR'&&!['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(req.user.role))fail(403,'Δεν επιτρέπεται η μόνιμη αλλαγή τιμής.');
  if(!access?.changeRetail)fail(403,'Δεν έχεις δικαίωμα «Αλλαγή τιμής λιανικής» από το BackOffice.');
}
async function productFor(db,req,store,productId,lock=false){
  const query=lock
    ?await db.$queryRaw`SELECT p."id",p."name",p."sku",p."allowPosPriceChange",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "Store" s ON s."id"=sp."storeId" WHERE s."companyId"=${req.user.companyId} AND s."active"=true AND p."companyId"=${req.user.companyId} AND sp."storeId"=${store.id} AND p."id"=${productId} AND p."active"=true AND sp."active"=true FOR UPDATE OF sp,p`
    :await db.$queryRaw`SELECT p."id",p."name",p."sku",p."allowPosPriceChange",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "Store" s ON s."id"=sp."storeId" WHERE s."companyId"=${req.user.companyId} AND s."active"=true AND p."companyId"=${req.user.companyId} AND sp."storeId"=${store.id} AND p."id"=${productId} AND p."active"=true AND sp."active"=true`;
  const row=query[0];
  if(!row)fail(404,'Το προϊόν δεν είναι ενεργό στο επιλεγμένο κατάστημα.');
  if(row.allowPosPriceChange!==true)fail(403,'Δεν επιτρέπεται αλλαγή τιμής POS στην καρτέλα του είδους.');
  return row;
}
async function checkBarcode(db,productId,barcode){
  if(!barcode)return;
  const rows=await db.$queryRaw`SELECT "salePrice" FROM "ProductBarcode" WHERE "productId"=${productId} AND "barcode"=${barcode} LIMIT 1`;
  if(rows[0]?.salePrice!=null)fail(409,'Το συγκεκριμένο barcode έχει ξεχωριστή τιμή. Άλλαξέ την από την καρτέλα Barcode.');
}
export async function readPermanentPrice(db,req,store,access){
  assertPriceAccess(req,store,access);
  const row=await productFor(db,req,store,req.params.productId);
  await checkBarcode(db,row.id,String(req.query?.barcode||''));
  return {productId:row.id,productName:row.name,storeId:store.id,storeName:store.name,salePrice:Number(row.salePrice)};
}
export async function savePermanentPrice(db,req,store,access,{ensureAudit,terminal}={}){
  assertPriceAccess(req,store,access);
  const input=priceInput(req.body),productId=String(req.params.productId||''),barcode=String(req.body.barcode||'');
  await ensureAudit();
  const terminalPos=await terminal(req);
  return db.$transaction(async tx=>{
    // Serialize same-store writes and retries; the event is the durable receipt.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-permanent-price:${store.companyId}:${store.id}`}))`;
    if(req.user.tokenType==='STORE_OPERATOR'){
      const profile=(await tx.$queryRaw`SELECT p."permissions",p."posAccess" FROM "StoreOperatorProfile" p JOIN "StoreOperatorCredential" c ON c."companyId"=p."companyId" AND c."storeId"=p."storeId" AND c."employeeId"=p."employeeId" WHERE c."id"=${req.user.operatorId||req.user.id} AND c."companyId"=${store.companyId} AND c."storeId"=${store.id} AND c."active"=true FOR SHARE OF p,c`)[0];
      if(!profile||profile.posAccess===false||profile.permissions?.changeRetail!==true)fail(403,'Το δικαίωμα αλλαγής τιμής έχει ανακληθεί.');
    }
    const previous=(await tx.$queryRaw`SELECT "id","actorId","reason","details" FROM "PosSaleActionAudit" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "actionType"='PERMANENT_PRICE_CHANGE' AND "details"->>'requestId'=${input.requestId} LIMIT 1`)[0];
    if(previous){
      const d=previous.details;
      if(previous.actorId!==req.user.id||d.productId!==productId||d.newPrice!==input.newPrice||d.oldPrice!==input.expectedPrice||previous.reason!==input.reason||String(d.barcode||'')!==barcode)fail(409,'Το αίτημα έχει ήδη χρησιμοποιηθεί για άλλη αλλαγή.');
      return {ok:true,replayed:true,eventId:previous.id,productId,storeId:store.id,salePrice:d.newPrice};
    }
    const row=await productFor(tx,req,store,productId,true);
    await checkBarcode(tx,row.id,barcode);
    if(Number(row.salePrice)!==input.expectedPrice)fail(409,'Η τιμή άλλαξε από άλλο τερματικό. Κλείσε και άνοιξε ξανά τη μόνιμη αλλαγή.');
    if(Number(row.salePrice)===input.newPrice)fail(409,'Η τιμή είναι ήδη ίδια.');
    const eventId=randomUUID(),historyId=randomUUID();
    const shift=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`)[0];
    const details={requestId:input.requestId,productId:row.id,productName:row.name,sku:row.sku,oldPrice:Number(row.salePrice),newPrice:input.newPrice,difference:input.newPrice-Number(row.salePrice),scope:'STORE_PERMANENT',storeId:store.id,storeName:store.name,terminalPos,sessionId:shift?.id||null,actorName:req.user.fullName||'Πωλητής',barcode:barcode||null,historyId,stockChanged:false,financialMovement:false};
    await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${input.newPrice},"updatedAt"=NOW() WHERE "storeId"=${store.id} AND "productId"=${row.id} AND "active"=true`;
    const userId=req.user.tokenType==='STORE_OPERATOR'?null:req.user.id;
    await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${historyId},${store.companyId},${row.id},${store.id},${Number(row.salePrice)},${input.newPrice},'POS_STORE_PERMANENT',${userId})`;
    await tx.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","actionType","reason","actorId","actorName","details") VALUES (${eventId},${store.companyId},${store.id},'PERMANENT_PRICE_CHANGE',${input.reason},${req.user.id},${req.user.fullName||'Πωλητής'},${JSON.stringify(details)}::jsonb)`;
    return {ok:true,eventId,productId:row.id,storeId:store.id,salePrice:input.newPrice};
  });
}

export function registerPermanentPriceRoutes(router,db){
  const path='/stores/:storeId/products/:productId/permanent-price';
  router.get(path,async(req,res,next)=>{try{res.set?.('Cache-Control','no-store');res.json(await readPermanentPrice(db,req,req.storeOperatorStore,req.storeOperatorAccess))}catch(e){next(e)}});
  router.post(path,async(req,res,next)=>{try{
    const result=await savePermanentPrice(db,req,req.storeOperatorStore,req.storeOperatorAccess,{
      ensureAudit:()=>db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosSaleActionAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"saleId" TEXT,"relatedSaleId" TEXT,"actionType" TEXT NOT NULL,"reason" TEXT,"actorId" TEXT,"actorName" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`),
      terminal:async()=>req.user.tokenType==='STORE_OPERATOR'?String(req.user.terminalPos||'MAIN'):String(req.headers?.['x-mws-terminal-pos']||'MAIN').trim().toUpperCase().slice(0,120)
    });res.json(result);
  }catch(e){next(e)}});
}
