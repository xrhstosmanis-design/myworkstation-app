import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {ensureKatOnlineOrderingSchema,getOnlineOrderingConfig,onlineSurchargeAmount,onlineUnitPrice} from "../kat-online-ordering-bootstrap.js";

const router=Router();
const money=value=>Math.round(Number(value||0)*100)/100;
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";
const ACTIVE_STATUSES=["NEW","ACCEPTED","PREPARING","READY","OUT_FOR_DELIVERY"];
const NEXT_STATUS={NEW:"ACCEPTED",ACCEPTED:"PREPARING",PREPARING:"READY",READY:"OUT_FOR_DELIVERY",OUT_FOR_DELIVERY:"DELIVERED"};

async function ensure(){await ensureKatOnlineOrderingSchema()}
async function katStore(){
  const rows=await prisma.$queryRaw`SELECT s."id",s."name",s."companyId",s."active" FROM "Store" s WHERE s."active"=TRUE AND LOWER(s."name")=LOWER(${KAT_STORE_NAME}) ORDER BY s."createdAt" ASC LIMIT 1`;
  const store=rows[0];
  if(!store){const error=new Error("Το Κυλικείο ΚΑΤ δεν είναι διαθέσιμο αυτή τη στιγμή.");error.status=503;throw error}
  return store;
}
async function onlineContext(){
  const store=await katStore();
  const modules=await prisma.$queryRaw`SELECT "active","startsAt","endsAt" FROM "CompanyModule" WHERE "companyId"=${store.companyId} AND "moduleKey"='ONLINE_ORDERING' LIMIT 1`;
  const module=modules[0],now=Date.now(),moduleActive=Boolean(module?.active)&&(!module.startsAt||new Date(module.startsAt).getTime()<=now)&&(!module.endsAt||new Date(module.endsAt).getTime()>=now);
  if(!moduleActive){const error=new Error("Οι Online Παραγγελίες δεν είναι ενεργές για το κατάστημα.");error.status=403;throw error}
  const config=await getOnlineOrderingConfig(store.id);
  if(!config?.enabled){const error=new Error("Το Online κατάστημα είναι προσωρινά κλειστό.");error.status=503;throw error}
  return{store,config};
}
function safe(handler){return async(req,res,next)=>{try{await ensure();await handler(req,res)}catch(error){next(error)}}}
function operatorGuard(req,res,next){
  if(req.user?.tokenType!=="STORE_OPERATOR")return res.status(403).json({error:"Η λειτουργία Online Παραγγελιών είναι διαθέσιμη από το POS καταστήματος."});
  if(String(req.user.storeId||"")!==String(req.params.storeId||""))return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  next();
}
async function orderRows(storeId,statuses=ACTIVE_STATUSES){
  return prisma.$queryRaw`
    SELECT o.*,
      COALESCE((SELECT json_agg(json_build_object(
        'id',l."id",'productId',l."productId",'productName',l."productName",'quantity',l."quantity",
        'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)
      ) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items"
    FROM "OnlineOrder" o
    WHERE o."storeId"=${storeId} AND o."status"=ANY(${statuses}::text[])
    ORDER BY CASE o."status" WHEN 'NEW' THEN 0 WHEN 'ACCEPTED' THEN 1 WHEN 'PREPARING' THEN 2 WHEN 'READY' THEN 3 WHEN 'OUT_FOR_DELIVERY' THEN 4 ELSE 9 END,o."createdAt" ASC`;
}
function printPayload(order,config){
  return {
    title:"ΚΥΛΙΚΕΙΟ ΚΑΤ · ONLINE",
    orderNumber:order.orderNumber,
    createdAt:order.createdAt,
    fulfillmentType:order.fulfillmentType,
    paymentMethod:order.paymentMethod,
    customerName:order.customerName,
    customerPhone:order.customerPhone,
    location:[order.building,order.floor,order.department,order.room].filter(Boolean).join(" · "),
    deliveryNotes:order.deliveryNotes||null,
    items:(order.items||[]).map(row=>({productName:row.productName,quantity:Number(row.quantity||0),unitPrice:money(row.onlineUnitPrice),lineTotal:money(row.lineTotal),modifiers:Array.isArray(row.modifiers)?row.modifiers:[]})),
    subtotal:money(order.subtotal),deliveryFee:money(order.deliveryFee),total:money(order.total),
    autoPrint:Boolean(config?.autoPrintOnAccept)
  };
}

router.get("/catalog",safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  const rows=await prisma.$queryRaw`
    SELECT p."id",p."sku",p."name",p."vatRate",
           COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",
           COALESCE(sp."currentStock",0) AS "currentStock"
    FROM "StoreProduct" sp
    JOIN "Product" p ON p."id"=sp."productId"
    WHERE sp."storeId"=${store.id} AND p."companyId"=${store.companyId} AND p."active"=TRUE
    ORDER BY p."name" ASC`;
  res.json({
    store:{id:store.id,name:store.name},
    module:{key:"ONLINE_ORDERING",active:true},
    settings:{
      surchargeType:config.surchargeType,
      surchargeValue:money(config.surchargeValue),
      deliveryFee:money(config.deliveryFee),
      pickupEnabled:Boolean(config.pickupEnabled),
      deliveryEnabled:Boolean(config.deliveryEnabled),
      cashEnabled:Boolean(config.cashEnabled),
      cardOnDeliveryEnabled:Boolean(config.cardOnDeliveryEnabled)
    },
    products:rows.map(row=>({id:row.id,sku:row.sku,name:row.name,vatRate:Number(row.vatRate||0),storePrice:money(row.storePrice),onlineSurcharge:onlineSurchargeAmount(row.storePrice,config),onlinePrice:onlineUnitPrice(row.storePrice,config),stock:Number(row.currentStock||0),available:Number(row.currentStock||0)>0}))
  });
}));

router.post("/orders",safe(async(req,res)=>{
  const body=z.object({
    idempotencyKey:z.string().min(8).max(160),
    fulfillmentType:z.enum(["DELIVERY","PICKUP"]),
    paymentMethod:z.enum(["CASH","CARD"]),
    customerName:z.string().trim().min(2).max(120),
    customerPhone:z.string().trim().min(6).max(40),
    building:z.string().trim().max(120).optional().nullable(),
    floor:z.string().trim().max(80).optional().nullable(),
    department:z.string().trim().max(160).optional().nullable(),
    room:z.string().trim().max(120).optional().nullable(),
    deliveryNotes:z.string().trim().max(500).optional().nullable(),
    items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().int().min(1).max(50),modifiers:z.array(z.unknown()).max(30).optional()})).min(1).max(50)
  }).parse(req.body||{});
  const {store,config}=await onlineContext();
  if(body.fulfillmentType==="DELIVERY"&&!config.deliveryEnabled)return res.status(409).json({error:"Το Delivery δεν είναι διαθέσιμο αυτή τη στιγμή."});
  if(body.fulfillmentType==="PICKUP"&&!config.pickupEnabled)return res.status(409).json({error:"Η παραλαβή από το Κυλικείο δεν είναι διαθέσιμη αυτή τη στιγμή."});
  if(body.paymentMethod==="CASH"&&!config.cashEnabled)return res.status(409).json({error:"Η πληρωμή με μετρητά δεν είναι διαθέσιμη."});
  if(body.paymentMethod==="CARD"&&!config.cardOnDeliveryEnabled)return res.status(409).json({error:"Η πληρωμή με ασύρματο POS δεν είναι διαθέσιμη."});
  if(body.fulfillmentType==="DELIVERY"&&!body.department?.trim())return res.status(400).json({error:"Για Delivery χρειάζεται κλινική ή τμήμα."});
  const duplicate=await prisma.$queryRaw`SELECT "id","orderNumber","status","total","createdAt" FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "idempotencyKey"=${body.idempotencyKey} LIMIT 1`;
  if(duplicate[0])return res.status(200).json({ok:true,duplicate:true,order:duplicate[0]});
  const ids=[...new Set(body.items.map(row=>row.productId))];
  const products=await prisma.$queryRaw`
    SELECT p."id",p."name",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock"
    FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId"
    WHERE sp."storeId"=${store.id} AND p."companyId"=${store.companyId} AND p."active"=TRUE AND p."id"=ANY(${ids}::text[])`;
  const byId=new Map(products.map(row=>[row.id,row]));
  const lines=[];
  for(const item of body.items){
    const product=byId.get(item.productId);
    if(!product)return res.status(409).json({error:"Ένα προϊόν δεν είναι πλέον διαθέσιμο."});
    if(Number(product.currentStock||0)<item.quantity)return res.status(409).json({error:`Δεν υπάρχει αρκετό απόθεμα για: ${product.name}`});
    const unit=onlineUnitPrice(product.storePrice,config),surcharge=onlineSurchargeAmount(product.storePrice,config),lineTotal=money(unit*item.quantity);
    lines.push({productId:product.id,productName:product.name,quantity:item.quantity,storeUnitPrice:money(product.storePrice),onlineSurcharge:surcharge,onlineUnitPrice:unit,lineTotal,modifiers:item.modifiers||[]});
  }
  const subtotal=money(lines.reduce((sum,row)=>sum+row.lineTotal,0));
  const deliveryFee=body.fulfillmentType==="DELIVERY"?money(config.deliveryFee):0;
  const total=money(subtotal+deliveryFee);
  const id=crypto.randomUUID();
  const serial=(await prisma.$queryRaw`SELECT COUNT(*)::int AS value FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "createdAt">=CURRENT_DATE`)[0]?.value||0;
  const orderNumber=`KAT-${String(serial+1).padStart(3,"0")}`;
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO "OnlineOrder" ("id","companyId","storeId","orderNumber","channel","fulfillmentType","status","paymentMethod","customerName","customerPhone","building","floor","department","room","deliveryNotes","subtotal","deliveryFee","total","idempotencyKey") VALUES (${id},${store.companyId},${store.id},${orderNumber},${body.fulfillmentType==="DELIVERY"?"ONLINE_DELIVERY":"ONLINE"},${body.fulfillmentType},'NEW',${body.paymentMethod},${body.customerName},${body.customerPhone},${body.building||null},${body.floor||null},${body.department||null},${body.room||null},${body.deliveryNotes||null},${subtotal},${deliveryFee},${total},${body.idempotencyKey})`;
    for(const row of lines)await tx.$executeRaw`INSERT INTO "OnlineOrderLine" ("id","orderId","productId","productName","quantity","storeUnitPrice","onlineSurcharge","onlineUnitPrice","lineTotal","modifiersJson") VALUES (${crypto.randomUUID()},${id},${row.productId},${row.productName},${row.quantity},${row.storeUnitPrice},${row.onlineSurcharge},${row.onlineUnitPrice},${row.lineTotal},${JSON.stringify(row.modifiers)}::jsonb)`;
    await tx.$executeRaw`INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","toStatus","note") VALUES (${crypto.randomUUID()},${id},'NEW','Online order submitted')`;
  });
  res.status(201).json({ok:true,order:{id,orderNumber,status:"NEW",fulfillmentType:body.fulfillmentType,paymentMethod:body.paymentMethod,subtotal,deliveryFee,total}});
}));

router.get("/pos/stores/:storeId/orders",auth,operatorGuard,safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const rows=await orderRows(store.id);
  const newCount=rows.filter(row=>row.status==="NEW").length;
  res.json({module:{key:"ONLINE_ORDERING",active:true},store:{id:store.id,name:store.name},newCount,activeCount:rows.length,autoPrintOnAccept:Boolean(config.autoPrintOnAccept),rows:rows.map(row=>({...row,subtotal:money(row.subtotal),deliveryFee:money(row.deliveryFee),total:money(row.total),items:(row.items||[]).map(item=>({...item,quantity:Number(item.quantity||0),onlineUnitPrice:money(item.onlineUnitPrice),lineTotal:money(item.lineTotal)}))}))});
}));

router.get("/pos/stores/:storeId/orders/:orderId/print",auth,operatorGuard,safe(async(req,res)=>{
  const {store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const rows=await prisma.$queryRaw`SELECT o.*,COALESCE((SELECT json_agg(json_build_object('productName',l."productName",'quantity',l."quantity",'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items" FROM "OnlineOrder" o WHERE o."id"=${req.params.orderId} AND o."storeId"=${store.id} LIMIT 1`;
  if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
  res.json({print:printPayload(rows[0],config)});
}));

router.post("/pos/stores/:storeId/orders/:orderId/status",auth,operatorGuard,safe(async(req,res)=>{
  const body=z.object({status:z.enum(["ACCEPTED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"]),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});
  const {store,config}=await onlineContext();
  if(store.id!==req.params.storeId||store.companyId!==req.user.companyId)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  const current=(await prisma.$queryRaw`SELECT * FROM "OnlineOrder" WHERE "id"=${req.params.orderId} AND "storeId"=${store.id} LIMIT 1`)[0];
  if(!current)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
  const expected=NEXT_STATUS[current.status];
  const pickupReadyToDelivered=current.fulfillmentType==="PICKUP"&&current.status==="READY"&&body.status==="DELIVERED";
  if(body.status!==expected&&!pickupReadyToDelivered)return res.status(409).json({error:`Η παραγγελία είναι σε κατάσταση ${current.status} και δεν μπορεί να μεταβεί σε ${body.status}.`});
  const acceptedAt=body.status==="ACCEPTED"?new Date():null,readyAt=body.status==="READY"?new Date():null,deliveredAt=body.status==="DELIVERED"?new Date():null;
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE "OnlineOrder" SET "status"=${body.status},"assignedEmployeeId"=COALESCE("assignedEmployeeId",${req.user.employeeId||null}),"acceptedAt"=COALESCE(${acceptedAt},"acceptedAt"),"readyAt"=COALESCE(${readyAt},"readyAt"),"deliveredAt"=COALESCE(${deliveredAt},"deliveredAt"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${current.id}`;
    await tx.$executeRaw`INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","fromStatus","toStatus","employeeId","note") VALUES (${crypto.randomUUID()},${current.id},${current.status},${body.status},${req.user.employeeId||null},${body.note||null})`;
  });
  const updated=(await orderRows(store.id,[body.status]))?.find(row=>row.id===current.id)||{...current,status:body.status};
  res.json({ok:true,order:{id:current.id,orderNumber:current.orderNumber,status:body.status},print:body.status==="ACCEPTED"?printPayload(updated,config):null});
}));

export default router;
