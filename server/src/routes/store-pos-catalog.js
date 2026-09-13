import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";
import {advancedOnlineProductSearch} from "../advanced-online-product-search.js";
import {z} from "zod";

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
    leftKeys:Boolean(p.leftKeys),editPosButtons:Boolean(p.editPosButtons),onlineProductSearch:Boolean(p.onlineBarcode),transferAmount:Boolean(p.transferAmount),shiftTransactions:Boolean(p.shiftTransactionsPos),allShiftTransactions:Boolean(p.allShiftTransactionsPos),supplierPayment:Boolean(p.supplierPayment),thirdPartyPayment:Boolean(p.thirdPartyPayment),returnItems:Boolean(p.returnItems),changeRetail:Boolean(p.changeRetail),addBarcode:Boolean(p.addBarcode),editDescription:Boolean(p.editDescription),customerCardOnly:Boolean(p.customerCardOnly),cash:Boolean(p.cash),cards:Boolean(p.cards),initialCash:Boolean(p.initialCash),sameShiftPayments:p.sameShiftPayments!==false,centralCashPos:Boolean(p.centralCashPos),closeShift:Boolean(p.closeShift)
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

router.get("/stores/:storeId/barcode-registration",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore,access=req.storeOperatorAccess||adminAccess;
    if(!access.addBarcode)return res.status(403).json({error:"Δεν έχεις δικαίωμα «Προσθήκη barcode είδους» από το BackOffice."});
    const q=String(req.query.q||"").trim(),like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",
        COALESCE((SELECT json_agg(json_build_object('id',pb."id",'barcode',pb."barcode",'salePrice',pb."salePrice") ORDER BY pb."createdAt") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
      FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId}
      WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."active"=TRUE
        AND (${q}='' OR p."name" ILIKE ${like} OR COALESCE(p."sku",'') ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode" ILIKE ${like}))
      ORDER BY CASE WHEN NOT EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id") THEN 0 ELSE 1 END,p."name" LIMIT 250`;
    res.json({rows:rows.map(row=>({...row,salePrice:money(row.salePrice),currentStock:money(row.currentStock),barcodes:(row.barcodes||[]).map(code=>({...code,salePrice:code.salePrice==null?null:money(code.salePrice)}))})),access:{changeRetail:Boolean(access.changeRetail)}});
  }catch(error){next(error)}
});

router.post("/stores/:storeId/barcode-registration",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore,access=req.storeOperatorAccess||adminAccess;
    if(!access.addBarcode)return res.status(403).json({error:"Δεν έχεις δικαίωμα «Προσθήκη barcode είδους» από το BackOffice."});
    const body=z.object({productId:z.string().min(1),barcode:z.string().trim().min(3).max(80).refine(value=>!(/\s/.test(value)),"Το barcode δεν επιτρέπεται να έχει κενά."),salePrice:z.coerce.number().min(0).max(1000000).optional().nullable()}).parse(req.body||{});
    const product=await activeStoreProduct(req,store,body.productId);
    if(!product)return res.status(404).json({error:"Το προϊόν δεν είναι ενεργό στο συγκεκριμένο κατάστημα."});
    const result=await prisma.$transaction(async tx=>{
      const conflicts=await tx.$queryRaw`SELECT pb."productId",p."name",p."sku" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${body.barcode} LIMIT 1`;
      if(conflicts[0]&&conflicts[0].productId!==product.id){const error=new Error(`Το barcode ${body.barcode} υπάρχει ήδη στο προϊόν «${conflicts[0].name}»${conflicts[0].sku?` (${conflicts[0].sku})`:""}.`);error.status=409;throw error}
      let barcodeId;
      if(conflicts[0])barcodeId=(await tx.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${product.id} AND "barcode"=${body.barcode} LIMIT 1`)[0].id;
      else{barcodeId=crypto.randomUUID();await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice") VALUES (${barcodeId},${product.id},${body.barcode},1,${access.changeRetail?(body.salePrice??null):null})`}
      let priceStatus="UNCHANGED",requestId=null;
      if(body.salePrice!==undefined&&body.salePrice!==null){
        if(access.changeRetail){await tx.$executeRaw`UPDATE "ProductBarcode" SET "salePrice"=${body.salePrice},"updatedAt"=NOW() WHERE "id"=${barcodeId}`;priceStatus="APPLIED"}
        else{const current=(await tx.$queryRaw`SELECT COALESCE(pb."salePrice",sp."salePrice",p."salePrice") AS price FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} WHERE pb."id"=${barcodeId} AND p."companyId"=${req.user.companyId} LIMIT 1`)[0];requestId=crypto.randomUUID();await tx.$executeRaw`INSERT INTO "ProductBarcodePriceRequest" ("id","companyId","storeId","productId","barcodeId","barcode","oldPrice","requestedPrice","requestedBy","requestedByName") VALUES (${requestId},${req.user.companyId},${store.id},${product.id},${barcodeId},${body.barcode},${current?.price??null},${body.salePrice},${req.user.id},${req.user.fullName||"Πωλητής"})`;priceStatus="PENDING_APPROVAL"}
      }
      return {barcodeId,priceStatus,requestId};
    });
    await audit(req,store,"POS_BARCODE_REGISTERED",{productId:product.id,productName:product.name,barcode:body.barcode,requestedPrice:body.salePrice??null,priceStatus:result.priceStatus,priceRequestId:result.requestId});
    res.status(201).json({ok:true,product:{id:product.id,name:product.name},barcode:{id:result.barcodeId,barcode:body.barcode,salePrice:result.priceStatus==="APPLIED"?body.salePrice:null},priceStatus:result.priceStatus,message:result.priceStatus==="PENDING_APPROVAL"?"Το barcode αποθηκεύτηκε. Η νέα τιμή στάλθηκε για έγκριση.":"Το νέο barcode αποθηκεύτηκε."});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:error.issues?.[0]?.message||"Τα στοιχεία barcode δεν είναι έγκυρα."});next(error)}
});

const managementRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
function requireStoreManagement(req,res){
  if(req.user?.tokenType==="STORE_OPERATOR"||!managementRoles.has(req.user?.role)){res.status(403).json({error:"Η λειτουργία είναι διαθέσιμη μόνο σε Υπεύθυνο, Ιδιοκτήτη ή Super Admin."});return false}
  return true;
}

router.get("/stores/:storeId/barcode-price-requests",async(req,res,next)=>{
  try{
    if(!requireStoreManagement(req,res))return;
    const store=req.storeOperatorStore;
    const status=z.enum(["PENDING","APPROVED","REJECTED","ALL"]).default("PENDING").parse(String(req.query.status||"PENDING").toUpperCase());
    const rows=await prisma.$queryRaw`SELECT r.*,p."name" AS "productName",p."sku" FROM "ProductBarcodePriceRequest" r JOIN "Product" p ON p."id"=r."productId" AND p."companyId"=r."companyId" WHERE r."companyId"=${req.user.companyId} AND r."storeId"=${store.id} AND (${status}='ALL' OR r."status"=${status}) ORDER BY r."createdAt" DESC LIMIT 500`;
    res.json({rows:rows.map(row=>({...row,oldPrice:row.oldPrice==null?null:money(row.oldPrice),requestedPrice:money(row.requestedPrice)}))});
  }catch(error){next(error)}
});

router.post("/stores/:storeId/barcode-price-requests/:requestId/review",async(req,res,next)=>{
  try{
    if(!requireStoreManagement(req,res))return;
    const store=req.storeOperatorStore,body=z.object({decision:z.enum(["APPROVE","REJECT"])}).parse(req.body||{});
    const reviewed=await prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw`SELECT r.*,p."name" AS "productName" FROM "ProductBarcodePriceRequest" r JOIN "Product" p ON p."id"=r."productId" AND p."companyId"=r."companyId" WHERE r."id"=${req.params.requestId} AND r."companyId"=${req.user.companyId} AND r."storeId"=${store.id} FOR UPDATE`;
      const row=rows[0];if(!row){const error=new Error("Δεν βρέθηκε το αίτημα αλλαγής τιμής.");error.status=404;throw error}if(row.status!=="PENDING"){const error=new Error("Το αίτημα έχει ήδη εξεταστεί.");error.status=409;throw error}
      if(body.decision==="APPROVE")await tx.$executeRaw`UPDATE "ProductBarcode" SET "salePrice"=${row.requestedPrice},"updatedAt"=NOW() WHERE "id"=${row.barcodeId} AND "productId"=${row.productId}`;
      const status=body.decision==="APPROVE"?"APPROVED":"REJECTED";
      await tx.$executeRaw`UPDATE "ProductBarcodePriceRequest" SET "status"=${status},"reviewedBy"=${req.user.id},"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${row.id}`;
      return {...row,status};
    });
    await audit(req,store,`POS_BARCODE_PRICE_${reviewed.status}`,{requestId:reviewed.id,productId:reviewed.productId,productName:reviewed.productName,barcode:reviewed.barcode,oldPrice:money(reviewed.oldPrice),requestedPrice:money(reviewed.requestedPrice),reviewedBy:req.user.fullName||req.user.email||req.user.id});
    res.json({ok:true,status:reviewed.status});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/barcode-sales-report",async(req,res,next)=>{
  try{
    if(!requireStoreManagement(req,res))return;
    const store=req.storeOperatorStore,query=z.object({from:z.string().datetime().optional(),to:z.string().datetime().optional()}).parse(req.query),from=query.from?new Date(query.from):new Date(Date.now()-30*86400000),to=query.to?new Date(query.to):new Date();
    if(from>to)return res.status(400).json({error:"Η ημερομηνία έναρξης δεν μπορεί να είναι μετά τη λήξη."});
    const rows=await prisma.$queryRaw`SELECT p."id" AS "productId",p."name" AS "productName",p."sku",COALESCE(sl."scannedBarcode",'ΧΩΡΙΣ BARCODE') AS barcode,SUM(sl."quantity") AS quantity,SUM(sl."lineTotal") AS revenue FROM "SaleLine" sl JOIN "Sale" s ON s."id"=sl."saleId" JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=s."companyId" WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to} AND s."source" NOT IN ('WASTE','PRODUCT_DESTRUCTION') GROUP BY p."id",p."name",p."sku",COALESCE(sl."scannedBarcode",'ΧΩΡΙΣ BARCODE') ORDER BY p."name",barcode`;
    const products=[];for(const row of rows){let product=products.find(item=>item.productId===row.productId);if(!product){product={productId:row.productId,productName:row.productName,sku:row.sku,quantity:0,revenue:0,barcodes:[]};products.push(product)}const detail={barcode:row.barcode,quantity:money(row.quantity),revenue:money(row.revenue)};product.quantity+=detail.quantity;product.revenue+=detail.revenue;product.barcodes.push(detail)}
    res.json({store,from,to,products,totals:{quantity:products.reduce((sum,row)=>sum+row.quantity,0),revenue:products.reduce((sum,row)=>sum+row.revenue,0)}});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});next(error)}
});

router.get("/stores/:storeId/online-radio",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore,moduleRows=await prisma.$queryRaw`SELECT EXISTS(SELECT 1 FROM "StorePaidModule" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "moduleKey"='ONLINE_RADIO' AND "active"=TRUE AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">=NOW())) AS enabled`,config=(await prisma.$queryRaw`SELECT "enabled","allowedStationIds" FROM "StoreOnlineRadioConfig" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} LIMIT 1`)[0],terminal=String(req.user.terminalPos||"MAIN").trim().toUpperCase(),state=(await prisma.$queryRaw`SELECT "stationId","volume" FROM "PosOnlineRadioState" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "terminalPos"=${terminal} LIMIT 1`)[0];
    const moduleActive=Boolean(moduleRows[0]?.enabled),enabled=moduleActive&&Boolean(config?.enabled),allowed=Array.isArray(config?.allowedStationIds)?config.allowedStationIds:[];
    const stations=enabled&&allowed.length?await prisma.$queryRaw`SELECT "id","name","streamUrl" FROM "OnlineRadioStation" WHERE "active"=TRUE AND "id"=ANY(${allowed}::text[]) ORDER BY "sortOrder","name"`:[];
    const availableStations=req.user?.tokenType!=="STORE_OPERATOR"&&moduleActive?await prisma.$queryRaw`SELECT "id","name","streamUrl" FROM "OnlineRadioStation" WHERE "active"=TRUE ORDER BY "sortOrder","name"`:undefined;
    res.json({moduleActive,enabled,stations,availableStations,allowedStationIds:availableStations?allowed:undefined,state:{stationId:state?.stationId||null,volume:state?.volume==null?.7:money(state.volume)},terminalPos:terminal});
  }catch(error){next(error)}
});

router.put("/stores/:storeId/online-radio/config",async(req,res,next)=>{
  try{
    if(!requireStoreManagement(req,res))return;
    const store=req.storeOperatorStore,body=z.object({enabled:z.boolean(),allowedStationIds:z.array(z.string().min(1)).max(100)}).parse(req.body||{});
    const moduleActive=Boolean((await prisma.$queryRaw`SELECT 1 FROM "StorePaidModule" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "moduleKey"='ONLINE_RADIO' AND "active"=TRUE AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">=NOW()) LIMIT 1`)[0]);
    if(!moduleActive)return res.status(403).json({error:"Το πληρωμένο module Online Ράδιο δεν είναι ενεργό για το κατάστημα."});
    const ids=[...new Set(body.allowedStationIds)],valid=ids.length?await prisma.$queryRaw`SELECT "id" FROM "OnlineRadioStation" WHERE "active"=TRUE AND "id"=ANY(${ids}::text[])`:[];
    if(valid.length!==ids.length)return res.status(400).json({error:"Ένας ή περισσότεροι σταθμοί δεν είναι ενεργοί."});
    await prisma.$executeRaw`INSERT INTO "StoreOnlineRadioConfig" ("storeId","companyId","enabled","allowedStationIds","updatedBy") VALUES (${store.id},${req.user.companyId},${body.enabled},${JSON.stringify(ids)}::jsonb,${req.user.id}) ON CONFLICT ("storeId") DO UPDATE SET "companyId"=EXCLUDED."companyId","enabled"=EXCLUDED."enabled","allowedStationIds"=EXCLUDED."allowedStationIds","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    await audit(req,store,"ONLINE_RADIO_CONFIG_UPDATED",{enabled:body.enabled,allowedStationIds:ids});res.json({ok:true,enabled:body.enabled,allowedStationIds:ids});
  }catch(error){next(error)}
});

router.put("/stores/:storeId/online-radio/state",async(req,res,next)=>{
  try{
    const store=req.storeOperatorStore,body=z.object({stationId:z.string().min(1).optional().nullable(),volume:z.coerce.number().min(0).max(1)}).parse(req.body||{}),terminal=String(req.user.terminalPos||"MAIN").trim().toUpperCase();
    const allowed=await prisma.$queryRaw`SELECT 1 FROM "StoreOnlineRadioConfig" cfg JOIN "StorePaidModule" m ON m."storeId"=cfg."storeId" AND m."companyId"=cfg."companyId" AND m."moduleKey"='ONLINE_RADIO' AND m."active"=TRUE WHERE cfg."companyId"=${req.user.companyId} AND cfg."storeId"=${store.id} AND cfg."enabled"=TRUE AND (${body.stationId}::text IS NULL OR cfg."allowedStationIds" ? ${body.stationId}) LIMIT 1`;
    if(!allowed[0])return res.status(403).json({error:"Το Online Ράδιο ή ο επιλεγμένος σταθμός δεν είναι ενεργός για αυτό το κατάστημα."});
    await prisma.$executeRaw`INSERT INTO "PosOnlineRadioState" ("companyId","storeId","terminalPos","stationId","volume") VALUES (${req.user.companyId},${store.id},${terminal},${body.stationId||null},${body.volume}) ON CONFLICT ("companyId","storeId","terminalPos") DO UPDATE SET "stationId"=EXCLUDED."stationId","volume"=EXCLUDED."volume","updatedAt"=NOW()`;
    res.json({ok:true});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Η ρύθμιση ραδιοφώνου δεν είναι έγκυρη."});next(error)}
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
        SELECT p."id",p."sku",p."name",p."vatRate",p."masterProductId",p."freeSalePrice",p."negativeStockWarning",p."isSet",p."isRecipe",mp."sourceCode" AS "masterCode",
          COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",
          c."name" AS "categoryName",
          COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes",
          COALESCE((SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=p."masterProductId"),'[]') AS "masterBarcodes",
          COALESCE((SELECT json_agg(jsonb_build_object('id',rp."id",'name',rp."name",'sku',rp."sku",'quantity',si."quantity",'salePrice',COALESCE(si."salePrice",rsp."salePrice",rp."salePrice"),'currentStock',COALESCE(rsp."currentStock",0),'freeSalePrice',false,'negativeStockWarning',rp."negativeStockWarning") ORDER BY rp."name") FROM "ProductSetItem" si JOIN "Product" rp ON rp."id"=si."relatedProductId" LEFT JOIN "StoreProduct" rsp ON rsp."productId"=rp."id" AND rsp."storeId"=${store.id} WHERE si."companyId"=${req.user.companyId} AND si."productId"=p."id" AND rp."active"=true AND COALESCE(rsp."active",false)=true),'[]') AS "setItems"
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
