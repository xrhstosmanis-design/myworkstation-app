import crypto from "crypto";
import {prisma} from "./prisma.js";

const DAILY_COMPANY_ID="cmv25lf0w000seegf1cn4bbmx";
const PATCH_KEY="DAILY_BITE_COFFEE_KAT_BEHAVIOR_20261010_V1";
const PAIRS=[
 ["DB000002","MWS-KAT-BEV-FREDDO-ESP"],
 ["DB000005","MWS-KAT-BEV-FREDDO-CAP"],
 ["DB000003","MWS-KAT-BEV-CAP-DOUBLE"],
 ["DB000010","MWS-KAT-BEV-CAP-SINGLE"],
 ["DB000013","MWS-KAT-BEV-GREEK-DOUBLE"],
 ["DB000014","MWS-KAT-BEV-ESP-DOUBLE"],
 ["DB000015","MWS-KAT-BEV-AMERICANO-DOUBLE"],
 ["DB000021","MWS-KAT-BEV-FILTER"],
 ["DB000022","MWS-KAT-BEV-GREEK-SINGLE"],
 ["DB000026","MWS-KAT-BEV-ESP-SINGLE"],
 ["DB000027","MWS-KAT-BEV-ICED-LATTE"],
 ["DB000051","MWS-KAT-BEV-AMERICANO"],
 ["DB000118","MWS-KAT-BEV-MACCHIATO-DOUBLE"],
 ["DB000401","MWS-KAT-BEV-MACCHIATO"],
 ["DB004298","MWS-KAT-BEV-RISTRETTO"],
 ["DB000006","MWS-KAT-BEV-FRAPPE"]
];

const uid=()=>crypto.randomUUID();

async function ensureMarkerTable(){
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DataPatchMarker" ("key" TEXT PRIMARY KEY,"appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"detailsJson" JSONB NOT NULL DEFAULT '{}'::jsonb)`);
}

export async function ensureDailyBiteCoffeeBehavior(){
 await ensureMarkerTable();
 const already=(await prisma.$queryRaw`SELECT "key" FROM "DataPatchMarker" WHERE "key"=${PATCH_KEY} LIMIT 1`)[0];
 if(already)return {ok:true,alreadyApplied:true};

 const daily=(await prisma.$queryRaw`SELECT "id","name" FROM "Company" WHERE "id"=${DAILY_COMPANY_ID} LIMIT 1`)[0];
 if(!daily||!String(daily.name||"").toUpperCase().includes("DAILY BITE"))return {ok:false,skipped:"daily-company-not-found"};

 const kat=(await prisma.$queryRaw`SELECT s."companyId" FROM "Store" s WHERE s."id"='kat-store' AND s."active"=TRUE LIMIT 1`)[0];
 if(!kat?.companyId)throw new Error("DAILY BITE coffee patch: KAT template company not found.");

 const dailyRows=await prisma.$queryRaw`SELECT "id","sku","name","salePrice","costPrice","vatRate","vatDepartmentId","categoryId" FROM "Product" WHERE "companyId"=${DAILY_COMPANY_ID} AND "sku"=ANY(${PAIRS.map(x=>x[0])}::text[]) AND "active"=TRUE`;
 const katRows=await prisma.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${kat.companyId} AND "sku"=ANY(${PAIRS.map(x=>x[1])}::text[]) AND "active"=TRUE`;
 if(dailyRows.length!==PAIRS.length||katRows.length!==PAIRS.length)throw new Error(`DAILY BITE coffee patch: expected ${PAIRS.length} exact products, found DAILY ${dailyRows.length}, KAT ${katRows.length}.`);

 const dailyBySku=new Map(dailyRows.map(x=>[x.sku,x])),katBySku=new Map(katRows.map(x=>[x.sku,x]));
 const katIds=katRows.map(x=>x.id);
 const links=await prisma.$queryRaw`
   SELECT pg."productId",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
          g."id" AS "groupId",g."legacyId",g."description" AS "groupDescription",
          m."id" AS "modifierId",m."sequence" AS "modifierSequence",m."description" AS "modifierDescription",m."price",m."costNet"
   FROM "PreparationProductModifierGroup" pg
   JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=TRUE
   LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=TRUE
   WHERE pg."companyId"=${kat.companyId} AND pg."productId"=ANY(${katIds}::text[])
   ORDER BY pg."productId",pg."sequence",g."description",m."sequence",m."description"`;
 const groupsByProduct=new Map();
 for(const row of links){
   if(!groupsByProduct.has(row.productId))groupsByProduct.set(row.productId,new Map());
   const map=groupsByProduct.get(row.productId);
   if(!map.has(row.groupId))map.set(row.groupId,{legacyId:row.legacyId,description:row.groupDescription,required:Boolean(row.required),minSelections:Number(row.minSelections||0),maxSelections:Number(row.maxSelections||1),sequence:Number(row.sequence||0),items:[]});
   if(row.modifierId)map.get(row.groupId).items.push({sequence:Number(row.modifierSequence||0),description:row.modifierDescription,price:Number(row.price||0),costNet:Number(row.costNet||0)});
 }
 for(const [,katSku] of PAIRS){
   const katProduct=katBySku.get(katSku);
   if(!groupsByProduct.get(katProduct.id)?.size)throw new Error(`DAILY BITE coffee patch: KAT product ${katSku} has no modifier groups.`);
 }

 const before=dailyRows.map(x=>({id:x.id,sku:x.sku,name:x.name,salePrice:Number(x.salePrice||0),costPrice:Number(x.costPrice||0),vatRate:Number(x.vatRate||0),vatDepartmentId:x.vatDepartmentId,categoryId:x.categoryId}));
 const result=await prisma.$transaction(async tx=>{
   const groupIds=new Map();
   const uniqueGroups=new Map();
   for(const maps of groupsByProduct.values())for(const group of maps.values())if(!uniqueGroups.has(group.description))uniqueGroups.set(group.description,group);
   for(const group of uniqueGroups.values()){
     let g=(await tx.$queryRaw`SELECT "id" FROM "ManagementModifierGroup" WHERE "companyId"=${DAILY_COMPANY_ID} AND LOWER("description")=LOWER(${group.description}) LIMIT 1`)[0];
     if(!g){g={id:uid()};await tx.$executeRaw`INSERT INTO "ManagementModifierGroup" ("id","companyId","legacyId","description","active") VALUES (${g.id},${DAILY_COMPANY_ID},${group.legacyId??null},${group.description},TRUE)`}
     groupIds.set(group.description,g.id);
     for(const item of group.items){
       const existing=(await tx.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${DAILY_COMPANY_ID} AND "groupId"=${g.id} AND LOWER("description")=LOWER(${item.description}) LIMIT 1`)[0];
       if(!existing)await tx.$executeRaw`INSERT INTO "ManagementModifier" ("id","companyId","groupId","sequence","description","price","costNet","active") VALUES (${uid()},${DAILY_COMPANY_ID},${g.id},${item.sequence},${item.description},${item.price},${item.costNet},TRUE)`;
     }
   }

   const renamed=[];
   for(const [dailySku,katSku] of PAIRS){
     const d=dailyBySku.get(dailySku),k=katBySku.get(katSku),groups=[...groupsByProduct.get(k.id).values()],wanted=[];
     for(const group of groups){
       const gid=groupIds.get(group.description);wanted.push(gid);
       await tx.$executeRaw`INSERT INTO "PreparationProductModifierGroup" ("id","companyId","productId","groupId","required","minSelections","maxSelections","sequence") VALUES (${uid()},${DAILY_COMPANY_ID},${d.id},${gid},${group.required},${group.minSelections},${group.maxSelections},${group.sequence}) ON CONFLICT ("companyId","productId","groupId") DO UPDATE SET "required"=EXCLUDED."required","minSelections"=EXCLUDED."minSelections","maxSelections"=EXCLUDED."maxSelections","sequence"=EXCLUDED."sequence"`;
     }
     await tx.$executeRaw`DELETE FROM "PreparationProductModifierGroup" WHERE "companyId"=${DAILY_COMPANY_ID} AND "productId"=${d.id} AND NOT ("groupId"=ANY(${wanted}::text[]))`;
     await tx.$executeRaw`INSERT INTO "PreparationProductSettings" ("companyId","productId","preparationEnabled","environmentalFee","productionStation","autoPrint","recipeProfileVersion") VALUES (${DAILY_COMPANY_ID},${d.id},TRUE,0,'ΠΑΡΑΓΩΓΗ',TRUE,0) ON CONFLICT ("companyId","productId") DO UPDATE SET "preparationEnabled"=TRUE,"environmentalFee"=0,"productionStation"='ΠΑΡΑΓΩΓΗ',"autoPrint"=TRUE,"updatedAt"=NOW()`;
     if(d.name!==k.name){await tx.$executeRaw`UPDATE "Product" SET "name"=${k.name},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${d.id} AND "companyId"=${DAILY_COMPANY_ID}`;renamed.push({sku:dailySku,from:d.name,to:k.name});}
   }
   const details={pairCount:PAIRS.length,renamed,before,note:"KAT modifier behavior only; no KAT recipes/ingredient IDs/stock consumption copied."};
   await tx.$executeRaw`INSERT INTO "DataPatchMarker" ("key","detailsJson") VALUES (${PATCH_KEY},${JSON.stringify(details)}::jsonb)`;
   return details;
 });
 console.log(`DAILY BITE coffee behavior applied: ${result.pairCount} products, ${result.renamed.length} name normalizations; recipes/ingredients untouched.`);
 return {ok:true,alreadyApplied:false,...result};
}
