import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensureKatOnlineOrderingSchema,getOnlineOrderingConfig,onlineSurchargeAmount,onlineUnitPrice} from "../kat-online-ordering-bootstrap.js";

const router=Router();
const money=value=>Math.round(Number(value||0)*100)/100;
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";

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

export default router;
