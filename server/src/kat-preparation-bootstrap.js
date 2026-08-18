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

// Νέα είδη MyWorkStation για ΚΑΤ. Οι τιμές είναι προσωρινές/test και θα ενημερωθούν από πραγματικά τιμολόγια.
const BEVERAGE_CATALOG=[
 ["ESP-SINGLE","ESPRESSO ΜΟΝΟΣ","HOT",1.80],["ESP-DOUBLE","ESPRESSO ΔΙΠΛΟΣ","HOT",2.20],["RISTRETTO","RISTRETTO","HOT",1.80],["LUNGO","ESPRESSO LUNGO","HOT",2.00],["MACCHIATO","ESPRESSO MACCHIATO","HOT",2.20],["AMERICANO","AMERICANO","HOT",2.30],
 ["CAP-SINGLE","CAPPUCCINO ΜΟΝΟΣ","HOT",2.30],["CAP-DOUBLE","CAPPUCCINO ΔΙΠΛΟΣ","HOT",2.80],["LATTE-HOT","CAFFE LATTE","HOT",2.80],["FLAT-WHITE","FLAT WHITE","HOT",2.90],["MOCHA-HOT","MOCHA ΖΕΣΤΟ","HOT",3.20],
 ["GREEK-SINGLE","ΕΛΛΗΝΙΚΟΣ ΜΟΝΟΣ","HOT",1.80],["GREEK-DOUBLE","ΕΛΛΗΝΙΚΟΣ ΔΙΠΛΟΣ","HOT",2.30],["FILTER","ΚΑΦΕΣ ΦΙΛΤΡΟΥ","HOT",2.20],["NES-HOT","NESCAFE ΖΕΣΤΟ","HOT",2.20],
 ["DECAF-ESP","ESPRESSO DECAF","HOT",2.00],["DECAF-CAP","CAPPUCCINO DECAF","HOT",2.50],["DECAF-LATTE","LATTE DECAF","HOT",3.00],
 ["FREDDO-ESP","FREDDO ESPRESSO","COLD",2.50],["FREDDO-CAP","FREDDO CAPPUCCINO","COLD",2.80],["ICED-AMER","ICED AMERICANO","COLD",2.50],["ICED-LATTE","ICED LATTE","COLD",3.00],["FRAPPE","ΦΡΑΠΕ","COLD",2.30],["FRAPPE-MILK","ΦΡΑΠΕ ΜΕ ΓΑΛΑ","COLD",2.60],["DECAF-FREDDO","FREDDO ESPRESSO DECAF","COLD",2.70],["DECAF-FREDDO-CAP","FREDDO CAPPUCCINO DECAF","COLD",3.00],["MOCHA-COLD","ICED MOCHA","COLD",3.30],
 ["CHOC-HOT","ΣΟΚΟΛΑΤΑ ΖΕΣΤΗ","HOT",3.00],["CHOC-COLD","ΣΟΚΟΛΑΤΑ ΚΡΥΑ","COLD",3.00],["CHOC-WHITE-HOT","ΛΕΥΚΗ ΣΟΚΟΛΑΤΑ ΖΕΣΤΗ","HOT",3.20],["CHOC-WHITE-COLD","ΛΕΥΚΗ ΣΟΚΟΛΑΤΑ ΚΡΥΑ","COLD",3.20],
 ["TEA-BLACK","ΤΣΑΙ ΜΑΥΡΟ","HOT",2.20],["TEA-GREEN","ΤΣΑΙ ΠΡΑΣΙΝΟ","HOT",2.20],["CHAMOMILE","ΧΑΜΟΜΗΛΙ","HOT",2.20],["MOUNTAIN-TEA","ΤΣΑΙ ΒΟΥΝΟΥ","HOT",2.20],["ICED-TEA","ICED TEA ΠΑΡΑΣΚΕΥΗΣ","COLD",2.80],
 ["MATCHA-HOT","MATCHA LATTE ΖΕΣΤΟ","HOT",3.50],["MATCHA-COLD","MATCHA LATTE ΚΡΥΟ","COLD",3.50]
];

const round2=v=>Number(Number(v||0).toFixed(2));
const encoded=(name,codes)=>`${name}${META_SEP}${codes.map(c=>encodeURIComponent(String(c))).join(",")}`;
const childEncoded=(name,children)=>`${name}${CHILD_SEP}${encodeURIComponent(JSON.stringify(children))}`;
const ean13=seed=>{const hash=crypto.createHash("sha256").update(String(seed)).digest();let body="291";for(let i=0;body.length<12;i++)body+=String(hash[i%hash.length]%10);body=body.slice(0,12);let sum=0;for(let i=0;i<12;i++)sum+=Number(body[i])*(i%2===0?1:3);return `${body}${(10-(sum%10))%10}`};

export async function ensureKatPreparationSeed(){
 await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"legacyCode" TEXT,"name" TEXT NOT NULL,"property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',"points" DECIMAL(14,4) NOT NULL DEFAULT 0,"pluGroup" INTEGER NOT NULL DEFAULT 0,"classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',"eshopCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 const [store]=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" WHERE "active"=true AND (UPPER("name") LIKE '%ΚΑΤ%' OR UPPER("name") LIKE '%KAT%') ORDER BY "createdAt" LIMIT 1`;
 if(!store)return {ok:false,reason:"KAT_STORE_NOT_FOUND"};
 const companyId=store.companyId;
 let [category]=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND UPPER("name")=UPPER(${CATEGORY}) LIMIT 1`;
 if(!category){category={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active") VALUES (${category.id},${companyId},${CATEGORY},true)`}
 let [sub]=await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${category.id} AND UPPER("name")=UPPER(${SUBCATEGORY}) LIMIT 1`;
 if(!sub){sub={id:uid()};await prisma.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name","property","classification","active") VALUES (${sub.id},${companyId},${category.id},${SUBCATEGORY},'STOCK_ITEM','PRODUCT',true)`}

 // Υλικά συνταγών / modifiers: πραγματικό stock, όχι πωλήσιμα στο POS.
 for(const [sku,name,unit] of INGREDIENTS){
  let [p]=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${sku} LIMIT 1`;
  if(!p){p={id:uid()};await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${p.id},${companyId},${category.id},${sub.id},${sku},${name},'Υλικό παρασκευής / modifier',${unit},13,0,0,true,true)`}
  else await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${category.id},"subcategoryId"=${sub.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p.id}`;
  let [sp]=await prisma.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${p.id} LIMIT 1`;
  if(!sp)await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${p.id},0,0,false)`;
  else await prisma.$executeRaw`UPDATE "StoreProduct" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sp.id}`;
 }

 const beverages=[];
 for(const [code,name,temp,sale] of BEVERAGE_CATALOG){
  const sku=`MWS-KAT-BEV-${code}`,barcode=ean13(`${companyId}:${sku}`),salePrice=round2(sale),costPrice=round2(Math.max(.20,salePrice*.25));
  let [product]=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "sku"=${sku} LIMIT 1`;
  if(!product){product={id:uid()};await prisma.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${product.id},${companyId},${category.id},${sub.id},${sku},${name},${`Νέο είδος MyWorkStation ΚΑΤ · ${temp==='COLD'?'Κρύο':'Ζεστό'} ρόφημα · προσωρινό κόστος ${costPrice.toFixed(2)} €`},'PIECE',13,${salePrice},${costPrice},true,true)`}
  else await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${category.id},"subcategoryId"=${sub.id},"name"=${name},"salePrice"=${salePrice},"costPrice"=${costPrice},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id}`;
  let [pb]=await prisma.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${product.id} AND "barcode"=${barcode} LIMIT 1`;
  if(!pb)await prisma.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${product.id},${barcode},1)`;
  let [sp]=await prisma.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${product.id} LIMIT 1`;
  if(!sp)await prisma.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${product.id},${salePrice},0,true)`;
  else await prisma.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${salePrice},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sp.id}`;
  beverages.push({id:product.id,sku,name,temp,barcode,salePrice,costPrice});
 }

 const cold=beverages.filter(p=>p.temp==='COLD'),hot=beverages.filter(p=>p.temp==='HOT');
 const toChild=(label,items,color)=>({id:`kat-drinks-${label==='ΚΡΥΑ ΡΟΦΗΜΑΤΑ'?'cold':'hot'}`,label,color,productCodes:items.map(p=>p.sku),categoryName:encoded(label,items.map(p=>p.sku))});
 const children=[toChild("ΚΡΥΑ ΡΟΦΗΜΑΤΑ",cold,"#2f7fba"),toChild("ΖΕΣΤΑ ΡΟΦΗΜΑΤΑ",hot,"#d97a24")];
 const rows=await prisma.$queryRawUnsafe(`SELECT "layoutJson" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id).catch(()=>[]);
 if(rows[0]?.layoutJson){
  const layout=structuredClone(rows[0].layoutJson),existing=Array.isArray(layout.categories)?layout.categories:[];
  const drinks={id:"kat-drinks-root",label:"ΡΟΦΗΜΑΤΑ",color:"#1599a8",visible:true,categoryName:childEncoded("ΡΟΦΗΜΑΤΑ",children),children};
  layout.categories=[drinks,...existing.filter(x=>String(x?.id||"")!=="kat-drinks-root"&&!String(x?.id||"").startsWith("kat-prep-"))].slice(0,14);
  await prisma.$queryRawUnsafe(`UPDATE "StorePosLayout" SET "layoutJson"=$2::jsonb,"version"="version"+1,"publishedAt"=NOW() WHERE "storeId"=$1`,store.id,JSON.stringify(layout));
 }
 return {ok:true,storeId:store.id,beverageCount:beverages.length,coldCount:cold.length,hotCount:hot.length,ingredientCount:INGREDIENTS.length};
}
