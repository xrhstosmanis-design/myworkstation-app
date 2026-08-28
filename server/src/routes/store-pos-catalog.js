import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";
import {advancedOnlineProductSearch} from "../advanced-online-product-search.js";

const router=Router();
const money=value=>Number(value||0);

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}
async function storeFor(req,storeId){
  const row=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!row){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return row;
}
const adminAccess={leftKeys:true,editPosButtons:true,onlineProductSearch:true,transferAmount:true,shiftTransactions:true,allShiftTransactions:true,supplierPayment:true,thirdPartyPayment:true,returnItems:true,changeRetail:true,addBarcode:true,editDescription:true,customerCardOnly:false,cash:true,cards:true,initialCash:true,centralCashPos:true,closeShift:true};
async function operatorAccess(req,storeId){
  if(req.user?.tokenType!=="STORE_OPERATOR")return adminAccess;
  const rows=await prisma.$queryRaw`
    SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions",COALESCE(p."posAccess",TRUE) AS "posAccess"
    FROM "StoreOperatorCredential" c
    LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
    WHERE c."id"=${req.user.operatorId||req.user.id} AND c."storeId"=${storeId} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;
  const row=rows[0];
  if(!row||row.posAccess===false){const error=new Error("Ο χειριστής δεν έχει ενεργή πρόσβαση στο POS από το BackOffice.");error.status=403;throw error}
  const p=row.permissions&&typeof row.permissions==="object"?row.permissions:{};
  return {
    leftKeys:Boolean(p.leftKeys),editPosButtons:Boolean(p.editPosButtons),onlineProductSearch:Boolean(p.onlineBarcode),transferAmount:Boolean(p.transferAmount),shiftTransactions:Boolean(p.shiftTransactionsPos),allShiftTransactions:Boolean(p.allShiftTransactionsPos),supplierPayment:Boolean(p.supplierPayment),thirdPartyPayment:Boolean(p.thirdPartyPayment),returnItems:Boolean(p.returnItems),changeRetail:Boolean(p.changeRetail),addBarcode:Boolean(p.addBarcode),editDescription:Boolean(p.editDescription),customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash),centralCashPos:Boolean(p.centralCashPos),closeShift:Boolean(p.closeShift)
  };
}
async function audit(req,store,eventType,details={}){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},${eventType},${JSON.stringify(details)}::jsonb)`;
}
async function activeStoreProduct(req,store,productId){
  const rows=await prisma.$queryRaw`
    SELECT p."id",p."name",p."sku",p."masterProductId"
    FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id"
    WHERE p."id"=${productId} AND p."companyId"=${req.user.companyId} AND p."active"=TRUE
      AND sp."storeId"=${store.id} AND sp."active"=TRUE LIMIT 1`;
  return rows[0]||null;
}
async function persistProductAuditAction(req,store,access){
  if(req.method!=="POST"||!req.path.endsWith("/audit"))return;
  const action=String(req.body?.actionType||"").trim().toUpperCase(),details=req.body?.details&&typeof req.body.details==="object"?req.body.details:{};
  if(action!=="BARCODE_ADD"&&action!=="DESCRIPTION_CHANGE")return;
  const productId=String(details.productId||"").trim();
  if(!productId){const error=new Error("Λείπει το προϊόν της αλλαγής.");error.status=400;throw error}
  const product=await activeStoreProduct(req,store,productId);
  if(!product){const error=new Error("Το προϊόν δεν είναι ενεργό στο συγκεκριμένο κατάστημα.");error.status=404;throw error}
  if(action==="BARCODE_ADD"){
    if(!access.addBarcode){await audit(req,store,"POS_PERMISSION_DENIED",{permission:"addBarcode",action:"BARCODE_ADD",productId});const error=new Error("Δεν έχεις δικαίωμα «Προσθήκη barcode είδους» από το BackOffice.");error.status=403;throw error}
    const barcode=String(details.newBarcode||"").trim();
    if(barcode.length<3||barcode.length>80||/\s/.test(barcode)){const error=new Error("Το νέο barcode δεν είναι έγκυρο.");error.status=400;throw error}
    const conflicts=await prisma.$queryRaw`
      SELECT pb."productId",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId"
      WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;
    if(conflicts[0]&&conflicts[0].productId!==product.id){const error=new Error(`Το barcode ${barcode} είναι ήδη συνδεδεμένο με το προϊόν «${conflicts[0].name}».`);error.status=409;throw error}
    await prisma.$executeRaw`
      INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier")
      VALUES (${crypto.randomUUID()},${product.id},${barcode},1)
      ON CONFLICT ("productId","barcode") DO NOTHING`;
    req.body.details={...details,productName:product.name,newBarcode:barcode,persisted:true,scope:"PRODUCT"};
    return;
  }
  if(!access.editDescription){await audit(req,store,"POS_PERMISSION_DENIED",{permission:"editDescription",action:"DESCRIPTION_CHANGE",productId});const error=new Error("Δεν έχεις δικαίωμα «Διόρθωση περιγραφής είδους» από το BackOffice.");error.status=403;throw error}
  const nextName=String(details.newDescription||"").trim().replace(/\s+/g," ");
  if(nextName.length<2||nextName.length>240){const error=new Error("Η νέα περιγραφή πρέπει να έχει από 2 έως 240 χαρακτήρες.");error.status=400;throw error}
  await prisma.$executeRaw`UPDATE "Product" SET "name"=${nextName},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id} AND "companyId"=${req.user.companyId}`;
  req.body.details={...details,oldDescription:product.name,newDescription:nextName,persisted:true,scope:"PRODUCT"};
}
function requestedPaymentMethods(body={}){if(body.paymentMethod==="MIXED")return Array.isArray(body.payments)?body.payments.map(row=>String(row?.method||"").toUpperCase()).filter(Boolean):[];return body.paymentMethod?[String(body.paymentMethod).toUpperCase()]:[]}
function layoutForAccess(rawLayout,access){if(!rawLayout||typeof rawLayout!=="object")return rawLayout||null;const layout=structuredClone(rawLayout);if(Array.isArray(layout.buttons))layout.buttons=layout.buttons.map(button=>{const action=String(button?.action||button?.id||"").toUpperCase();if(action==="CASH"&&!access.cash)return{...button,visible:false};if((action==="CARD"||action==="IRIS")&&!access.cards)return{...button,visible:false};if(action==="MIXED"&&(!access.cash||!access.cards))return{...button,visible:false};return button});return layout}

router.use("/stores/:storeId",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);const store=await storeFor(req,req.params.storeId);const access=await operatorAccess(req,store.id);req.storeOperatorAccess=access;req.storeOperatorStore=store;
    if(req.method==="POST"&&req.path.endsWith("/checkout")){const methods=requestedPaymentMethods(req.body||{}),needsCash=methods.includes("CASH"),needsCards=methods.includes("CARD")||methods.includes("IRIS");if(needsCash&&!access.cash){await audit(req,store,"POS_PERMISSION_DENIED",{permission:"cash",action:"CHECKOUT",paymentMethods:methods});return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Μετρητά» από το BackOffice."})}if(needsCards&&!access.cards){await audit(req,store,"POS_PERMISSION_DENIED",{permission:"cards",action:"CHECKOUT",paymentMethods:methods});return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Κάρτες» από το BackOffice."})}}
    if(req.method==="POST"&&/\/sales\/[^/]+\/reverse$/.test(req.path)&&!access.returnItems){await audit(req,store,"POS_PERMISSION_DENIED",{permission:"returnItems",action:"SALE_REVERSE",saleId:req.path.split("/").at(-2)||null});return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Επιστροφή ειδών» από το BackOffice."})}
    await persistProductAuditAction(req,store,access);
    next();
  }catch(error){next(error)}
});

router.get("/stores/:storeId/access",async(req,res)=>{
  const rows=await prisma.$queryRaw`SELECT "settings" FROM "ManagementParameters" WHERE "companyId"=${req.user.companyId} LIMIT 1`.catch(()=>[]);
  const shifts=rows[0]?.settings?.shifts||{};
  res.json({
    access:req.storeOperatorAccess||adminAccess,
    shiftClosePolicy:{
      showExpectedAmounts:shifts.showShiftCashAtClose===true,
      notifyShortage:shifts.notifyShortage!==false,
      showShortageAmount:shifts.showShortageSurplus!==false,
      notifySurplus:shifts.notifySurplus===true
    }
  });
});

router.put("/stores/:storeId/layout",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore,access=req.storeOperatorAccess||adminAccess;
    if(!access.editPosButtons)return res.status(403).json({error:"Δεν έχεις δικαίωμα «Ρύθμιση πλήκτρων POS» από το BackOffice."});
    const layout=req.body?.layout;
    if(!layout||typeof layout!=="object"||!Array.isArray(layout.quickKeys)||!Array.isArray(layout.categories))return res.status(400).json({error:"Η διάταξη πλήκτρων δεν είναι έγκυρη."});
    if(layout.quickKeys.length>20||layout.categories.length>14)return res.status(400).json({error:"Επιτρέπονται έως 20 γρήγορα πλήκτρα και 14 κατηγορίες."});
    const bytes=Buffer.byteLength(JSON.stringify(layout));
    if(bytes>250000)return res.status(413).json({error:"Η διάταξη είναι υπερβολικά μεγάλη."});
    const rows=await prisma.$queryRaw`
      INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt")
      VALUES (${store.id},${store.companyId},${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP)
      ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="StorePosLayout"."version"+1,"publishedBy"=EXCLUDED."publishedBy","publishedAt"=CURRENT_TIMESTAMP
      RETURNING "layoutJson","version","publishedAt"`;
    await audit(req,store,"POS_BUTTON_LAYOUT_UPDATE",{version:Number(rows[0]?.version||0),quickKeys:layout.quickKeys.length,categories:layout.categories.length});
    res.json({layout:layoutForAccess(rows[0]?.layoutJson||layout,access),version:Number(rows[0]?.version||0),publishedAt:rows[0]?.publishedAt});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/online-product-search",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id);
    if(!access.onlineProductSearch)return res.status(403).json({error:"Ο χειριστής δεν έχει δικαίωμα «Online αναζήτηση barcode (PoS)» από το BackOffice."});
    const q=String(req.query.q||"").trim();
    if(q.length<3)return res.status(400).json({error:"Χρειάζονται τουλάχιστον 3 χαρακτήρες ή barcode."});
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`SELECT mp."id",mp."name",mp."sourceCode",mp."vatRate",mp."categoryName",mp."subcategoryName",COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes" FROM "MasterProduct" mp WHERE mp."active"=TRUE AND (mp."sourceCode" ILIKE ${like} OR mp."name" ILIKE ${like} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id" AND mpb."barcode" ILIKE ${like})) ORDER BY CASE WHEN mp."sourceCode"=${q} OR EXISTS (SELECT 1 FROM "MasterProductBarcode" x WHERE x."masterProductId"=mp."id" AND x."barcode"=${q}) THEN 0 ELSE 1 END,mp."name" LIMIT 20`;
    if(rows.length){
      await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,source:"MASTER_CATALOG",resultCount:rows.length});
      return res.json({query:q,source:"MASTER_CATALOG",rows:rows.map(row=>({...row,vatRate:money(row.vatRate)}))});
    }
    if(!/^\d{6,18}$/.test(q)){
      await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,source:"MASTER_CATALOG",resultCount:0});
      return res.json({query:q,source:"MASTER_CATALOG",rows:[]});
    }
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(q)}?fields=code,product_name,product_name_el,brands,categories,categories_tags`,{headers:{"User-Agent":"MyWorkStation/1.0 (https://myworkstation.gr)"},signal:controller.signal});
      if(response.ok){
        const data=await response.json(),p=data?.product;
        if(p&&data?.status!==0){
          const name=String(p.product_name_el||p.product_name||"").trim();
          const categoryName=Array.isArray(p.categories_tags)&&p.categories_tags.length?String(p.categories_tags[0]).replace(/^..:/,""):String(p.categories||"").trim();
          const onlineRow={id:`online:${q}`,name:name||`Barcode ${q}`,sourceCode:q,vatRate:null,barcodes:[q],brandName:String(p.brands||"").trim(),categoryName,subcategoryName:"",online:true,source:"OPEN_FOOD_FACTS"};
          await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,source:"OPEN_FOOD_FACTS",resultCount:1});
          return res.json({query:q,source:"OPEN_FOOD_FACTS",rows:[onlineRow]});
        }
      }
    }catch{}finally{clearTimeout(timer)}
    const advanced=await advancedOnlineProductSearch({companyId:req.user.companyId,storeId:store.id,actorId:req.user.id,barcode:q});
    if(advanced.rows?.length){
      await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,source:"GOOGLE_SEARCH",provider:advanced.provider,resultCount:advanced.rows.length,advancedModule:true});
      return res.json({query:q,source:"GOOGLE_SEARCH",rows:advanced.rows,advanced:{enabled:advanced.enabled,configured:advanced.configured,provider:advanced.provider,usage:advanced.usage,limits:advanced.limits}});
    }
    await audit(req,store,"POS_ONLINE_PRODUCT_SEARCH",{query:q,source:"OPEN_FOOD_FACTS",resultCount:0,advancedReason:advanced.reason,advancedEnabled:advanced.enabled,advancedConfigured:advanced.configured});
    return res.json({query:q,source:"OPEN_FOOD_FACTS",rows:[],advanced:{enabled:advanced.enabled,configured:advanced.configured,reason:advanced.reason,provider:advanced.provider||null,usage:advanced.usage||null,limits:advanced.limits||null}});
  }catch(error){next(error)}
});

router.post("/stores/:storeId/preparation",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),body=req.body||{},items=Array.isArray(body.items)?body.items:[];
    if(!items.length)return res.status(400).json({error:"Δεν υπάρχουν προϊόντα για παρασκευή."});
    const shift=(await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`)[0];
    if(!shift)return res.status(409).json({error:"Δεν υπάρχει ανοιχτή βάρδια. Άνοιξε πρώτα βάρδια."});
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosOperationalEvent" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,"operatorId" TEXT NOT NULL,"operatorName" TEXT,"type" TEXT NOT NULL,"itemsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"detailsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,"total" NUMERIC(14,2) NOT NULL DEFAULT 0,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const consumption=new Map(),prepared=[];
    const addConsumption=(productId,quantity,source,unit="PCS")=>{const q=Number(quantity||0);if(!productId||!Number.isFinite(q)||q<=0)return;const key=productId,current=consumption.get(key)||{ingredientProductId:productId,quantity:0,unit,sources:[]};current.quantity+=q;current.sources.push(source);consumption.set(key,current)};
    for(const raw of items){const productId=String(raw?.productId||""),qty=Math.max(0,Number(raw?.quantity||0));if(!productId||!qty)continue;const product=(await prisma.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "id"=${productId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`)[0];if(!product)return res.status(400).json({error:"Ένα προϊόν παρασκευής δεν είναι ενεργό."});const recipe=await prisma.$queryRaw`SELECT r."ingredientProductId",r."quantity",r."unit",p."name" AS "ingredientName",p."sku" AS "ingredientSku" FROM "PreparationRecipeLine" r JOIN "Product" p ON p."id"=r."ingredientProductId" WHERE r."companyId"=${req.user.companyId} AND r."productId"=${productId} AND r."automatic"=true`;for(const row of recipe)addConsumption(row.ingredientProductId,Number(row.quantity||0)*qty,{type:"RECIPE",productId,name:product.name,ingredientName:row.ingredientName},row.unit);const modifiers=Array.isArray(raw?.modifiers)?raw.modifiers:[];for(const mod of modifiers){const id=String(mod?.id||"");if(id&&!id.startsWith("synthetic-")){const rows=await prisma.$queryRaw`SELECT c."ingredientProductId",c."quantity",c."unit",p."name" AS "ingredientName" FROM "PreparationModifierConsumption" c JOIN "Product" p ON p."id"=c."ingredientProductId" WHERE c."companyId"=${req.user.companyId} AND c."modifierId"=${id}`;for(const row of rows)addConsumption(row.ingredientProductId,Number(row.quantity||0)*qty,{type:"MODIFIER",modifierId:id,modifier:mod.description,productId},row.unit)}const desc=String(mod?.description||"").toLocaleUpperCase("el-GR");if(id.startsWith("synthetic-")&&desc.startsWith("ΚΟΥΤΑΛΙΑ")){const count=Number(desc.match(/([0-9]+(?:[.,][0-9]+)?)/)?.[1]?.replace(",",".")||0),brown=modifiers.some(x=>String(x?.description||"").toLocaleUpperCase("el-GR").includes("ΚΑΣΤΑΝ")),sku=brown?"MWS-PREP-SUGAR-BROWN":"MWS-PREP-SUGAR-WHITE",ingredient=(await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${req.user.companyId} AND "sku"=${sku} LIMIT 1`)[0];if(ingredient)addConsumption(ingredient.id,count*5*qty,{type:"SPOONS",count,ingredientName:ingredient.name},"GR")}if(id.startsWith("synthetic-")&&desc.startsWith("ΠΑΓΟΣ ΠΟΣΟΤΗΤΑ")){const count=Number(desc.match(/([0-9]+(?:[.,][0-9]+)?)/)?.[1]?.replace(",",".")||0),ingredient=(await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${req.user.companyId} AND "sku"='MWS-PREP-ICE' LIMIT 1`)[0];if(ingredient)addConsumption(ingredient.id,count*qty,{type:"ICE_LEVEL",count,ingredientName:ingredient.name},"PCS")}}
      prepared.push({productId,name:product.name,sku:product.sku,quantity:qty,modifiers});
    }
    const consumed=[...consumption.values()];
    await prisma.$transaction(async tx=>{for(const row of consumed){await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${row.quantity},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${store.id} AND "productId"=${row.ingredientProductId}`}});
    const id=crypto.randomUUID(),details={note:body.note||null,priority:String(body.priority||"NORMAL"),environmentalFee:money(body.environmentalFee),unitPrice:money(body.unitPrice),productionStation:body.productionStation||"ΠΑΡΑΓΩΓΗ",status:"QUEUED",stockConsumption:consumed,pilot:true};
    await prisma.$executeRaw`INSERT INTO "PosOperationalEvent" ("id","companyId","storeId","sessionId","operatorId","operatorName","type","itemsJson","detailsJson","total") VALUES (${id},${req.user.companyId},${store.id},${shift.id},${req.user.id},${req.user.fullName||"Πωλητής"},'PREPARATION',${JSON.stringify(prepared)}::jsonb,${JSON.stringify(details)}::jsonb,${money(body.unitPrice)})`;
    await audit(req,store,"POS_PREPARATION",{preparationId:id,items:prepared,priority:details.priority,stockConsumption:consumed,environmentalFee:details.environmentalFee,unitPrice:details.unitPrice});
    res.status(201).json({ok:true,id,status:"QUEUED",items:prepared,stockConsumption:consumed,priority:details.priority});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/customers",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id),q=String(req.query.q||"").trim();
    if(q.length<2)return res.json({items:[],cardOnly:Boolean(access.customerCardOnly)});
    const like=`%${q}%`;
    const rows=access.customerCardOnly
      ?await prisma.$queryRaw`SELECT "id","name","taxId","phone","email","discountPercent","creditLimit","balance","memberCard" FROM "Customer" WHERE "companyId"=${req.user.companyId} AND "active"=true AND COALESCE("memberCard",'') ILIKE ${like} ORDER BY "name" LIMIT 30`
      :await prisma.$queryRaw`SELECT "id","name","taxId","phone","email","discountPercent","creditLimit","balance","memberCard" FROM "Customer" WHERE "companyId"=${req.user.companyId} AND "active"=true AND ("name" ILIKE ${like} OR COALESCE("taxId",'') ILIKE ${like} OR COALESCE("phone",'') ILIKE ${like} OR COALESCE("email",'') ILIKE ${like} OR COALESCE("memberCard",'') ILIKE ${like}) ORDER BY "name" LIMIT 30`;
    res.json({cardOnly:Boolean(access.customerCardOnly),items:rows.map(row=>({...row,discountPercent:money(row.discountPercent),creditLimit:money(row.creditLimit),balance:money(row.balance),hasMemberCard:Boolean(String(row.memberCard||"").trim()),memberCard:undefined}))});
  }catch(error){next(error)}
});

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id);
    const [layoutRows,products]=await Promise.all([
      prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]),
      prisma.$queryRaw`
        SELECT p."id",p."sku",p."name",p."vatRate",p."masterProductId",mp."sourceCode" AS "masterCode",
          COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",
          c."name" AS "categoryName",
          COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes",
          COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=p."masterProductId"),'[]') AS "masterBarcodes"
        FROM "StoreProduct" sp
        JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId}
        LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
        LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId" AND mp."active"=true
        WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true
        ORDER BY c."name" NULLS LAST,p."name" LIMIT 5000`
    ]);
    const layout=layoutForAccess(layoutRows[0]?.layoutJson||null,access);
    res.json({store,layout,layoutVersion:Number(layoutRows[0]?.version||0),publishedAt:layoutRows[0]?.publishedAt||null,access,products:products.map(row=>({...row,sourceCode:row.masterCode||row.sku||null,barcodes:[...new Set([...(row.barcodes||[]),...(row.masterBarcodes||[])])],salePrice:money(row.salePrice),currentStock:money(row.currentStock),vatRate:money(row.vatRate)}))});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/legacy-full",async(req,res,next)=>{
  try{const store=req.storeOperatorStore||await storeFor(req,req.params.storeId),access=req.storeOperatorAccess||await operatorAccess(req,store.id);const layoutRows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);const layout=layoutForAccess(layoutRows[0]?.layoutJson||null,access);const products=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."vatRate",p."masterProductId",resolved_mp."id" AS "resolvedMasterProductId",resolved_mp."sourceCode" AS "masterCode",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",c."name" AS "categoryName",COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes",COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=resolved_mp."id"),'[]') AS "masterBarcodes"
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId} LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN LATERAL (SELECT mp."id",mp."sourceCode" FROM "MasterProduct" mp WHERE mp."active"=true AND (mp."id"=p."masterProductId" OR (p."sku" IS NOT NULL AND mp."sourceCode"=p."sku") OR (p."sku" IS NOT NULL AND EXISTS (SELECT 1 FROM "MasterProductBarcode" z WHERE z."masterProductId"=mp."id" AND z."barcode"=p."sku")) OR EXISTS (SELECT 1 FROM "MasterProductBarcode" mb JOIN "ProductBarcode" pb ON pb."productId"=p."id" AND pb."barcode"=mb."barcode" WHERE mb."masterProductId"=mp."id") OR (p."name" IS NOT NULL AND mp."name" IS NOT NULL AND lower(btrim(mp."name"))=lower(btrim(p."name")))) ORDER BY CASE WHEN mp."id"=p."masterProductId" THEN 0 WHEN p."sku" IS NOT NULL AND mp."sourceCode"=p."sku" THEN 1 ELSE 2 END,mp."id" LIMIT 1) resolved_mp ON true
      WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true ORDER BY c."name" NULLS LAST,p."name" LIMIT 5000`;res.json({store,layout,layoutVersion:Number(layoutRows[0]?.version||0),publishedAt:layoutRows[0]?.publishedAt||null,access,products:products.map(row=>({...row,masterProductId:row.resolvedMasterProductId||row.masterProductId||null,sourceCode:row.masterCode||row.sku||null,masterCode:row.masterCode||null,barcodes:[...new Set([...(row.barcodes||[]),...(row.masterBarcodes||[])])],salePrice:money(row.salePrice),currentStock:money(row.currentStock),vatRate:money(row.vatRate)}))})}catch(error){next(error)}
});
export default router;
