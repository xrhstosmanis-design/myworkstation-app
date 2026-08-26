import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {getOnlineOrderingConfig,onlineSurchargeAmount,onlineUnitPrice} from "../kat-online-ordering-bootstrap.js";

const router=Router();
const money=value=>Math.round(Number(value||0)*100)/100;
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";
const ACTIVE_STATUSES=["NEW","ACCEPTED","PREPARING","READY","OUT_FOR_DELIVERY"];
const NEXT_STATUS={NEW:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"OUT_FOR_DELIVERY",OUT_FOR_DELIVERY:"DELIVERED"};
const ONLINE_MILK_SKU={
  "ΦΡΕΣΚΟ":"MWS-PREP-MILK","ΦΡΕΣΚΟ ΓΑΛΑ":"MWS-PREP-MILK","ΓΑΛΑ ΦΡΕΣΚΟ":"MWS-PREP-MILK",
  "ΓΑΛΑ ΕΒΑΠΟΡΕ":"MWS-PREP-MILK-EVAP","ΧΩΡΙΣ ΛΑΚΤΟΖΗ":"MWS-PREP-MILK-LF",
  "ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ":"MWS-PREP-ALMOND","ΓΑΛΑ ΒΡΩΜΗΣ":"MWS-PREP-OAT","ΓΑΛΑ ΣΟΓΙΑΣ":"MWS-PREP-SOY"
};
const onlineMilkMl=sku=>({
  "MWS-KAT-BEV-FREDDO-CAP-LATTE":140,"MWS-KAT-BEV-FREDDO-CAP":70,"MWS-KAT-BEV-DECAF-FREDDO-CAP":70,
  "MWS-KAT-BEV-ICED-LATTE":160,"MWS-KAT-BEV-FRAPPE-MILK":30,"MWS-KAT-BEV-MOCHA-COLD":160,
  "MWS-KAT-BEV-MACCHIATO-DOUBLE":25,"MWS-KAT-BEV-MACCHIATO":17.5,"MWS-KAT-BEV-CAP-LATTE-DOUBLE":180,
  "MWS-KAT-BEV-CAP-LATTE-SINGLE":170,"MWS-KAT-BEV-CAP-DOUBLE":120,"MWS-KAT-BEV-CAP-SINGLE":100,
  "MWS-KAT-BEV-DECAF-CAP":100,"MWS-KAT-BEV-FLAT-WHITE":120,"MWS-KAT-BEV-CORTADO":60,
  "MWS-KAT-BEV-MOCHA-HOT":160,"MWS-KAT-BEV-LATTE-HOT":180,"MWS-KAT-BEV-DECAF-LATTE":180,
  "MWS-KAT-BEV-CHOC-HOT":200,"MWS-KAT-BEV-CHOC-WHITE-HOT":200,"MWS-KAT-BEV-CHOC-HAZ-HOT":200,
  "MWS-KAT-BEV-CHOC-CARAMEL-HOT":200,"MWS-KAT-BEV-CHOC-COLD":220,"MWS-KAT-BEV-CHOC-WHITE-COLD":220,
  "MWS-KAT-BEV-CHOC-HAZ-COLD":220,"MWS-KAT-BEV-CHOC-CARAMEL-COLD":220,"MWS-KAT-BEV-MATCHA-HOT":200,
  "MWS-KAT-BEV-MATCHA-COLD":220
})[sku]||0;

async function katStore(){
  const rows=await prisma.$queryRaw`SELECT s."id",s."name",s."companyId",s."active" FROM "Store" s WHERE s."active"=TRUE AND LOWER(s."name")=LOWER(${KAT_STORE_NAME}) ORDER BY s."createdAt" ASC LIMIT 1`;
  const store=rows[0];
  if(!store){const error=new Error("Το Κυλικείο ΚΑΤ δεν είναι διαθέσιμο αυτή τη στιγμή.");error.status=503;throw error}
  return store;
}

async function onlineContext(){
  const store=await katStore();
  const modules=await prisma.$queryRaw`SELECT "active","startsAt","endsAt" FROM "CompanyModule" WHERE "companyId"=${store.companyId} AND "moduleKey"='ONLINE_ORDERING' LIMIT 1`;
  const module=modules[0],now=Date.now();
  const moduleActive=Boolean(module?.active)&&(!module.startsAt||new Date(module.startsAt).getTime()<=now)&&(!module.endsAt||new Date(module.endsAt).getTime()>=now);
  if(!moduleActive){const error=new Error("Οι Online Παραγγελίες δεν είναι ενεργές για το κατάστημα.");error.status=403;throw error}
  const config=await getOnlineOrderingConfig(store.id);
  if(!config?.enabled){const error=new Error("Το Online κατάστημα είναι προσωρινά κλειστό.");error.status=503;throw error}
  return{store,config};
}

function safe(handler){return async(req,res,next)=>{try{await handler(req,res)}catch(error){next(error)}}}
function operatorGuard(req,res,next){
  if(req.user?.tokenType!=="STORE_OPERATOR")return res.status(403).json({error:"Η λειτουργία Online Παραγγελιών είναι διαθέσιμη από το POS καταστήματος."});
  if(String(req.user.storeId||"")!==String(req.params.storeId||""))return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  next();
}

async function orderRows(storeId,statuses=ACTIVE_STATUSES){
  return prisma.$queryRaw`SELECT o.*,COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'productName',l."productName",'quantity',l."quantity",'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items" FROM "OnlineOrder" o WHERE o."storeId"=${storeId} AND o."status"=ANY(${statuses}::text[]) ORDER BY CASE o."status" WHEN 'NEW' THEN 0 WHEN 'ACCEPTED' THEN 1 WHEN 'PREPARING' THEN 2 WHEN 'READY' THEN 3 WHEN 'OUT_FOR_DELIVERY' THEN 4 ELSE 9 END,o."createdAt" ASC`;
}

function printPayload(order,config){
  return{title:"ΚΥΛΙΚΕΙΟ ΚΑΤ · ONLINE",orderNumber:order.orderNumber,createdAt:order.createdAt,fulfillmentType:order.fulfillmentType,paymentMethod:order.paymentMethod,customerName:order.customerName,customerPhone:order.customerPhone,location:[order.building,order.floor,order.department,order.room].filter(Boolean).join(" · "),deliveryNotes:order.deliveryNotes||null,items:(order.items||[]).map(row=>({productName:row.productName,quantity:Number(row.quantity||0),unitPrice:money(row.onlineUnitPrice),lineTotal:money(row.lineTotal),modifiers:Array.isArray(row.modifiers)?row.modifiers:[]})),subtotal:money(order.subtotal),deliveryFee:money(order.deliveryFee),total:money(order.total),autoPrint:Boolean(config?.autoPrintOnAccept)};
}

async function addOrderEvent(tx,{orderId,fromStatus,toStatus,userId=null,employeeId=null,note=null}){
  await tx.$executeRaw`INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","fromStatus","toStatus","userId","employeeId","note") VALUES (${crypto.randomUUID()},${orderId},${fromStatus||null},${toStatus},${userId},${employeeId},${note})`;
}

async function resolvePreparationRecipe(tx,{store,line}){
  let recipe=await tx.$queryRaw`SELECT r."productId" AS "recipeProductId",r."ingredientProductId",r."quantity",r."unit",p."name" AS "ingredientName",COALESCE(sp."currentStock",0) AS "currentStock",sp."id" AS "storeProductId" FROM "PreparationRecipeLine" r JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" LEFT JOIN "StoreProduct" sp ON sp."storeId"=${store.id} AND sp."productId"=r."ingredientProductId" AND sp."active"=TRUE WHERE r."companyId"=${store.companyId} AND r."productId"=${line.productId} AND r."automatic"=TRUE AND p."active"=TRUE ORDER BY r."id"`;
  if(recipe.length)return recipe;
  const fallback=await tx.$queryRaw`SELECT r."productId" AS "recipeProductId",r."ingredientProductId",r."quantity",r."unit",p."name" AS "ingredientName",COALESCE(sp."currentStock",0) AS "currentStock",sp."id" AS "storeProductId" FROM "PreparationRecipeLine" r JOIN "Product" rp ON rp."id"=r."productId" AND rp."companyId"=r."companyId" JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" LEFT JOIN "StoreProduct" sp ON sp."storeId"=${store.id} AND sp."productId"=r."ingredientProductId" AND sp."active"=TRUE WHERE r."companyId"=${store.companyId} AND r."automatic"=TRUE AND p."active"=TRUE AND LOWER(TRIM(rp."name"))=LOWER(TRIM(${line.productName})) ORDER BY r."productId",r."id"`;
  const recipeProducts=[...new Set(fallback.map(row=>row.recipeProductId))];
  return recipeProducts.length===1?fallback:[];
}

async function resolveIngredientStockTarget(tx,{store,ingredient}){
  if(ingredient.storeProductId)return{...ingredient,stockProductId:ingredient.ingredientProductId};
  const matches=await tx.$queryRaw`
    SELECT sp."id" AS "storeProductId",p."id" AS "stockProductId",COALESCE(sp."currentStock",0) AS "currentStock"
    FROM "StoreProduct" sp
    JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${store.companyId}
    WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."active"=TRUE
      AND LOWER(TRIM(p."name"))=LOWER(TRIM(${ingredient.ingredientName}))
    ORDER BY CASE WHEN COALESCE(sp."currentStock",0)>0 THEN 0 ELSE 1 END,COALESCE(sp."currentStock",0) DESC,p."id"
    LIMIT 1`;
  return matches[0]?{...ingredient,...matches[0]}:{...ingredient,stockProductId:ingredient.ingredientProductId};
}

async function consumePreparationRecipe(tx,{store,line,enforceStock,order,user}){
  const rawRecipe=await resolvePreparationRecipe(tx,{store,line});
  if(!rawRecipe.length)return false;
  const recipe=[];
  for(const ingredient of rawRecipe)recipe.push(await resolveIngredientStockTarget(tx,{store,ingredient}));
  for(const ingredient of recipe){
    const qty=Number(line.quantity||0)*Number(ingredient.quantity||0);
    if(qty<=0)continue;
    if(!ingredient.storeProductId&&enforceStock){const error=new Error(`Το υλικό ${ingredient.ingredientName} της συνταγής ${line.productName} δεν υπάρχει στην αποθήκη του καταστήματος.`);error.status=409;throw error}
    if(ingredient.storeProductId&&enforceStock&&Number(ingredient.currentStock||0)<qty){const error=new Error(`Δεν υπάρχει αρκετό stock υλικού για ${line.productName}: ${ingredient.ingredientName}`);error.status=409;throw error}
  }
  const movementUserId=user?.tokenType==="STORE_OPERATOR"?null:(user?.id||null);
  for(const ingredient of recipe){
    const qty=Number(line.quantity||0)*Number(ingredient.quantity||0);
    if(qty<=0||!ingredient.storeProductId)continue;
    const stockProductId=ingredient.stockProductId||ingredient.ingredientProductId;
    await tx.$executeRaw`UPDATE "Product" SET "trackStock"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${stockProductId} AND "companyId"=${store.companyId}`;
    const changed=enforceStock
      ? await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${qty},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${ingredient.storeProductId} AND "storeId"=${store.id} AND "active"=TRUE AND COALESCE("currentStock",0)>=${qty}`
      : await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${qty},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${ingredient.storeProductId} AND "storeId"=${store.id} AND "active"=TRUE`;
    if(!changed){if(enforceStock){const error=new Error(`Δεν μπόρεσε να ενημερωθεί το stock υλικού: ${ingredient.ingredientName}`);error.status=409;throw error}continue}
    await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${crypto.randomUUID()},${store.id},${stockProductId},'RECIPE_CONSUMPTION',${-qty},${null},'ONLINE_ORDER_RECIPE',${order.id},${`ONLINE ΠΑΡΑΓΓΕΛΙΑ · ${order.orderNumber} · Κατανάλωση συνταγής ${line.productName}`},${movementUserId})`;
  }
  const milkModifier=(Array.isArray(line.modifiers)?line.modifiers:[]).find(modifier=>ONLINE_MILK_SKU[String(modifier?.description||modifier?.name||"").trim().toLocaleUpperCase("el-GR")]);
  const milkSku=milkModifier?ONLINE_MILK_SKU[String(milkModifier.description||milkModifier.name||"").trim().toLocaleUpperCase("el-GR")]:null;
  const milkQty=Number(line.quantity||0)*onlineMilkMl(line.productSku);
  if(milkSku&&milkQty>0){
    const milk=(await tx.$queryRaw`SELECT p."id",p."name",sp."id" AS "storeProductId",COALESCE(sp."currentStock",0) AS "currentStock" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."storeId"=${store.id} AND sp."productId"=p."id" AND sp."active"=TRUE WHERE p."companyId"=${store.companyId} AND p."sku"=${milkSku} AND p."active"=TRUE LIMIT 1`)[0];
    if((!milk||!milk.storeProductId)&&enforceStock){const error=new Error(`Το επιλεγμένο γάλα της συνταγής ${line.productName} δεν υπάρχει στην αποθήκη του καταστήματος.`);error.status=409;throw error}
    if(milk?.storeProductId&&enforceStock&&Number(milk.currentStock||0)<milkQty){const error=new Error(`Δεν υπάρχει αρκετό stock γάλακτος για ${line.productName}.`);error.status=409;throw error}
    if(milk?.storeProductId){
      const changed=enforceStock
        ?await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${milkQty},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${milk.storeProductId} AND "storeId"=${store.id} AND "active"=TRUE AND COALESCE("currentStock",0)>=${milkQty}`
        :await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${milkQty},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${milk.storeProductId} AND "storeId"=${store.id} AND "active"=TRUE`;
      if(!changed&&enforceStock){const error=new Error(`Δεν μπόρεσε να ενημερωθεί το stock γάλακτος: ${milk.name}`);error.status=409;throw error}
      if(changed)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${crypto.randomUUID()},${store.id},${milk.id},'RECIPE_CONSUMPTION',${-milkQty},${null},'ONLINE_ORDER_RECIPE',${order.id},${`ONLINE ΠΑΡΑΓΓΕΛΙΑ · ${order.orderNumber} · Γάλα modifier ${line.productName}`},${movementUserId})`;
    }
  }
  return true;
}

async function postCommercialSale(tx,{order,store,user,config}){
  if(order.saleId||order.commercialPostedAt)return order.saleId||null;
  const open=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`)[0];
  if(!open){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Η online παραγγελία δεν μπορεί να κλείσει ως παραδομένη.");error.status=409;throw error}
  const lines=await tx.$queryRaw`SELECT l."productId",l."productName",l."quantity",l."onlineUnitPrice",l."lineTotal",COALESCE(l."modifiersJson",'[]'::jsonb) AS "modifiers",p."sku" AS "productSku",p."vatRate",p."trackStock",COALESCE(sp."currentStock",0) AS "currentStock" FROM "OnlineOrderLine" l JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${store.companyId} JOIN "StoreProduct" sp ON sp."storeId"=${store.id} AND sp."productId"=p."id" AND sp."active"=TRUE WHERE l."orderId"=${order.id} ORDER BY l."createdAt"`;
  if(!lines.length){const error=new Error("Η online παραγγελία δεν έχει γραμμές προϊόντων.");error.status=409;throw error}
  const enforceStock=Boolean(config?.stockCheckEnabled);
  const saleId=crypto.randomUUID(),actorId=user.id,actorName=user.fullName||"Πωλητής",employeeId=user.employeeId||null,total=money(order.total),subtotal=money(order.total);
  await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source") VALUES (${saleId},${store.companyId},${store.id},${employeeId},'NON_FISCAL',${subtotal},0,${total},'COMPLETED',${order.channel||"ONLINE"})`;
  for(const line of lines){
    const mods=Array.isArray(line.modifiers)?line.modifiers:[],modifierText=mods.map(m=>m?.description||m?.name).filter(Boolean).join(" · "),description=modifierText?`${line.productName} · ${modifierText}`:line.productName;
    await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${line.productId},${description},${Number(line.quantity||0)},${money(line.onlineUnitPrice)},0,${Number(line.vatRate||0)},${money(line.lineTotal)})`;
    const consumedRecipe=await consumePreparationRecipe(tx,{store,line,enforceStock,order,user});
    if(consumedRecipe)continue;
    if(line.trackStock){
      const qty=Number(line.quantity||0),changed=enforceStock
        ? await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${qty},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${store.id} AND "productId"=${line.productId} AND "active"=TRUE AND COALESCE("currentStock",0)>=${qty}`
        : await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${qty},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${store.id} AND "productId"=${line.productId} AND "active"=TRUE`;
      if(!changed){const error=new Error(enforceStock?`Δεν υπάρχει αρκετό stock για να ολοκληρωθεί: ${line.productName}`:`Δεν μπόρεσε να ενημερωθεί το stock: ${line.productName}`);error.status=409;throw error}
    }
  }
  if(Number(order.deliveryFee||0)>0)await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${null},'Delivery Online Παραγγελίας',1,${money(order.deliveryFee)},0,24,${money(order.deliveryFee)})`;
  await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},${order.paymentMethod},${total})`;
  const transactionType=order.paymentMethod==="CASH"?"SALE_CASH":"SALE_CARD";
  await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${open.id},${transactionType},${total},${`ONLINE ${order.orderNumber} · ${order.paymentMethod==="CASH"?"ΜΕΤΡΗΤΑ":"ΚΑΡΤΑ"}`},${actorId},${actorName})`;
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${user.operatorId||user.id},${user.id},'ONLINE_SALE_COMPLETED',${JSON.stringify({saleId,onlineOrderId:order.id,orderNumber:order.orderNumber,total,paymentMethod:order.paymentMethod,channel:order.channel,stockCheckEnabled:enforceStock})}::jsonb)`;
  await tx.$executeRaw`UPDATE "OnlineOrder" SET "saleId"=${saleId},"commercialPostedAt"=CURRENT_TIMESTAMP,"paymentStatus"='PAID',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${order.id} AND "saleId" IS NULL`;
  return saleId;
}

router.get("/catalog",safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  const rows=await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock",COALESCE(v."visible",FALSE) AS "onlineVisible" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" LEFT JOIN "OnlineProductVisibility" v ON v."storeId"=sp."storeId" AND v."productId"=sp."productId" WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE AND COALESCE(v."visible",FALSE)=TRUE ORDER BY p."name" ASC`;
  const stockCheckEnabled=Boolean(config.stockCheckEnabled);
  res.json({store:{id:store.id,name:store.name},module:{key:"ONLINE_ORDERING",active:true},settings:{surchargeType:config.surchargeType,surchargeValue:money(config.surchargeValue),deliveryFee:money(config.deliveryFee),pickupEnabled:Boolean(config.pickupEnabled),deliveryEnabled:Boolean(config.deliveryEnabled),cashEnabled:Boolean(config.cashEnabled),cardOnDeliveryEnabled:Boolean(config.cardOnDeliveryEnabled),stockCheckEnabled,minimumOrderRetail:money(config.minimumOrderRetail),minimumOrderStaff:money(config.minimumOrderStaff),minimumOrderPermanentStaff:money(config.minimumOrderPermanentStaff)},products:rows.map(row=>({id:row.id,sku:row.sku,name:row.name,vatRate:Number(row.vatRate||0),storePrice:money(row.storePrice),onlineSurcharge:onlineSurchargeAmount(row.storePrice,config),onlinePrice:onlineUnitPrice(row.storePrice,config),stock:Number(row.currentStock||0),available:stockCheckEnabled?Number(row.currentStock||0)>0:true}))});
}));

router.post("/orders",async(req,res)=>{
  try{
    const body=z.object({idempotencyKey:z.string().min(8).max(160),fulfillmentType:z.enum(["DELIVERY","PICKUP"]),paymentMethod:z.enum(["CASH","CARD"]),customerName:z.string().trim().min(2).max(120),customerPhone:z.string().trim().min(6).max(40),building:z.string().trim().max(120).optional().nullable(),floor:z.string().trim().max(80).optional().nullable(),department:z.string().trim().max(160).optional().nullable(),room:z.string().trim().max(120).optional().nullable(),deliveryNotes:z.string().trim().max(500).optional().nullable(),items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().int().min(1).max(50),modifiers:z.array(z.unknown()).max(30).optional()})).min(1).max(50)}).parse(req.body||{});
    const {store,config}=await onlineContext();
    if(body.fulfillmentType==="DELIVERY"&&!config.deliveryEnabled)return res.status(409).json({error:"Το Delivery δεν είναι διαθέσιμο αυτή τη στιγμή."});
    if(body.fulfillmentType==="PICKUP"&&!config.pickupEnabled)return res.status(409).json({error:"Η παραλαβή από το Κυλικείο δεν είναι διαθέσιμη αυτή τη στιγμή."});
    if(body.paymentMethod==="CASH"&&!config.cashEnabled)return res.status(409).json({error:"Η πληρωμή με μετρητά δεν είναι διαθέσιμη."});
    if(body.paymentMethod==="CARD"&&!config.cardOnDeliveryEnabled)return res.status(409).json({error:"Η πληρωμή με ασύρματο POS δεν είναι διαθέσιμη."});
    if(body.fulfillmentType==="DELIVERY"&&!body.department?.trim())return res.status(400).json({error:"Για Delivery χρειάζεται κλινική ή τμήμα."});

    const duplicate=await prisma.$queryRaw`SELECT "id","orderNumber","status","total","createdAt" FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "idempotencyKey"=${body.idempotencyKey} LIMIT 1`;
    if(duplicate[0])return res.status(200).json({ok:true,duplicate:true,order:duplicate[0]});

    const products=await prisma.$queryRaw`SELECT p."id",p."name",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock",EXISTS(SELECT 1 FROM "PreparationRecipeLine" r WHERE r."companyId"=${store.companyId} AND r."productId"=p."id" AND r."automatic"=TRUE) AS "hasRecipe" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "OnlineProductVisibility" v ON v."storeId"=sp."storeId" AND v."productId"=sp."productId" AND v."visible"=TRUE WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE`;
    const byId=new Map(products.map(row=>[row.id,row])),lines=[],enforceStock=Boolean(config.stockCheckEnabled);
    for(const item of body.items){
      const product=byId.get(item.productId);
      if(!product)return res.status(409).json({error:"Ένα προϊόν δεν είναι πλέον διαθέσιμο Online."});
      if(enforceStock&&!product.hasRecipe&&Number(product.currentStock||0)<item.quantity)return res.status(409).json({error:`Δεν υπάρχει αρκετό απόθεμα για: ${product.name}`});
      const unit=onlineUnitPrice(product.storePrice,config),surcharge=onlineSurchargeAmount(product.storePrice,config),lineTotal=money(unit*item.quantity);
      lines.push({productId:product.id,productName:product.name,quantity:item.quantity,storeUnitPrice:money(product.storePrice),onlineSurcharge:surcharge,onlineUnitPrice:unit,lineTotal,modifiers:item.modifiers||[]});
    }

    const subtotal=money(lines.reduce((sum,row)=>sum+row.lineTotal,0)),deliveryFee=body.fulfillmentType==="DELIVERY"?money(config.deliveryFee):0,total=money(subtotal+deliveryFee),minimum=money(config.minimumOrderRetail||0);
    if(subtotal<minimum)return res.status(409).json({error:`Η ελάχιστη παραγγελία είναι ${minimum.toLocaleString("el-GR",{style:"currency",currency:"EUR"})}.`});

    const id=crypto.randomUUID();
    const serialRow=(await prisma.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "orderNumber" ~ '^KAT-[0-9]+$' THEN substring("orderNumber" from 5)::int ELSE 0 END),0)::int AS value FROM "OnlineOrder" WHERE "storeId"=${store.id}`)[0];
    const serial=Number(serialRow?.value||0)+1;
    const orderNumber=`KAT-${String(serial).padStart(3,"0")}`;

    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "OnlineOrder" ("id","companyId","storeId","orderNumber","channel","fulfillmentType","status","paymentMethod","customerName","customerPhone","building","floor","department","room","deliveryNotes","subtotal","deliveryFee","total","idempotencyKey") VALUES (${id},${store.companyId},${store.id},${orderNumber},${body.fulfillmentType==="DELIVERY"?"ONLINE_DELIVERY":"ONLINE"},${body.fulfillmentType},'NEW',${body.paymentMethod},${body.customerName},${body.customerPhone},${body.building||null},${body.floor||null},${body.department||null},${body.room||null},${body.deliveryNotes||null},${subtotal},${deliveryFee},${total},${body.idempotencyKey})`;
      for(const row of lines)await tx.$executeRaw`INSERT INTO "OnlineOrderLine" ("id","orderId","productId","productName","quantity","storeUnitPrice","onlineSurcharge","onlineUnitPrice","lineTotal","modifiersJson") VALUES (${crypto.randomUUID()},${id},${row.productId},${row.productName},${row.quantity},${row.storeUnitPrice},${row.onlineSurcharge},${row.onlineUnitPrice},${row.lineTotal},${JSON.stringify(row.modifiers)}::jsonb)`;
      await addOrderEvent(tx,{orderId:id,toStatus:"NEW",note:"ORDER_RECEIVED"});
    });
    return res.status(201).json({ok:true,order:{id,orderNumber,status:"NEW",fulfillmentType:body.fulfillmentType,paymentMethod:body.paymentMethod,subtotal,deliveryFee,total}});
  }catch(error){
    console.error("KAT online order create failed:",error);
    if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα στοιχεία της παραγγελίας."});
    if(error?.status)return res.status(error.status).json({error:error.message});
    return res.status(500).json({error:"Η παραγγελία δεν αποθηκεύτηκε. Κωδικός: KAT_ORDER_CREATE"});
  }
});

router.get("/backoffice/stores/:storeId/orders",auth,safe(async(req,res)=>{
  const {store}=await onlineContext();
  if(req.user?.tokenType==="STORE_OPERATOR")return res.status(403).json({error:"Η προβολή BackOffice δεν είναι διαθέσιμη από λογαριασμό POS."});
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const limit=Math.min(Math.max(Number(req.query.limit||150),1),300);
  const rows=await prisma.$queryRaw`SELECT o.*,COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'productName',l."productName",'quantity',l."quantity",'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items",COALESCE((SELECT json_agg(json_build_object('id',e."id",'fromStatus',e."fromStatus",'toStatus',e."toStatus",'userId',e."userId",'employeeId',e."employeeId",'note',e."note",'createdAt',e."createdAt") ORDER BY e."createdAt") FROM "OnlineOrderStatusEvent" e WHERE e."orderId"=o."id"),'[]') AS "events",CASE WHEN o."saleId" IS NULL THEN NULL ELSE (SELECT json_build_object('id',s."id",'total',s."total",'status',s."status",'source',s."source",'createdAt',s."createdAt",'payments',COALESCE((SELECT json_agg(json_build_object('id',p."id",'method',p."method",'amount',p."amount")) FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json),'stockLines',COALESCE((SELECT json_agg(json_build_object('productId',sl."productId",'description',sl."description",'quantity',sl."quantity",'lineTotal',sl."lineTotal",'trackStock',COALESCE(pr."trackStock",false)) ORDER BY sl."id") FROM "SaleLine" sl LEFT JOIN "Product" pr ON pr."id"=sl."productId" WHERE sl."saleId"=s."id"),'[]'::json)) FROM "Sale" s WHERE s."id"=o."saleId" LIMIT 1) END AS "sale",(SELECT json_build_object('id',t."id",'sessionId',t."sessionId",'type',t."type",'amount',t."amount",'description',t."description",'actorName',t."actorName",'createdAt',t."createdAt") FROM "StoreTransaction" t WHERE t."storeId"=o."storeId" AND t."description" LIKE ${'ONLINE %'} || o."orderNumber" || '%' ORDER BY t."createdAt" DESC LIMIT 1) AS "shiftTransaction" FROM "OnlineOrder" o WHERE o."storeId"=${store.id} ORDER BY o."createdAt" DESC LIMIT ${limit}`;
  const normalized=rows.map(row=>({...row,subtotal:money(row.subtotal),deliveryFee:money(row.deliveryFee),total:money(row.total),items:(row.items||[]).map(item=>({...item,quantity:Number(item.quantity||0),onlineUnitPrice:money(item.onlineUnitPrice),lineTotal:money(item.lineTotal)})),sale:row.sale?{...row.sale,total:money(row.sale.total),payments:(row.sale.payments||[]).map(payment=>({...payment,amount:money(payment.amount)})),stockLines:(row.sale.stockLines||[]).map(line=>({...line,quantity:Number(line.quantity||0),lineTotal:money(line.lineTotal)}))}:null,shiftTransaction:row.shiftTransaction?{...row.shiftTransaction,amount:money(row.shiftTransaction.amount)}:null}));
  res.json({module:{key:"ONLINE_ORDERING",active:true},store:{id:store.id,name:store.name},count:normalized.length,rows:normalized});
}));

router.get("/pos/stores/:storeId/orders",auth,operatorGuard,safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const rows=await orderRows(store.id),newCount=rows.filter(row=>row.status==="NEW").length;
  res.json({module:{key:"ONLINE_ORDERING",active:true},store:{id:store.id,name:store.name},newCount,activeCount:rows.length,autoPrintOnAccept:Boolean(config.autoPrintOnAccept),stockCheckEnabled:Boolean(config.stockCheckEnabled),rows:rows.map(row=>({...row,subtotal:money(row.subtotal),deliveryFee:money(row.deliveryFee),total:money(row.total),items:(row.items||[]).map(item=>({...item,quantity:Number(item.quantity||0),onlineUnitPrice:money(item.onlineUnitPrice),lineTotal:money(item.lineTotal)}))}))});
}));

router.get("/pos/stores/:storeId/orders/:orderId/print",auth,operatorGuard,safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const rows=await prisma.$queryRaw`SELECT o.*,COALESCE((SELECT json_agg(json_build_object('productName',l."productName",'quantity',l."quantity",'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items" FROM "OnlineOrder" o WHERE o."id"=${req.params.orderId} AND o."storeId"=${store.id} LIMIT 1`;
  if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
  await addOrderEvent(prisma,{orderId:rows[0].id,fromStatus:rows[0].status,toStatus:rows[0].status,employeeId:req.user.employeeId||null,note:"PRINT_REQUESTED"});
  res.json({print:printPayload(rows[0],config)});
}));

router.post("/pos/stores/:storeId/orders/:orderId/status",auth,operatorGuard,safe(async(req,res)=>{
  const body=z.object({status:z.enum(["ACCEPTED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"]),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{}),{store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const current=(await prisma.$queryRaw`SELECT * FROM "OnlineOrder" WHERE "id"=${req.params.orderId} AND "storeId"=${store.id} LIMIT 1`)[0];
  if(!current)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
  const expected=NEXT_STATUS[current.status],pickupReadyToDelivered=current.fulfillmentType==="PICKUP"&&current.status==="READY"&&body.status==="DELIVERED";
  if(body.status!==expected&&!pickupReadyToDelivered)return res.status(409).json({error:`Η παραγγελία είναι σε κατάσταση ${current.status} και δεν μπορεί να μεταβεί σε ${body.status}.`});
  const acceptedAt=body.status==="ACCEPTED"?new Date():null,readyAt=body.status==="READY"?new Date():null,deliveredAt=body.status==="DELIVERED"?new Date():null;
  let saleId=current.saleId||null;
  await prisma.$transaction(async tx=>{
    if(body.status==="DELIVERED")saleId=await postCommercialSale(tx,{order:current,store,user:req.user,config});
    await tx.$executeRaw`UPDATE "OnlineOrder" SET "status"=${body.status},"assignedEmployeeId"=COALESCE("assignedEmployeeId",${req.user.employeeId||null}),"acceptedAt"=COALESCE(${acceptedAt},"acceptedAt"),"readyAt"=COALESCE(${readyAt},"readyAt"),"deliveredAt"=COALESCE(${deliveredAt},"deliveredAt"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${current.id}`;
    await addOrderEvent(tx,{orderId:current.id,fromStatus:current.status,toStatus:body.status,userId:req.user.tokenType==="STORE_OPERATOR"?null:req.user.id,employeeId:req.user.employeeId||null,note:body.note||null});
    if(body.status==="ACCEPTED"&&config.autoPrintOnAccept)await addOrderEvent(tx,{orderId:current.id,fromStatus:body.status,toStatus:body.status,employeeId:req.user.employeeId||null,note:"AUTO_PRINT_REQUESTED"});
  });
  const updated=(await orderRows(store.id,[body.status]))?.find(row=>row.id===current.id)||{...current,status:body.status};
  res.json({ok:true,order:{id:current.id,orderNumber:current.orderNumber,status:body.status,saleId},print:body.status==="ACCEPTED"?printPayload(updated,config):null});
}));

export default router;
