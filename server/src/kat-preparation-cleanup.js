import "dotenv/config";
import crypto from "crypto";
import {prisma} from "./prisma.js";

const CANONICAL_SKUS=new Set([
 "MWS-KAT-BEV-ESP-SINGLE","MWS-KAT-BEV-ESP-DOUBLE","MWS-KAT-BEV-RISTRETTO","MWS-KAT-BEV-LUNGO","MWS-KAT-BEV-LUNGO-DOUBLE","MWS-KAT-BEV-MACCHIATO","MWS-KAT-BEV-MACCHIATO-DOUBLE","MWS-KAT-BEV-AMERICANO","MWS-KAT-BEV-AMERICANO-DOUBLE","MWS-KAT-BEV-CAP-SINGLE","MWS-KAT-BEV-CAP-DOUBLE","MWS-KAT-BEV-CAP-LATTE-SINGLE","MWS-KAT-BEV-CAP-LATTE-DOUBLE","MWS-KAT-BEV-LATTE-HOT","MWS-KAT-BEV-FLAT-WHITE","MWS-KAT-BEV-CORTADO","MWS-KAT-BEV-MOCHA-HOT","MWS-KAT-BEV-GREEK-SINGLE","MWS-KAT-BEV-GREEK-DOUBLE","MWS-KAT-BEV-FILTER","MWS-KAT-BEV-FILTER-LARGE","MWS-KAT-BEV-NES-HOT","MWS-KAT-BEV-DECAF-ESP","MWS-KAT-BEV-DECAF-CAP","MWS-KAT-BEV-DECAF-LATTE","MWS-KAT-BEV-FREDDO-ESP","MWS-KAT-BEV-FREDDO-CAP","MWS-KAT-BEV-FREDDO-CAP-LATTE","MWS-KAT-BEV-ICED-AMER","MWS-KAT-BEV-ICED-LATTE","MWS-KAT-BEV-FRAPPE","MWS-KAT-BEV-FRAPPE-MILK","MWS-KAT-BEV-NES-COLD","MWS-KAT-BEV-DECAF-FREDDO","MWS-KAT-BEV-DECAF-FREDDO-CAP","MWS-KAT-BEV-MOCHA-COLD","MWS-KAT-BEV-CHOC-HOT","MWS-KAT-BEV-CHOC-COLD","MWS-KAT-BEV-CHOC-WHITE-HOT","MWS-KAT-BEV-CHOC-WHITE-COLD","MWS-KAT-BEV-CHOC-HAZ-HOT","MWS-KAT-BEV-CHOC-HAZ-COLD","MWS-KAT-BEV-CHOC-CARAMEL-HOT","MWS-KAT-BEV-CHOC-CARAMEL-COLD","MWS-KAT-BEV-TEA-BLACK","MWS-KAT-BEV-TEA-GREEN","MWS-KAT-BEV-CHAMOMILE","MWS-KAT-BEV-MOUNTAIN-TEA","MWS-KAT-BEV-ICED-TEA","MWS-KAT-BEV-MATCHA-HOT","MWS-KAT-BEV-MATCHA-COLD"
]);
const CANONICAL_NAMES=new Set([
 "ESPRESSO ΜΟΝΟΣ","ESPRESSO ΔΙΠΛΟΣ","RISTRETTO","ESPRESSO LUNGO ΜΟΝΟΣ","ESPRESSO LUNGO ΔΙΠΛΟΣ","ESPRESSO MACCHIATO ΜΟΝΟΣ","ESPRESSO MACCHIATO ΔΙΠΛΟΣ","AMERICANO ΜΟΝΟΣ","AMERICANO ΔΙΠΛΟΣ","CAPPUCCINO ΜΟΝΟΣ","CAPPUCCINO ΔΙΠΛΟΣ","CAPPUCCINO LATTE ΜΟΝΟΣ","CAPPUCCINO LATTE ΔΙΠΛΟΣ","CAFFE LATTE","FLAT WHITE","CORTADO","MOCHA ΖΕΣΤΟ","ΕΛΛΗΝΙΚΟΣ ΜΟΝΟΣ","ΕΛΛΗΝΙΚΟΣ ΔΙΠΛΟΣ","ΚΑΦΕΣ ΦΙΛΤΡΟΥ ΜΙΚΡΟΣ","ΚΑΦΕΣ ΦΙΛΤΡΟΥ ΜΕΓΑΛΟΣ","NESCAFE ΖΕΣΤΟΣ","ESPRESSO DECAF","CAPPUCCINO DECAF","LATTE DECAF","FREDDO ESPRESSO","FREDDO CAPPUCCINO","FREDDO CAPPUCCINO LATTE","ICED AMERICANO","ICED LATTE","ΦΡΑΠΕ","ΦΡΑΠΕ ΜΕ ΓΑΛΑ","NESCAFE ΚΡΥΟΣ","FREDDO ESPRESSO DECAF","FREDDO CAPPUCCINO DECAF","MOCHA ΚΡΥΟ","ΖΕΣΤΗ ΣΟΚΟΛΑΤΑ","ΚΡΥΑ ΣΟΚΟΛΑΤΑ","ΛΕΥΚΗ ΖΕΣΤΗ ΣΟΚΟΛΑΤΑ","ΛΕΥΚΗ ΚΡΥΑ ΣΟΚΟΛΑΤΑ","ΣΟΚΟΛΑΤΑ ΦΟΥΝΤΟΥΚΙ ΖΕΣΤΗ","ΣΟΚΟΛΑΤΑ ΦΟΥΝΤΟΥΚΙ ΚΡΥΑ","ΣΟΚΟΛΑΤΑ ΚΑΡΑΜΕΛΑ ΖΕΣΤΗ","ΣΟΚΟΛΑΤΑ ΚΑΡΑΜΕΛΑ ΚΡΥΑ","ΤΣΑΙ ΜΑΥΡΟ","ΤΣΑΙ ΠΡΑΣΙΝΟ","ΧΑΜΟΜΗΛΙ","ΤΣΑΙ ΒΟΥΝΟΥ","ICED TEA ΠΑΡΑΣΚΕΥΗΣ","MATCHA LATTE ΖΕΣΤΟ","MATCHA LATTE ΚΡΥΟ"
]);
const LEGACY_ALIASES=new Set(["FREDDO CAP 4ΑΠΛΟΣ","FREDDO CAP 4ΠΛΟΣ","FREDDO ESPRESO 4ΠΛΟ","FREDDO ESPRESSO 4ΠΛΟ","FREDDO ESPRESSO MACCHIATO","FREDDO CAPPUCCINO 4ΑΠΛΟΣ"]);
const LEGACY_SKUS=new Set(["033390","00598","018220","00597","100093","02522"]);
const LEGACY_CATEGORIES=["ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΚΑΦΕ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΣΟΚΟΛΑΤΑ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΤΣΑΙ"];
const MODIFIER_TARGETS=[
 ["ΖΑΧΑΡΗ","ΜΕΤΡΙΟΣ","MWS-PREP-SUGAR-WHITE",8,"GR"],
 ["ΖΑΧΑΡΗ","ΓΛΥΚΟΣ","MWS-PREP-SUGAR-WHITE",16,"GR"],
 ["ΖΑΧΑΡΗ","ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ","MWS-PREP-SUGAR-BROWN",8,"GR"],
 ["ΖΑΧΑΡΗ","ΣΤΕΒΙΑ","MWS-PREP-SWEETENER",1,"PCS"],
 ["ΖΑΧΑΡΗ","ΖΑΧΑΡΙΝΗ","MWS-PREP-SWEETENER",1,"PCS"],
 ["ΣΙΡΟΠΙ","ΣΟΚΟΛΑΤΑ","MWS-PREP-SYRUP-CHOC",15,"ML"],
 ["ΣΙΡΟΠΙ","ΚΑΡΑΜΕΛΑ","MWS-PREP-SYRUP-CARAMEL",15,"ML"],
 ["ΣΙΡΟΠΙ","ΒΑΝΙΛΙΑ","MWS-PREP-SYRUP-VANILLA",15,"ML"],
 ["ΣΙΡΟΠΙ","ΦΟΥΝΤΟΥΚΙ","MWS-PREP-SYRUP-HAZELNUT",15,"ML"],
 ["ΓΑΛΑ","ΓΑΛΑ ΕΒΑΠΟΡΕ","MWS-PREP-MILK-EVAP",80,"ML"],
 ["ΓΑΛΑ","ΧΩΡΙΣ ΛΑΚΤΟΖΗ","MWS-PREP-MILK-LF",80,"ML"],
 ["ΓΑΛΑ","ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ","MWS-PREP-MILK-ALMOND",80,"ML"],
 ["ΓΑΛΑ","ΓΑΛΑ ΒΡΩΜΗΣ","MWS-PREP-MILK-OAT",80,"ML"],
 ["ΓΑΛΑ","ΓΑΛΑ ΣΟΓΙΑΣ","MWS-PREP-MILK-SOY",80,"ML"],
 ["EXTRA","EXTRA ΔΟΣΗ","MWS-PREP-COFFEE-BEANS",9,"GR"],
 ["EXTRA","DECAF","MWS-PREP-DECAF",9,"GR"],
 ["EXTRA","ΚΑΝΕΛΑ","MWS-PREP-CINNAMON",1,"GR"],
 ["EXTRA","ΣΑΝΤΙΓΙ","MWS-PREP-WHIP",20,"GR"]
];
const norm=value=>String(value||"").trim().toUpperCase().replace(/\s+/g," ");

async function repairModifierConsumption(companyId){
 let repaired=0;
 for(const [groupName,modifierName,ingredientSku,quantity,unit] of MODIFIER_TARGETS.filter(row=>row[0]!=="ΓΑΛΑ")){
   const rows=await prisma.$queryRaw`
     SELECT m."id" AS "modifierId",p."id" AS "ingredientProductId"
     FROM "ManagementModifier" m
     JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId"
     CROSS JOIN "Product" p
     WHERE m."companyId"=${companyId} AND m."active"=true AND g."active"=true
       AND UPPER(g."description")=UPPER(${groupName}) AND UPPER(m."description")=UPPER(${modifierName})
       AND p."companyId"=${companyId} AND p."active"=true AND p."sku"=${ingredientSku}
     LIMIT 1`;
   const target=rows[0];
   if(!target)continue;
   await prisma.$executeRaw`DELETE FROM "PreparationModifierConsumption" WHERE "companyId"=${companyId} AND "modifierId"=${target.modifierId} AND "ingredientProductId"<>${target.ingredientProductId}`;
   const existing=await prisma.$queryRaw`SELECT "id" FROM "PreparationModifierConsumption" WHERE "companyId"=${companyId} AND "modifierId"=${target.modifierId} AND "ingredientProductId"=${target.ingredientProductId} ORDER BY "createdAt" LIMIT 1`;
   if(existing[0]){
     await prisma.$executeRaw`UPDATE "PreparationModifierConsumption" SET "quantity"=${quantity},"unit"=${unit},"multiplierMode"='FIXED',"updatedAt"=NOW() WHERE "id"=${existing[0].id}`;
     if(existing.length>1)await prisma.$executeRaw`DELETE FROM "PreparationModifierConsumption" WHERE "companyId"=${companyId} AND "modifierId"=${target.modifierId} AND "ingredientProductId"=${target.ingredientProductId} AND "id"<>${existing[0].id}`;
   }else{
     await prisma.$executeRaw`INSERT INTO "PreparationModifierConsumption" ("id","companyId","modifierId","ingredientProductId","quantity","unit","multiplierMode") VALUES (${crypto.randomUUID()},${companyId},${target.modifierId},${target.ingredientProductId},${quantity},${unit},'FIXED')`;
   }
   repaired++;
 }
 return repaired;
}

export async function ensureKatPreparationCleanup(){
 const stores=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "active"=true AND LOWER(TRIM("name"))=LOWER('Κυλικείο ΚΑΤ') ORDER BY "createdAt" LIMIT 1`;
 const store=stores[0];
 if(!store)return {ok:false,reason:"KIOSK_KAT_STORE_NOT_FOUND"};
 const legacyCategories=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${store.companyId} AND "name"=ANY(${LEGACY_CATEGORIES}::text[])`;
 const legacyIds=legacyCategories.map(row=>row.id);
 const rows=await prisma.$queryRaw`SELECT "id","sku","name","categoryId","active" FROM "Product" WHERE "companyId"=${store.companyId}`;
 const canonicalNames=new Set([...CANONICAL_NAMES].map(norm));
 const legacyAliases=new Set([...LEGACY_ALIASES].map(norm));
 const remove=rows.filter(row=>{
   const sku=String(row.sku||"").trim();
   if(CANONICAL_SKUS.has(sku)||sku.startsWith("MWS-PREP-"))return false;
   if(LEGACY_SKUS.has(sku))return true;
   if(sku.startsWith("MWS-KAT-COF-")||sku.startsWith("MWS-KAT-BEV-"))return true;
   if(legacyIds.includes(row.categoryId))return true;
   const name=norm(row.name);
   return canonicalNames.has(name)||legacyAliases.has(name);
 });
 for(const row of remove){
   await prisma.$executeRaw`UPDATE "StoreProduct" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${store.id} AND "productId"=${row.id}`;
   await prisma.$executeRaw`UPDATE "Product" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;
 }
 if(legacyIds.length)await prisma.$executeRaw`UPDATE "ProductCategory" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${store.companyId} AND "id"=ANY(${legacyIds}::text[])`;
 const repairedModifiers=await repairModifierConsumption(store.companyId);
 console.log(`KAT preparation cleanup (${store.name}): deactivated ${remove.length} legacy/duplicate drink products; repaired ${repairedModifiers} modifier mappings`);
 return {ok:true,removed:remove.length,repairedModifiers,storeId:store.id};
}

if(process.argv[1]&&process.argv[1].endsWith("kat-preparation-cleanup.js"))ensureKatPreparationCleanup().catch(error=>{console.error("KAT preparation cleanup failed",error);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
