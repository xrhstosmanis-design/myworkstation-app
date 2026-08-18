import crypto from "crypto";
import {prisma} from "./prisma.js";

const uid=()=>crypto.randomUUID();
const CATEGORY="ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΚΑΦΕ";
const SUBCATEGORY="ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ";
const META_SEP="::MWSMETA::";
const CHILD_SEP="::MWSCHILD::";

const INGREDIENTS=[
 ["MWS-PREP-COFFEE-BEANS","ΚΑΦΕΣ ΣΕ ΚΟΚΚΟΥΣ","GR"],["MWS-PREP-DECAF","ΚΑΦΕΣ DECAF","GR"],["MWS-PREP-SUGAR-WHITE","ΖΑΧΑΡΗ ΛΕΥΚΗ","GR"],["MWS-PREP-SUGAR-BROWN","ΖΑΧΑΡΗ ΚΑΣΤΑΝΗ","GR"],["MWS-PREP-SWEETENER","ΓΛΥΚΑΝΤΙΚΟ / ΖΑΧΑΡΙΝΗ","PCS"],["MWS-PREP-ICE","ΠΑΓΟΣ","PCS"],["MWS-PREP-MILK","ΓΑΛΑ ΦΡΕΣΚΟ","ML"],["MWS-PREP-MILK-LF","ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ","ML"],["MWS-PREP-MILK-ALMOND","ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ","ML"],["MWS-PREP-MILK-OAT","ΓΑΛΑ ΒΡΩΜΗΣ","ML"],["MWS-PREP-MILK-SOY","ΓΑΛΑ ΣΟΓΙΑΣ","ML"],["MWS-PREP-SYRUP-CHOC","ΣΙΡΟΠΙ ΣΟΚΟΛΑΤΑ","ML"],["MWS-PREP-SYRUP-CARAMEL","ΣΙΡΟΠΙ ΚΑΡΑΜΕΛΑ","ML"],["MWS-PREP-SYRUP-VANILLA","ΣΙΡΟΠΙ ΒΑΝΙΛΙΑ","ML"],["MWS-PREP-SYRUP-HAZELNUT","ΣΙΡΟΠΙ ΦΟΥΝΤΟΥΚΙ","ML"],["MWS-PREP-CUP-SMALL","ΠΟΤΗΡΙ ΚΑΦΕ ΜΙΚΡΟ","PCS"],["MWS-PREP-CUP-LARGE","ΠΟΤΗΡΙ ΚΑΦΕ ΜΕΓΑΛΟ","PCS"],["MWS-PREP-LID-SMALL","ΚΑΠΑΚΙ ΚΑΦΕ ΜΙΚΡΟ","PCS"],["MWS-PREP-LID-LARGE","ΚΑΠΑΚΙ ΚΑΦΕ ΜΕΓΑΛΟ","PCS"],["MWS-PREP-STRAW","ΚΑΛΑΜΑΚΙ","PCS"],["MWS-PREP-CINNAMON","ΚΑΝΕΛΑ","GR"],["MWS-PREP-COCOA","ΚΑΚΑΟ","GR"],["MWS-PREP-WHIP","ΣΑΝΤΙΓΙ","GR"]
];
const coffeeLike=name=>/ESPRESSO|FREDDO|CAPPUCCINO|CAPPU|\bCAP\b|LATTE|AMERICANO|NESCAFE|FRAPPE|ΦΡΑΠ|ΕΛΛΗΝΙΚ|GREEK COFFEE|ΦΙΛΤΡ|FILTER COFFEE|DECAF|MACCHIATO|MOCHA|FLAT WHITE|ΣΟΚΟΛΑΤ|CHOCOLATE|ΤΣΑΙ|TEA|MATCHA|CHAI/i.test(String(name||""));
const coldLike=name=>/FREDDO|FRAPPE|ΦΡΑΠ|ICED|ΚΡΥ|COLD/i.test(String(name||""));
const encoded=(name,codes)=>`${name}${META_SEP}${codes.map(c=>encodeURIComponent(String(c))).join(",")}`;
const childEncoded=(name,children)=>`${name}${CHILD_SEP}${encodeURIComponent(JSON.stringify(children))}`;

export async function ensureKatPreparationSeed(){
 await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"legacyCode" TEXT,"name" TEXT NOT NULL,"property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',"points" DECIMAL(14,4) NOT NULL DEFAULT 0,"pluGroup" INTEGER NOT NULL DEFAULT 0,"classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',"eshopCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 const [store]=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "active"=true AND (UPPER("name") LIKE '%ΚΑΤ%' OR UPPER("name") LIKE '%KAT%') ORDER BY "createdAt" LIMIT 1`;
 if(!store)return {ok:false,reason:"KAT_STORE_NOT_FOUND"};const companyId=store.companyId;
 let [category]=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND UPPER("name")=UPPER(${CATEGORY}) LIMIT 1`;
 if(!category){category={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active") VALUES (${category.id},${companyId},${CATEGORY},true)`}
 let [sub]=await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${category.id} AND UPPER("name")=UPPER(${SUBCATEGORY}) LIMIT 1`;
 if(!sub){sub={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name","property","classification","active") VALUES (${sub.id},${companyId},${category.id},${SUBCATEGORY},'STOCK_ITEM','PRODUCT',true)`}
 for(const [sku,name,unit] of INGREDIENTS){let [p]=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${sku} LIMIT 1`;if(!p){p={id:uid()};await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${p.id},${companyId},${category.id},${sub.id},${sku},${name},'Υλικό παρασκευής / modifier',${unit},13,0,0,true,true)`}else await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${category.id},"subcategoryId"=${sub.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p.id}`;let [sp]=await prisma.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${p.id} LIMIT 1`;if(!sp)await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${p.id},0,0,false)`;else await prisma.$executeRaw`UPDATE "StoreProduct" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sp.id}`}
 const products=await prisma.$queryRaw`SELECT p."id",p."sku",p."name" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true ORDER BY p."name"`;
 const coffees=products.filter(p=>coffeeLike(p.name));if(coffees.length){const ids=coffees.map(p=>p.id);await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${category.id},"subcategoryId"=${sub.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`}
 const cold=coffees.filter(p=>coldLike(p.name)),hot=coffees.filter(p=>!coldLike(p.name));
 const toChild=(label,rows,color)=>({id:`kat-drinks-${label==='ΚΡΥΑ ΡΟΦΗΜΑΤΑ'?'cold':'hot'}`,label,color,productCodes:[...new Set(rows.map(p=>String(p.sku||p.id)))],categoryName:encoded(label,[...new Set(rows.map(p=>String(p.sku||p.id)))])});
 const children=[toChild("ΚΡΥΑ ΡΟΦΗΜΑΤΑ",cold,"#2f7fba"),toChild("ΖΕΣΤΑ ΡΟΦΗΜΑΤΑ",hot,"#d97a24")];
 const rows=await prisma.$queryRawUnsafe(`SELECT "layoutJson" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);if(rows[0]?.layoutJson){const layout=structuredClone(rows[0].layoutJson);const existing=Array.isArray(layout.categories)?layout.categories:[];const beverages={id:"kat-drinks-root",label:"ΡΟΦΗΜΑΤΑ",color:"#1599a8",visible:true,categoryName:childEncoded("ΡΟΦΗΜΑΤΑ",children),children};layout.categories=[beverages,...existing.filter(x=>String(x?.id||"")!=="kat-drinks-root"&& !String(x?.id||"").startsWith("kat-prep-"))].slice(0,14);await prisma.$queryRawUnsafe(`UPDATE "StorePosLayout" SET "layoutJson"=$2::jsonb,"version"="version"+1,"publishedAt"=NOW() WHERE "storeId"=$1`,store.id,JSON.stringify(layout))}
 return {ok:true,storeId:store.id,coffeeCount:coffees.length,coldCount:cold.length,hotCount:hot.length,ingredientCount:INGREDIENTS.length};
}
