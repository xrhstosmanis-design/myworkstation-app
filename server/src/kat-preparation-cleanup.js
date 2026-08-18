import "dotenv/config";
import {prisma} from "./prisma.js";

const CANONICAL_SKUS=new Set([
 "MWS-KAT-BEV-ESP-SINGLE","MWS-KAT-BEV-ESP-DOUBLE","MWS-KAT-BEV-RISTRETTO","MWS-KAT-BEV-LUNGO","MWS-KAT-BEV-LUNGO-DOUBLE","MWS-KAT-BEV-MACCHIATO","MWS-KAT-BEV-MACCHIATO-DOUBLE","MWS-KAT-BEV-AMERICANO","MWS-KAT-BEV-AMERICANO-DOUBLE","MWS-KAT-BEV-CAP-SINGLE","MWS-KAT-BEV-CAP-DOUBLE","MWS-KAT-BEV-CAP-LATTE-SINGLE","MWS-KAT-BEV-CAP-LATTE-DOUBLE","MWS-KAT-BEV-LATTE-HOT","MWS-KAT-BEV-FLAT-WHITE","MWS-KAT-BEV-CORTADO","MWS-KAT-BEV-MOCHA-HOT","MWS-KAT-BEV-GREEK-SINGLE","MWS-KAT-BEV-GREEK-DOUBLE","MWS-KAT-BEV-FILTER","MWS-KAT-BEV-FILTER-LARGE","MWS-KAT-BEV-NES-HOT","MWS-KAT-BEV-DECAF-ESP","MWS-KAT-BEV-DECAF-CAP","MWS-KAT-BEV-DECAF-LATTE","MWS-KAT-BEV-FREDDO-ESP","MWS-KAT-BEV-FREDDO-CAP","MWS-KAT-BEV-FREDDO-CAP-LATTE","MWS-KAT-BEV-ICED-AMER","MWS-KAT-BEV-ICED-LATTE","MWS-KAT-BEV-FRAPPE","MWS-KAT-BEV-FRAPPE-MILK","MWS-KAT-BEV-NES-COLD","MWS-KAT-BEV-DECAF-FREDDO","MWS-KAT-BEV-DECAF-FREDDO-CAP","MWS-KAT-BEV-MOCHA-COLD","MWS-KAT-BEV-CHOC-HOT","MWS-KAT-BEV-CHOC-COLD","MWS-KAT-BEV-CHOC-WHITE-HOT","MWS-KAT-BEV-CHOC-WHITE-COLD","MWS-KAT-BEV-CHOC-HAZ-HOT","MWS-KAT-BEV-CHOC-HAZ-COLD","MWS-KAT-BEV-CHOC-CARAMEL-HOT","MWS-KAT-BEV-CHOC-CARAMEL-COLD","MWS-KAT-BEV-TEA-BLACK","MWS-KAT-BEV-TEA-GREEN","MWS-KAT-BEV-CHAMOMILE","MWS-KAT-BEV-MOUNTAIN-TEA","MWS-KAT-BEV-ICED-TEA","MWS-KAT-BEV-MATCHA-HOT","MWS-KAT-BEV-MATCHA-COLD"
]);
const LEGACY_CATEGORIES=["ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΚΑΦΕ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΣΟΚΟΛΑΤΑ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΤΣΑΙ"];

async function main(){
 const [store]=await prisma.$queryRaw`SELECT "id","companyId" FROM "Store" WHERE "active"=true AND (UPPER("name") LIKE '%ΚΑΤ%' OR UPPER("name") LIKE '%KAT%') ORDER BY "createdAt" LIMIT 1`;
 if(!store){console.log("KAT preparation cleanup: store not found");return}
 const legacyCategories=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${store.companyId} AND "name"=ANY(${LEGACY_CATEGORIES}::text[])`;
 const legacyIds=legacyCategories.map(row=>row.id);
 const rows=await prisma.$queryRaw`SELECT "id","sku","name","categoryId" FROM "Product" WHERE "companyId"=${store.companyId} AND (COALESCE("sku",'') LIKE 'MWS-KAT-COF-%' OR COALESCE("sku",'') LIKE 'MWS-KAT-BEV-%' OR (${legacyIds.length}>0 AND "categoryId"=ANY(${legacyIds}::text[])))`;
 const remove=rows.filter(row=>{
   const sku=String(row.sku||"");
   if(CANONICAL_SKUS.has(sku))return false;
   if(sku.startsWith("MWS-PREP-"))return false;
   if(sku.startsWith("MWS-KAT-BEV-")||sku.startsWith("MWS-KAT-COF-"))return true;
   return legacyIds.includes(row.categoryId);
 });
 for(const row of remove){
   await prisma.$executeRaw`DELETE FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${row.id}`;
   await prisma.$executeRaw`UPDATE "Product" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;
 }
 if(legacyIds.length){
   await prisma.$executeRaw`UPDATE "ProductCategory" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${store.companyId} AND "id"=ANY(${legacyIds}::text[])`;
 }
 console.log(`KAT preparation cleanup: removed ${remove.length} legacy/duplicate active products`);
}

main().catch(error=>{console.error("KAT preparation cleanup failed",error);process.exitCode=1}).finally(async()=>{await prisma.$disconnect()});
