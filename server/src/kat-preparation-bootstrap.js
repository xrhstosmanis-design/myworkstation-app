import crypto from "crypto";
import {prisma} from "./prisma.js";
import {ensureKatPreparationDefaults} from "./kat-preparation-defaults.js";

const uid=()=>crypto.randomUUID();
const META_SEP="::MWSMETA::";
const CHILD_SEP="::MWSCHILD::";
const MAIN_CATEGORY="ΡΟΦΗΜΑΤΑ";
const SUBCATEGORIES={COFFEE:"ΚΑΦΕΣ",CHOCOLATE:"ΣΟΚΟΛΑΤΑ",TEA:"ΤΣΑΙ",INGREDIENTS:"ΥΛΙΚΑ / MODIFIERS"};
const LEGACY_CATEGORIES=["ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΚΑΦΕ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΣΟΚΟΛΑΤΑ","ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ ΤΣΑΙ"];
const round2=v=>Number(Number(v||0).toFixed(2));
const encoded=(name,codes)=>`${name}${META_SEP}${codes.map(c=>encodeURIComponent(String(c))).join(",")}`;
const childEncoded=(name,children)=>`${name}${CHILD_SEP}${encodeURIComponent(JSON.stringify(children))}`;
const ean13=seed=>{const hash=crypto.createHash("sha256").update(String(seed)).digest();let body="291";for(let i=0;body.length<12;i++)body+=String(hash[i%hash.length]%10);body=body.slice(0,12);let sum=0;for(let i=0;i<12;i++)sum+=Number(body[i])*(i%2===0?1:3);return `${body}${(10-(sum%10))%10}`};

const INGREDIENTS=[
 ["MWS-PREP-COFFEE-BEANS","ΚΑΦΕΣ ΣΕ ΚΟΚΚΟΥΣ","GR"],
 ["MWS-PREP-DECAF","ΚΑΦΕΣ DECAF","GR"],
 ["MWS-PREP-INSTANT-COFFEE","ΚΑΦΕΣ ΣΤΙΓΜΙΑΙΟΣ","GR"],
 ["MWS-PREP-GREEK-COFFEE","ΚΑΦΕΣ ΕΛΛΗΝΙΚΟΣ","GR"],
 ["MWS-PREP-FILTER-COFFEE","ΚΑΦΕΣ ΦΙΛΤΡΟΥ","GR"],
 ["MWS-PREP-WATER","ΝΕΡΟ ΠΑΡΑΣΚΕΥΗΣ","ML"],
 ["MWS-PREP-SUGAR-WHITE","ΖΑΧΑΡΗ ΛΕΥΚΗ","GR"],
 ["MWS-PREP-SUGAR-BROWN","ΖΑΧΑΡΗ ΚΑΣΤΑΝΗ","GR"],
 ["MWS-PREP-SWEETENER","ΓΛΥΚΑΝΤΙΚΟ / ΖΑΧΑΡΙΝΗ","PCS"],
 ["MWS-PREP-ICE","ΠΑΓΟΣ","GR"],
 ["MWS-PREP-MILK","ΓΑΛΑ ΦΡΕΣΚΟ","ML"],
 ["MWS-PREP-MILK-EVAP","ΓΑΛΑ ΕΒΑΠΟΡΕ","ML"],
 ["MWS-PREP-MILK-LF","ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ","ML"],
 ["MWS-PREP-MILK-ALMOND","ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ","ML"],
 ["MWS-PREP-MILK-OAT","ΓΑΛΑ ΒΡΩΜΗΣ","ML"],
 ["MWS-PREP-MILK-SOY","ΓΑΛΑ ΣΟΓΙΑΣ","ML"],
 ["MWS-PREP-SYRUP-CHOC","ΣΙΡΟΠΙ ΣΟΚΟΛΑΤΑ","ML"],
 ["MWS-PREP-SYRUP-CARAMEL","ΣΙΡΟΠΙ ΚΑΡΑΜΕΛΑ","ML"],
 ["MWS-PREP-SYRUP-VANILLA","ΣΙΡΟΠΙ ΒΑΝΙΛΙΑ","ML"],
 ["MWS-PREP-SYRUP-HAZELNUT","ΣΙΡΟΠΙ ΦΟΥΝΤΟΥΚΙ","ML"],
 ["MWS-PREP-CUP-SMALL","ΠΟΤΗΡΙ ΚΑΦΕ ΜΙΚΡΟ","PCS"],
 ["MWS-PREP-CUP-LARGE","ΠΟΤΗΡΙ ΚΑΦΕ ΜΕΓΑΛΟ","PCS"],
 ["MWS-PREP-LID-SMALL","ΚΑΠΑΚΙ ΚΑΦΕ ΜΙΚΡΟ","PCS"],
 ["MWS-PREP-LID-LARGE","ΚΑΠΑΚΙ ΚΑΦΕ ΜΕΓΑΛΟ","PCS"],
 ["MWS-PREP-STRAW","ΚΑΛΑΜΑΚΙ","PCS"],
 ["MWS-PREP-CINNAMON","ΚΑΝΕΛΑ","GR"],
 ["MWS-PREP-CHOC-MIX","ΜΙΓΜΑ ΣΟΚΟΛΑΤΑΣ","GR"],
 ["MWS-PREP-WHITE-CHOC-MIX","ΜΙΓΜΑ ΛΕΥΚΗΣ ΣΟΚΟΛΑΤΑΣ","GR"],
 ["MWS-PREP-COCOA","ΚΑΚΑΟ","GR"],
 ["MWS-PREP-WHIP","ΣΑΝΤΙΓΙ","GR"]
];

const CATALOG=[
 ["COFFEE","ESP-SINGLE","ESPRESSO ΜΟΝΟΣ","HOT",1.80],
 ["COFFEE","ESP-DOUBLE","ESPRESSO ΔΙΠΛΟΣ","HOT",2.20],
 ["COFFEE","RISTRETTO","RISTRETTO","HOT",1.80],
 ["COFFEE","LUNGO","ESPRESSO LUNGO ΜΟΝΟΣ","HOT",2.00],
 ["COFFEE","LUNGO-DOUBLE","ESPRESSO LUNGO ΔΙΠΛΟΣ","HOT",2.50],
 ["COFFEE","MACCHIATO","ESPRESSO MACCHIATO ΜΟΝΟΣ","HOT",2.20],
 ["COFFEE","MACCHIATO-DOUBLE","ESPRESSO MACCHIATO ΔΙΠΛΟΣ","HOT",2.70],
 ["COFFEE","AMERICANO","AMERICANO ΜΟΝΟΣ","HOT",2.30],
 ["COFFEE","AMERICANO-DOUBLE","AMERICANO ΔΙΠΛΟΣ","HOT",2.80],
 ["COFFEE","CAP-SINGLE","CAPPUCCINO ΜΟΝΟΣ","HOT",2.30],
 ["COFFEE","CAP-DOUBLE","CAPPUCCINO ΔΙΠΛΟΣ","HOT",2.80],
 ["COFFEE","CAP-LATTE-SINGLE","CAPPUCCINO LATTE ΜΟΝΟΣ","HOT",3.00],
 ["COFFEE","CAP-LATTE-DOUBLE","CAPPUCCINO LATTE ΔΙΠΛΟΣ","HOT",3.40],
 ["COFFEE","LATTE-HOT","CAFFE LATTE","HOT",2.80],
 ["COFFEE","FLAT-WHITE","FLAT WHITE","HOT",2.90],
 ["COFFEE","CORTADO","CORTADO","HOT",2.80],
 ["COFFEE","MOCHA-HOT","MOCHA ΖΕΣΤΟ","HOT",3.20],
 ["COFFEE","GREEK-SINGLE","ΕΛΛΗΝΙΚΟΣ ΜΟΝΟΣ","HOT",1.80],
 ["COFFEE","GREEK-DOUBLE","ΕΛΛΗΝΙΚΟΣ ΔΙΠΛΟΣ","HOT",2.30],
 ["COFFEE","FILTER","ΚΑΦΕΣ ΦΙΛΤΡΟΥ ΜΙΚΡΟΣ","HOT",2.20],
 ["COFFEE","FILTER-LARGE","ΚΑΦΕΣ ΦΙΛΤΡΟΥ ΜΕΓΑΛΟΣ","HOT",2.70],
 ["COFFEE","NES-HOT","NESCAFE ΖΕΣΤΟΣ","HOT",2.20],
 ["COFFEE","DECAF-ESP","ESPRESSO DECAF","HOT",2.00],
 ["COFFEE","DECAF-CAP","CAPPUCCINO DECAF","HOT",2.50],
 ["COFFEE","DECAF-LATTE","LATTE DECAF","HOT",3.00],
 ["COFFEE","FREDDO-ESP","FREDDO ESPRESSO","COLD",2.50],
 ["COFFEE","FREDDO-CAP","FREDDO CAPPUCCINO","COLD",2.80],
 ["COFFEE","FREDDO-CAP-LATTE","FREDDO CAPPUCCINO LATTE","COLD",3.20],
 ["COFFEE","ICED-AMER","ICED AMERICANO","COLD",2.50],
 ["COFFEE","ICED-LATTE","ICED LATTE","COLD",3.00],
 ["COFFEE","FRAPPE","ΦΡΑΠΕ","COLD",2.30],
 ["COFFEE","FRAPPE-MILK","ΦΡΑΠΕ ΜΕ ΓΑΛΑ","COLD",2.60],
 ["COFFEE","NES-COLD","NESCAFE ΚΡΥΟΣ","COLD",2.30],
 ["COFFEE","DECAF-FREDDO","FREDDO ESPRESSO DECAF","COLD",2.70],
 ["COFFEE","DECAF-FREDDO-CAP","FREDDO CAPPUCCINO DECAF","COLD",3.00],
 ["COFFEE","MOCHA-COLD","MOCHA ΚΡΥΟ","COLD",3.30],
 ["CHOCOLATE","CHOC-HOT","ΖΕΣΤΗ ΣΟΚΟΛΑΤΑ","HOT",3.00],
 ["CHOCOLATE","CHOC-COLD","ΚΡΥΑ ΣΟΚΟΛΑΤΑ","COLD",3.00],
 ["CHOCOLATE","CHOC-WHITE-HOT","ΛΕΥΚΗ ΖΕΣΤΗ ΣΟΚΟΛΑΤΑ","HOT",3.20],
 ["CHOCOLATE","CHOC-WHITE-COLD","ΛΕΥΚΗ ΚΡΥΑ ΣΟΚΟΛΑΤΑ","COLD",3.20],
 ["CHOCOLATE","CHOC-HAZ-HOT","ΣΟΚΟΛΑΤΑ ΦΟΥΝΤΟΥΚΙ ΖΕΣΤΗ","HOT",3.40],
 ["CHOCOLATE","CHOC-HAZ-COLD","ΣΟΚΟΛΑΤΑ ΦΟΥΝΤΟΥΚΙ ΚΡΥΑ","COLD",3.40],
 ["CHOCOLATE","CHOC-CARAMEL-HOT","ΣΟΚΟΛΑΤΑ ΚΑΡΑΜΕΛΑ ΖΕΣΤΗ","HOT",3.40],
 ["CHOCOLATE","CHOC-CARAMEL-COLD","ΣΟΚΟΛΑΤΑ ΚΑΡΑΜΕΛΑ ΚΡΥΑ","COLD",3.40],
 ["TEA","TEA-BLACK","ΤΣΑΙ ΜΑΥΡΟ","HOT",2.20],
 ["TEA","TEA-GREEN","ΤΣΑΙ ΠΡΑΣΙΝΟ","HOT",2.20],
 ["TEA","CHAMOMILE","ΧΑΜΟΜΗΛΙ","HOT",2.20],
 ["TEA","MOUNTAIN-TEA","ΤΣΑΙ ΒΟΥΝΟΥ","HOT",2.20],
 ["TEA","ICED-TEA","ICED TEA ΠΑΡΑΣΚΕΥΗΣ","COLD",2.80],
 ["TEA","MATCHA-HOT","MATCHA LATTE ΖΕΣΤΟ","HOT",3.50],
 ["TEA","MATCHA-COLD","MATCHA LATTE ΚΡΥΟ","COLD",3.50]
];

async function ensureSubcategory(companyId,categoryId,name){let [sub]=await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${categoryId} AND UPPER("name")=UPPER(${name}) LIMIT 1`;if(!sub){sub={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name","property","classification","active") VALUES (${sub.id},${companyId},${categoryId},${name},'STOCK_ITEM','PRODUCT',true)`}else await prisma.$executeRaw`UPDATE "ProductSubcategory" SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sub.id}`;return sub}

export async function ensureKatPreparationSeed(){
 await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"legacyCode" TEXT,"name" TEXT NOT NULL,"property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',"points" DECIMAL(14,4) NOT NULL DEFAULT 0,"pluGroup" INTEGER NOT NULL DEFAULT 0,"classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',"eshopCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 const [store]=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "active"=true AND (UPPER("name") LIKE '%ΚΑΤ%' OR UPPER("name") LIKE '%KAT%') ORDER BY "createdAt" LIMIT 1`;if(!store)return {ok:false,reason:"KAT_STORE_NOT_FOUND"};const companyId=store.companyId;
 let [main]=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND UPPER("name")=UPPER(${MAIN_CATEGORY}) LIMIT 1`;if(!main){main={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active") VALUES (${main.id},${companyId},${MAIN_CATEGORY},true)`}else await prisma.$executeRaw`UPDATE "ProductCategory" SET "active"=true WHERE "id"=${main.id}`;
 const subs={};for(const [key,name] of Object.entries(SUBCATEGORIES))subs[key]=await ensureSubcategory(companyId,main.id,name);

 for(const [sku,name,unit] of INGREDIENTS){let [p]=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${sku} LIMIT 1`;if(!p){p={id:uid()};await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${p.id},${companyId},${main.id},${subs.INGREDIENTS.id},${sku},${name},'Υλικό παρασκευής / modifier',${unit},13,0,0,true,true)`}else await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${main.id},"subcategoryId"=${subs.INGREDIENTS.id},"unit"=${unit},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p.id}`;let [sp]=await prisma.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${p.id} LIMIT 1`;if(!sp)await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${p.id},0,0,false)`;else await prisma.$executeRaw`UPDATE "StoreProduct" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sp.id}`}

 const items=[];for(const [family,code,name,temp,sale] of CATALOG){const sku=`MWS-KAT-BEV-${code}`,barcode=ean13(`${companyId}:${sku}`),salePrice=round2(sale),costPrice=round2(Math.max(.20,salePrice*.25)),sub=subs[family];let [p]=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${sku} LIMIT 1`;if(!p){p={id:uid()};await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${p.id},${companyId},${main.id},${sub.id},${sku},${name},${`Νέο είδος MyWorkStation ΚΑΤ · ${temp==='COLD'?'Κρύο':'Ζεστό'} · προσωρινό κόστος ${costPrice.toFixed(2)} €`},'PIECE',13,${salePrice},${costPrice},true,true)`}else await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${main.id},"subcategoryId"=${sub.id},"name"=${name},"salePrice"=${salePrice},"costPrice"=${costPrice},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p.id}`;let [pb]=await prisma.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${p.id} AND "barcode"=${barcode} LIMIT 1`;if(!pb)await prisma.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${p.id},${barcode},1)`;let [sp]=await prisma.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${p.id} LIMIT 1`;if(!sp)await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${p.id},${salePrice},0,true)`;else await prisma.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${salePrice},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sp.id}`;items.push({family,temp,sku,name})}

 const legacyCats=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "name"=ANY(${LEGACY_CATEGORIES}::text[])`;
 const legacyIds=legacyCats.map(x=>x.id);
 if(legacyIds.length){await prisma.$executeRaw`UPDATE "StoreProduct" sp SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP FROM "Product" p WHERE sp."storeId"=${store.id} AND sp."productId"=p."id" AND p."categoryId"=ANY(${legacyIds}::text[]) AND COALESCE(p."sku",'') NOT LIKE 'MWS-KAT-BEV-%' AND COALESCE(p."sku",'') NOT LIKE 'MWS-PREP-%'`;await prisma.$executeRaw`UPDATE "ProductCategory" SET "active"=false WHERE "companyId"=${companyId} AND "id"=ANY(${legacyIds}::text[])`}
 await prisma.$executeRaw`UPDATE "StoreProduct" sp SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP FROM "Product" p WHERE sp."storeId"=${store.id} AND sp."productId"=p."id" AND p."categoryId"=${main.id} AND COALESCE(p."sku",'') NOT LIKE 'MWS-KAT-BEV-%' AND COALESCE(p."sku",'') NOT LIKE 'MWS-PREP-%'`;

 const coffee=items.filter(x=>x.family==='COFFEE'),choc=items.filter(x=>x.family==='CHOCOLATE'),tea=items.filter(x=>x.family==='TEA');
 const child=(id,label,arr,color)=>({id,label,color,productCodes:arr.map(x=>x.sku),categoryName:encoded(label,arr.map(x=>x.sku))});
 const coffeeChildren=[child('kat-coffee-cold','ΚΡΥΟΙ ΚΑΦΕΔΕΣ',coffee.filter(x=>x.temp==='COLD'),'#2f7fba'),child('kat-coffee-hot','ΖΕΣΤΟΙ ΚΑΦΕΔΕΣ',coffee.filter(x=>x.temp==='HOT'),'#d97a24')];
 const chocChildren=[child('kat-choc-cold','ΚΡΥΑ ΣΟΚΟΛΑΤΑ',choc.filter(x=>x.temp==='COLD'),'#81549a'),child('kat-choc-hot','ΖΕΣΤΗ ΣΟΚΟΛΑΤΑ',choc.filter(x=>x.temp==='HOT'),'#b15252')];
 const teaChildren=[child('kat-tea-cold','ΚΡΥΟ ΤΣΑΙ',tea.filter(x=>x.temp==='COLD'),'#1599a8'),child('kat-tea-hot','ΖΕΣΤΟ ΤΣΑΙ',tea.filter(x=>x.temp==='HOT'),'#9a8f19')];
 const rows=await prisma.$queryRawUnsafe(`SELECT "layoutJson" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);if(rows[0]?.layoutJson){const layout=structuredClone(rows[0].layoutJson),existing=Array.isArray(layout.categories)?layout.categories:[];const roots=[{id:'kat-coffee-root',label:'ΚΑΦΕΣ',color:'#1599a8',visible:true,categoryName:childEncoded('ΚΑΦΕΣ',coffeeChildren),children:coffeeChildren},{id:'kat-choc-root',label:'ΣΟΚΟΛΑΤΑ',color:'#81549a',visible:true,categoryName:childEncoded('ΣΟΚΟΛΑΤΑ',chocChildren),children:chocChildren},{id:'kat-tea-root',label:'ΤΣΑΙ',color:'#9a8f19',visible:true,categoryName:childEncoded('ΤΣΑΙ',teaChildren),children:teaChildren}];layout.categories=[...roots,...existing.filter(x=>!String(x?.id||'').startsWith('kat-drinks-')&&!String(x?.id||'').startsWith('kat-coffee-')&&!String(x?.id||'').startsWith('kat-choc-')&&!String(x?.id||'').startsWith('kat-tea-')&&!String(x?.id||'').startsWith('kat-prep-'))].slice(0,14);await prisma.$queryRawUnsafe(`UPDATE "StorePosLayout" SET "layoutJson"=$2::jsonb,"version"="version"+1,"publishedAt"=NOW() WHERE "storeId"=$1`,store.id,JSON.stringify(layout))}
 const defaults=await ensureKatPreparationDefaults();
 return {ok:true,storeId:store.id,mainCategory:MAIN_CATEGORY,coffeeCount:coffee.length,chocolateCount:choc.length,teaCount:tea.length,ingredientCount:INGREDIENTS.length,legacyCategoriesDisabled:legacyIds.length,preparationDefaults:defaults};
}