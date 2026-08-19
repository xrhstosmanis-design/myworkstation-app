import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {ensureKatOnlineOrderingSchema,getOnlineOrderingConfig,onlineSurchargeAmount,onlineUnitPrice} from "../kat-online-ordering-bootstrap.js";

const router=Router();
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";
const money=value=>Math.round(Number(value||0)*100)/100;

async function ensure(){await ensureKatOnlineOrderingSchema()}
function safe(handler){return async(req,res,next)=>{try{await ensure();await handler(req,res)}catch(error){next(error)}}}
async function context(){
  const stores=await prisma.$queryRaw`SELECT "id","name","companyId" FROM "Store" WHERE "active"=TRUE AND LOWER("name")=LOWER(${KAT_STORE_NAME}) ORDER BY "createdAt" LIMIT 1`;
  const store=stores[0];if(!store){const e=new Error("Το Κυλικείο ΚΑΤ δεν είναι διαθέσιμο.");e.status=503;throw e}
  const modules=await prisma.$queryRaw`SELECT "active","startsAt","endsAt" FROM "CompanyModule" WHERE "companyId"=${store.companyId} AND "moduleKey"='ONLINE_ORDERING' LIMIT 1`;
  const m=modules[0],now=Date.now(),active=Boolean(m?.active)&&(!m.startsAt||new Date(m.startsAt).getTime()<=now)&&(!m.endsAt||new Date(m.endsAt).getTime()>=now);
  if(!active){const e=new Error("Οι Online Παραγγελίες δεν είναι ενεργές για το κατάστημα.");e.status=403;throw e}
  const config=await getOnlineOrderingConfig(store.id);if(!config?.enabled){const e=new Error("Το Online κατάστημα είναι προσωρινά κλειστό.");e.status=503;throw e}
  return{store,config};
}

function productType(name=""){
  const n=String(name).toLocaleUpperCase("el-GR");
  if(/FREDDO|ESPRESSO|CAPPU|CAPPUCC|ΕΛΛΗΝ|LATTE|MACCHI|FLAT\s*WHITE|ΚΑΦ/.test(n))return"COFFEE";
  if(/ΣΟΚΟΛ|ΤΣΑΙ|ΤΣΑΪ|ΡΟΦΗΜ|MATCHA/.test(n))return"BEVERAGE";
  return"OTHER";
}
function groupAllowed(type,description=""){
  const g=String(description).toLocaleUpperCase("el-GR");
  if(type==="COFFEE")return /ΖΑΧΑΡ|ΓΛΥΚ|ΓΑΛ|ΜΕΓΕΘ|ΜΟΝ|ΔΙΠΛ|ΔΟΣ|ΚΑΦ|EXTRA|ΕΞΤΡΑ|ΣΙΡΟΠ|ΚΑΝΕΛ|ΣΟΚΟΛ/.test(g);
  if(type==="BEVERAGE")return /ΖΑΧΑΡ|ΓΛΥΚ|ΓΑΛ|ΜΕΓΕΘ|ΣΙΡΟΠ|ΚΑΝΕΛ|ΣΟΚΟΛ|EXTRA|ΕΞΤΡΑ/.test(g);
  return false;
}
async function modifierCatalog(companyId){
  try{
    const rows=await prisma.$queryRaw`
      SELECT g."id" AS "groupId",g."description" AS "groupDescription",g."legacyId",
             m."id" AS "modifierId",m."sequence",m."description" AS "modifierDescription",m."price"
      FROM "ManagementModifierGroup" g
      JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=TRUE
      WHERE g."companyId"=${companyId} AND g."active"=TRUE
      ORDER BY COALESCE(g."legacyId",2147483647),g."description",m."sequence",m."description"`;
    const map=new Map();for(const row of rows){if(!map.has(row.groupId))map.set(row.groupId,{id:row.groupId,description:row.groupDescription,legacyId:row.legacyId,items:[]});map.get(row.groupId).items.push({id:row.modifierId,description:row.modifierDescription,price:money(row.price),sequence:Number(row.sequence||0)})}return[...map.values()];
  }catch{return[]}
}
function groupsForProduct(product,groups){const type=productType(product.name);return groups.filter(g=>groupAllowed(type,g.description)).map(g=>g.id)}

router.get("/catalog-modifiers",safe(async(req,res)=>{
  const {store,config}=await context();
  const [products,groups]=await Promise.all([
    prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE ORDER BY p."name"`,
    modifierCatalog(store.companyId)
  ]);
  res.json({store:{id:store.id,name:store.name},settings:{surchargeType:config.surchargeType,surchargeValue:money(config.surchargeValue),deliveryFee:money(config.deliveryFee),pickupEnabled:Boolean(config.pickupEnabled),deliveryEnabled:Boolean(config.deliveryEnabled),cashEnabled:Boolean(config.cashEnabled),cardOnDeliveryEnabled:Boolean(config.cardOnDeliveryEnabled)},modifierGroups:groups,products:products.map(p=>({id:p.id,sku:p.sku,name:p.name,vatRate:Number(p.vatRate||0),storePrice:money(p.storePrice),onlineSurcharge:onlineSurchargeAmount(p.storePrice,config),onlinePrice:onlineUnitPrice(p.storePrice,config),stock:Number(p.currentStock||0),available:Number(p.currentStock||0)>0,modifierGroupIds:groupsForProduct(p,groups)}))});
}));

const orderSchema=z.object({
  idempotencyKey:z.string().min(8).max(160),fulfillmentType:z.enum(["DELIVERY","PICKUP"]),paymentMethod:z.enum(["CASH","CARD"]),
  customerName:z.string().trim().min(2).max(120),customerPhone:z.string().trim().min(6).max(40),building:z.string().trim().max(120).optional().nullable(),floor:z.string().trim().max(80).optional().nullable(),department:z.string().trim().max(160).optional().nullable(),room:z.string().trim().max(120).optional().nullable(),deliveryNotes:z.string().trim().max(500).optional().nullable(),
  items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().int().min(1).max(50),modifierIds:z.array(z.string().min(1)).max(20).default([])})).min(1).max(50)
});

router.post("/orders-with-modifiers",safe(async(req,res)=>{
  const body=orderSchema.parse(req.body||{}),{store,config}=await context();
  if(body.fulfillmentType==="DELIVERY"&&!config.deliveryEnabled)return res.status(409).json({error:"Το Delivery δεν είναι διαθέσιμο αυτή τη στιγμή."});
  if(body.fulfillmentType==="PICKUP"&&!config.pickupEnabled)return res.status(409).json({error:"Η παραλαβή από το Κυλικείο δεν είναι διαθέσιμη αυτή τη στιγμή."});
  if(body.paymentMethod==="CASH"&&!config.cashEnabled)return res.status(409).json({error:"Η πληρωμή με μετρητά δεν είναι διαθέσιμη."});
  if(body.paymentMethod==="CARD"&&!config.cardOnDeliveryEnabled)return res.status(409).json({error:"Η πληρωμή με ασύρματο POS δεν είναι διαθέσιμη."});
  if(body.fulfillmentType==="DELIVERY"&&!body.department?.trim())return res.status(400).json({error:"Για Delivery χρειάζεται κλινική ή τμήμα."});
  const duplicate=await prisma.$queryRaw`SELECT "id","orderNumber","status","total","createdAt" FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "idempotencyKey"=${body.idempotencyKey} LIMIT 1`;if(duplicate[0])return res.json({ok:true,duplicate:true,order:duplicate[0]});
  const productIds=[...new Set(body.items.map(i=>i.productId))],products=await prisma.$queryRaw`SELECT p."id",p."name",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE AND p."id"=ANY(${productIds}::text[])`;
  const byId=new Map(products.map(p=>[p.id,p])),groups=await modifierCatalog(store.companyId),groupById=new Map(groups.map(g=>[g.id,g])),modifierById=new Map();for(const g of groups)for(const m of g.items)modifierById.set(m.id,{...m,groupId:g.id,groupDescription:g.description});
  const lines=[];
  for(const item of body.items){const product=byId.get(item.productId);if(!product)return res.status(409).json({error:"Ένα προϊόν δεν είναι πλέον διαθέσιμο."});if(Number(product.currentStock||0)<item.quantity)return res.status(409).json({error:`Δεν υπάρχει αρκετό απόθεμα για: ${product.name}`});const allowedGroups=new Set(groupsForProduct(product,groups)),selected=[];for(const id of [...new Set(item.modifierIds)]){const m=modifierById.get(id);if(!m||!allowedGroups.has(m.groupId))return res.status(409).json({error:`Μη έγκυρη επιλογή για: ${product.name}`});selected.push({id:m.id,groupId:m.groupId,group:m.groupDescription,description:m.description,price:money(m.price)})}const modifierTotal=money(selected.reduce((s,m)=>s+m.price,0)),baseOnline=onlineUnitPrice(product.storePrice,config),unit=money(baseOnline+modifierTotal),lineTotal=money(unit*item.quantity);lines.push({productId:product.id,productName:product.name,quantity:item.quantity,storeUnitPrice:money(product.storePrice),onlineSurcharge:onlineSurchargeAmount(product.storePrice,config),onlineUnitPrice:unit,lineTotal,modifiers:selected})}
  const subtotal=money(lines.reduce((s,l)=>s+l.lineTotal,0)),deliveryFee=body.fulfillmentType==="DELIVERY"?money(config.deliveryFee):0,total=money(subtotal+deliveryFee),id=crypto.randomUUID(),serial=(await prisma.$queryRaw`SELECT COUNT(*)::int AS value FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "createdAt">=CURRENT_DATE`)[0]?.value||0,orderNumber=`KAT-${String(serial+1).padStart(3,"0")}`;
  await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "OnlineOrder" ("id","companyId","storeId","orderNumber","channel","fulfillmentType","status","paymentMethod","customerName","customerPhone","building","floor","department","room","deliveryNotes","subtotal","deliveryFee","total","idempotencyKey") VALUES (${id},${store.companyId},${store.id},${orderNumber},${body.fulfillmentType==="DELIVERY"?"ONLINE_DELIVERY":"ONLINE"},${body.fulfillmentType},'NEW',${body.paymentMethod},${body.customerName},${body.customerPhone},${body.building||null},${body.floor||null},${body.department||null},${body.room||null},${body.deliveryNotes||null},${subtotal},${deliveryFee},${total},${body.idempotencyKey})`;for(const row of lines)await tx.$executeRaw`INSERT INTO "OnlineOrderLine" ("id","orderId","productId","productName","quantity","storeUnitPrice","onlineSurcharge","onlineUnitPrice","lineTotal","modifiersJson") VALUES (${crypto.randomUUID()},${id},${row.productId},${row.productName},${row.quantity},${row.storeUnitPrice},${row.onlineSurcharge},${row.onlineUnitPrice},${row.lineTotal},${JSON.stringify(row.modifiers)}::jsonb)`;await tx.$executeRaw`INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","toStatus","note") VALUES (${crypto.randomUUID()},${id},'NEW','Online order submitted with authoritative modifiers')`});
  res.status(201).json({ok:true,order:{id,orderNumber,status:"NEW",fulfillmentType:body.fulfillmentType,paymentMethod:body.paymentMethod,subtotal,deliveryFee,total}});
}));

export default router;
