import {Router} from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {ensureKatOnlineOrderingSchema,getOnlineOrderingConfig,onlineSurchargeAmount,onlineUnitPrice} from "../kat-online-ordering-bootstrap.js";

const router=Router();
const KAT_STORE_NAME="Κυλικείο ΚΑΤ";
const TEST_STORE_ID="kat-test-store";
const TEST_COMPANY_ID="kat-test-company";
const money=value=>Math.round(Number(value||0)*100)/100;
const memberTokenSecret=()=>String(process.env.JWT_SECRET||process.env.PARAMETERS_ENCRYPTION_KEY||"");
const issueMemberToken=payload=>{
  const secret=memberTokenSecret();
  if(!secret){const error=new Error("Η ειδική τιμή προσωπικού δεν είναι διαθέσιμη: λείπει ασφαλής ρύθμιση server.");error.status=503;throw error}
  return jwt.sign(payload,secret,{expiresIn:"12h"});
};
const phoneNormalized=value=>String(value||"").replace(/\D/g,"");
const memberDiscount=(config,type)=>money(type==="DOCTOR"?config.doctorDiscountPercent:config.nurseDiscountPercent);
const specialPrice=(price,config,type)=>money(Number(price||0)*(1-memberDiscount(config,type)/100));
async function verifiedMember(req,store){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!token)return null;
  try{const payload=jwt.verify(token,memberTokenSecret());if(payload?.storeId!==store.id||!["DOCTOR","NURSE"].includes(payload?.memberType)||!payload?.memberId)return null;const row=(await prisma.$queryRaw`SELECT "id","memberType","active" FROM "OnlineStoreMember" WHERE "id"=${payload.memberId} AND "storeId"=${store.id} LIMIT 1`)[0];return row?.active&&row.memberType===payload.memberType?row:null}catch{return null}
}
const dayCodes={Mon:"MON",Tue:"TUE",Wed:"WED",Thu:"THU",Fri:"FRI",Sat:"SAT",Sun:"SUN"};
export function onlineStoreOpen(config,now=new Date()){
  const hours=config?.weeklyHours&&typeof config.weeklyHours==="object"?config.weeklyHours:{};
  if(!Object.keys(hours).length)return true;
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:config.timezone||"Europe/Athens",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(part=>[part.type,part.value]));
  const rule=hours[dayCodes[parts.weekday]],current=`${parts.hour}:${parts.minute}`;
  if(!rule?.enabled)return false;
  return rule.start<=rule.end?current>=rule.start&&current<=rule.end:current>=rule.start||current<=rule.end;
}

async function ensure(){await ensureKatOnlineOrderingSchema()}
function safe(handler){return async(req,res,next)=>{try{await ensure();await handler(req,res)}catch(error){next(error)}}}
const isPlatformSuperAdmin=user=>user?.isSuperAdmin===true||user?.platformRole==="SUPER_ADMIN";
async function context(publicSlug=null){
  const stores=publicSlug
    ?await prisma.$queryRaw`SELECT s."id",s."name",s."companyId" FROM "Store" s JOIN "OnlineOrderingConfig" oc ON oc."storeId"=s."id" WHERE s."active"=TRUE AND LOWER(oc."publicSlug")=LOWER(${publicSlug}) LIMIT 1`
    :await prisma.$queryRaw`SELECT "id","name","companyId" FROM "Store" WHERE "active"=TRUE AND LOWER("name")=LOWER(${KAT_STORE_NAME}) ORDER BY "createdAt" LIMIT 1`;
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
function isPreparedProduct(product){return ["COFFEE","BEVERAGE"].includes(productType(product?.name||""))}
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

router.post(["/member-session","/:publicSlug/member-session"],safe(async(req,res)=>{
  const {store,config}=await context(req.params.publicSlug||null),body=z.object({phone:z.string().trim().min(6).max(40),pin:z.string().regex(/^\d{6}$/)}).parse(req.body||{}),phone=phoneNormalized(body.phone);const row=(await prisma.$queryRaw`SELECT "id","fullName","memberType","pinHash","active" FROM "OnlineStoreMember" WHERE "storeId"=${store.id} AND "phoneNormalized"=${phone} LIMIT 1`)[0];if(!row?.active||!row.pinHash||!(await bcrypt.compare(body.pin,row.pinHash)))return res.status(401).json({error:"Δεν βρέθηκε ενεργός δικαιούχος με αυτά τα στοιχεία."});const token=issueMemberToken({memberId:row.id,storeId:store.id,memberType:row.memberType});res.json({token,member:{fullName:row.fullName,memberType:row.memberType,discountPercent:memberDiscount(config,row.memberType)}});
}));

router.get(["/catalog-modifiers","/:publicSlug/catalog-modifiers"],safe(async(req,res)=>{
  const {store,config}=await context(req.params.publicSlug||null),member=await verifiedMember(req,store);
  const [products,groups]=await Promise.all([
    prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",p."trackStock",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "OnlineProductVisibility" v ON v."storeId"=sp."storeId" AND v."productId"=p."id" AND v."companyId"=${store.companyId} AND v."visible"=TRUE WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE ORDER BY p."name"`,
    modifierCatalog(store.companyId)
  ]);
  res.json({store:{id:store.id,name:store.name},member:member?{memberType:member.memberType,discountPercent:memberDiscount(config,member.memberType)}:null,settings:{surchargeType:config.surchargeType,surchargeValue:money(config.surchargeValue),deliveryFee:money(config.deliveryFee),minimumOrderRetail:money(config.minimumOrderRetail),pickupEnabled:Boolean(config.pickupEnabled),deliveryEnabled:Boolean(config.deliveryEnabled),cashEnabled:Boolean(config.cashEnabled),cardOnDeliveryEnabled:Boolean(config.cardOnDeliveryEnabled),timezone:config.timezone||"Europe/Athens",weeklyHours:config.weeklyHours||{},openNow:onlineStoreOpen(config),brandName:config.brandName||store.name,brandTagline:config.brandTagline||"Online Παραγγελίες",brandLogoUrl:config.brandLogoUrl||"",brandPrimaryColor:config.brandPrimaryColor||"#7b1216",brandSecondaryColor:config.brandSecondaryColor||"#5d0c0f",brandWelcomeMessage:config.brandWelcomeMessage||"Γρήγορα, εύκολα, όποτε θέλεις!",estimatedMinutes:Number(config.estimatedMinutes||25)},modifierGroups:groups,products:products.map(p=>{const base=onlineUnitPrice(p.storePrice,config),price=member?specialPrice(base,config,member.memberType):base;return{id:p.id,sku:p.sku,name:p.name,vatRate:Number(p.vatRate||0),storePrice:money(p.storePrice),onlineSurcharge:money(price-money(p.storePrice)),onlinePrice:price,trackStock:Boolean(p.trackStock),stock:Number(p.currentStock||0),available:isPreparedProduct(p)||!p.trackStock||Number(p.currentStock||0)>0,modifierGroupIds:groupsForProduct(p,groups)}})});
}));

const orderSchema=z.object({
  idempotencyKey:z.string().min(8).max(160),fulfillmentType:z.enum(["DELIVERY","PICKUP"]),paymentMethod:z.enum(["CASH","CARD"]),
  customerName:z.string().trim().min(2).max(120),customerPhone:z.string().trim().min(6).max(40),building:z.string().trim().max(120).optional().nullable(),floor:z.string().trim().max(80).optional().nullable(),department:z.string().trim().max(160).optional().nullable(),room:z.string().trim().max(120).optional().nullable(),deliveryNotes:z.string().trim().max(500).optional().nullable(),
  items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().int().min(1).max(50),modifierIds:z.array(z.string().min(1)).max(20).default([])})).min(1).max(50)
});

router.post(["/orders-with-modifiers","/:publicSlug/orders-with-modifiers"],safe(async(req,res)=>{
  const body=orderSchema.parse(req.body||{}),{store,config}=await context(req.params.publicSlug||null),member=await verifiedMember(req,store);
  if(!onlineStoreOpen(config))return res.status(409).json({error:"Το Online Store είναι κλειστό αυτή την ώρα."});
  if(body.fulfillmentType==="DELIVERY"&&!config.deliveryEnabled)return res.status(409).json({error:"Το Delivery δεν είναι διαθέσιμο αυτή τη στιγμή."});
  if(body.fulfillmentType==="PICKUP"&&!config.pickupEnabled)return res.status(409).json({error:"Η παραλαβή από το Κυλικείο δεν είναι διαθέσιμη αυτή τη στιγμή."});
  if(body.paymentMethod==="CASH"&&!config.cashEnabled)return res.status(409).json({error:"Η πληρωμή με μετρητά δεν είναι διαθέσιμη."});
  if(body.paymentMethod==="CARD"&&!config.cardOnDeliveryEnabled)return res.status(409).json({error:"Η πληρωμή με ασύρματο POS δεν είναι διαθέσιμη."});
  if(body.fulfillmentType==="DELIVERY"&&!body.department?.trim())return res.status(400).json({error:"Για Delivery χρειάζεται κλινική ή τμήμα."});
  const duplicate=await prisma.$queryRaw`SELECT "id","orderNumber","status","total","createdAt" FROM "OnlineOrder" WHERE "storeId"=${store.id} AND "idempotencyKey"=${body.idempotencyKey} LIMIT 1`;if(duplicate[0])return res.json({ok:true,duplicate:true,order:duplicate[0]});
  const productIds=[...new Set(body.items.map(i=>i.productId))],products=await prisma.$queryRaw`SELECT p."id",p."name",p."trackStock",COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",COALESCE(sp."currentStock",0) AS "currentStock" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "OnlineProductVisibility" v ON v."storeId"=sp."storeId" AND v."productId"=p."id" AND v."companyId"=${store.companyId} AND v."visible"=TRUE WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."companyId"=${store.companyId} AND p."active"=TRUE AND p."id"=ANY(${productIds}::text[])`;
  const byId=new Map(products.map(p=>[p.id,p])),groups=await modifierCatalog(store.companyId),modifierById=new Map();for(const g of groups)for(const m of g.items)modifierById.set(m.id,{...m,groupId:g.id,groupDescription:g.description});
  const lines=[];
  for(const item of body.items){const product=byId.get(item.productId);if(!product)return res.status(409).json({error:"Ένα προϊόν δεν είναι πλέον διαθέσιμο."});if(!isPreparedProduct(product)&&product.trackStock&&Number(product.currentStock||0)<item.quantity)return res.status(409).json({error:`Δεν υπάρχει αρκετό απόθεμα για: ${product.name}`});const allowedGroups=new Set(groupsForProduct(product,groups)),selected=[];for(const id of [...new Set(item.modifierIds)]){const m=modifierById.get(id);if(!m||!allowedGroups.has(m.groupId))return res.status(409).json({error:`Μη έγκυρη επιλογή για: ${product.name}`});selected.push({id:m.id,groupId:m.groupId,group:m.groupDescription,description:m.description,price:money(m.price)})}const modifierTotal=money(selected.reduce((s,m)=>s+m.price,0)),baseOnline=onlineUnitPrice(product.storePrice,config),basePrice=member?specialPrice(baseOnline,config,member.memberType):baseOnline,unit=money(basePrice+modifierTotal),lineTotal=money(unit*item.quantity);lines.push({productId:product.id,productName:product.name,quantity:item.quantity,storeUnitPrice:money(product.storePrice),onlineSurcharge:money(basePrice-money(product.storePrice)),onlineUnitPrice:unit,lineTotal,modifiers:selected})}
  const subtotal=money(lines.reduce((s,l)=>s+l.lineTotal,0)),minimum=money(config.minimumOrderRetail||0);if(subtotal<minimum)return res.status(409).json({error:`Η ελάχιστη παραγγελία είναι ${minimum.toFixed(2).replace(".",",")} €.`});const deliveryFee=body.fulfillmentType==="DELIVERY"?money(config.deliveryFee):0,total=money(subtotal+deliveryFee),id=crypto.randomUUID();
  const serialRow=(await prisma.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "orderNumber" ~ '^KAT-[0-9]+$' THEN substring("orderNumber" from 5)::int ELSE 0 END),0)::int AS value FROM "OnlineOrder" WHERE "storeId"=${store.id}`)[0];
  const serial=Number(serialRow?.value||0)+1,orderNumber=`KAT-${String(serial).padStart(3,"0")}`;
  await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "OnlineOrder" ("id","companyId","storeId","orderNumber","channel","fulfillmentType","status","paymentMethod","customerName","customerPhone","building","floor","department","room","deliveryNotes","subtotal","deliveryFee","total","idempotencyKey") VALUES (${id},${store.companyId},${store.id},${orderNumber},${body.fulfillmentType==="DELIVERY"?"ONLINE_DELIVERY":"ONLINE"},${body.fulfillmentType},'NEW',${body.paymentMethod},${body.customerName},${body.customerPhone},${body.building||null},${body.floor||null},${body.department||null},${body.room||null},${body.deliveryNotes||null},${subtotal},${deliveryFee},${total},${body.idempotencyKey})`;for(const row of lines)await tx.$executeRaw`INSERT INTO "OnlineOrderLine" ("id","orderId","productId","productName","quantity","storeUnitPrice","onlineSurcharge","onlineUnitPrice","lineTotal","modifiersJson") VALUES (${crypto.randomUUID()},${id},${row.productId},${row.productName},${row.quantity},${row.storeUnitPrice},${row.onlineSurcharge},${row.onlineUnitPrice},${row.lineTotal},${JSON.stringify(row.modifiers)}::jsonb)`;await tx.$executeRaw`INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","toStatus","note") VALUES (${crypto.randomUUID()},${id},'NEW','Online order submitted with authoritative modifiers')`});
  res.status(201).json({ok:true,order:{id,orderNumber,status:"NEW",fulfillmentType:body.fulfillmentType,paymentMethod:body.paymentMethod,subtotal,deliveryFee,total}});
}));

router.get("/backoffice-managed/stores",auth,safe(async(req,res)=>{
  if(req.user?.tokenType==="STORE_OPERATOR")return res.status(403).json({error:"Η προβολή BackOffice δεν είναι διαθέσιμη από λογαριασμό POS."});
  const platform=isPlatformSuperAdmin(req.user);
  const rows=platform
    ?await prisma.$queryRaw`SELECT s."id",s."name",s."companyId",c."name" AS "companyName",(SELECT COUNT(*)::int FROM "OnlineOrder" o WHERE o."storeId"=s."id") AS "orderCount" FROM "Store" s LEFT JOIN "Company" c ON c."id"=s."companyId" WHERE s."active"=TRUE AND (s."id"=${TEST_STORE_ID} OR LOWER(s."name")=LOWER(${KAT_STORE_NAME})) ORDER BY CASE WHEN s."id"=${TEST_STORE_ID} THEN 0 ELSE 1 END,s."createdAt"`
    :await prisma.$queryRaw`SELECT s."id",s."name",s."companyId",c."name" AS "companyName",(SELECT COUNT(*)::int FROM "OnlineOrder" o WHERE o."storeId"=s."id") AS "orderCount" FROM "Store" s LEFT JOIN "Company" c ON c."id"=s."companyId" WHERE s."active"=TRUE AND s."companyId"=${req.user.companyId} AND (s."id"=${TEST_STORE_ID} OR LOWER(s."name")=LOWER(${KAT_STORE_NAME})) ORDER BY s."createdAt"`;
  res.json({stores:rows.map(row=>({...row,isTest:row.id===TEST_STORE_ID,orderCount:Number(row.orderCount||0)}))});
}));

router.get("/backoffice-managed/stores/:storeId/orders",auth,safe(async(req,res)=>{
  if(req.user?.tokenType==="STORE_OPERATOR")return res.status(403).json({error:"Η προβολή BackOffice δεν είναι διαθέσιμη από λογαριασμό POS."});
  const store=(await prisma.$queryRaw`SELECT s."id",s."name",s."companyId",s."active" FROM "Store" s WHERE s."id"=${req.params.storeId} AND s."active"=TRUE AND (s."id"=${TEST_STORE_ID} OR LOWER(s."name")=LOWER(${KAT_STORE_NAME})) LIMIT 1`)[0];
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα Online Παραγγελιών."});
  if(store.companyId!==req.user.companyId&&!isPlatformSuperAdmin(req.user))return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
  if(store.id===TEST_STORE_ID&&store.companyId!==TEST_COMPANY_ID)return res.status(409).json({error:"Μη έγκυρη σύνδεση TEST καταστήματος."});
  const limit=Math.min(Math.max(Number(req.query.limit||150),1),300);
  const rows=await prisma.$queryRaw`SELECT o.*,COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'productName',l."productName",'quantity',l."quantity",'onlineUnitPrice',l."onlineUnitPrice",'lineTotal',l."lineTotal",'modifiers',COALESCE(l."modifiersJson",'[]'::jsonb)) ORDER BY l."createdAt") FROM "OnlineOrderLine" l WHERE l."orderId"=o."id"),'[]') AS "items",CASE WHEN o."saleId" IS NULL THEN NULL ELSE (SELECT json_build_object('id',s."id",'total',s."total",'status',s."status",'source',s."source",'createdAt',s."createdAt",'payments',COALESCE((SELECT json_agg(json_build_object('id',p."id",'method',p."method",'amount',p."amount")) FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json)) FROM "Sale" s WHERE s."id"=o."saleId" LIMIT 1) END AS "sale",(SELECT json_build_object('id',t."id",'sessionId',t."sessionId",'type',t."type",'amount',t."amount",'description',t."description",'actorName',t."actorName",'createdAt',t."createdAt") FROM "StoreTransaction" t WHERE t."storeId"=o."storeId" AND t."description" LIKE ${'ONLINE %'} || o."orderNumber" || '%' ORDER BY t."createdAt" DESC LIMIT 1) AS "shiftTransaction" FROM "OnlineOrder" o WHERE o."storeId"=${store.id} ORDER BY o."createdAt" DESC LIMIT ${limit}`;
  const normalized=rows.map(row=>({...row,subtotal:money(row.subtotal),deliveryFee:money(row.deliveryFee),total:money(row.total),items:(row.items||[]).map(item=>({...item,quantity:Number(item.quantity||0),onlineUnitPrice:money(item.onlineUnitPrice),lineTotal:money(item.lineTotal)})),sale:row.sale?{...row.sale,total:money(row.sale.total),payments:(row.sale.payments||[]).map(payment=>({...payment,amount:money(payment.amount)}))}:null,shiftTransaction:row.shiftTransaction?{...row.shiftTransaction,amount:money(row.shiftTransaction.amount)}:null}));
  res.json({store:{id:store.id,name:store.name,isTest:store.id===TEST_STORE_ID},count:normalized.length,rows:normalized});
}));

export default router;
