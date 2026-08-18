import crypto from "crypto";
import {prisma} from "./prisma.js";

const uid=()=>crypto.randomUUID();
const RECIPE_PROFILE_VERSION=2;
const GROUPS=[
 {name:"ΖΑΧΑΡΗ",items:[[10,"ΣΚΕΤΟΣ",0],[20,"ΠΡΟΣ ΜΕΤΡΙΟ",0],[30,"ΜΕΤΡΙΟΣ",0],[40,"ΓΛΥΚΟΣ",0],[50,"ΠΟΛΥ ΓΛΥΚΟΣ",0],[60,"ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",0],[70,"ΣΤΕΒΙΑ",0],[80,"ΖΑΧΑΡΙΝΗ",0]]},
 {name:"ΠΑΓΟΣ",items:[[10,"ΧΩΡΙΣ ΠΑΓΟ",0],[20,"ΛΙΓΟΣ ΠΑΓΟΣ",0],[30,"ΚΑΝΟΝΙΚΟΣ ΠΑΓΟΣ",0],[40,"ΠΟΛΥΣ ΠΑΓΟΣ",0]]},
 {name:"ΧΤΥΠΗΜΑ",items:[[10,"ΧΤΥΠΗΤΟΣ",0],[20,"ΑΧΤΥΠΗΤΟΣ",0]]},
 {name:"ΣΙΡΟΠΙ",items:[[10,"ΣΟΚΟΛΑΤΑ",.50],[20,"ΚΑΡΑΜΕΛΑ",.50],[30,"ΒΑΝΙΛΙΑ",.50],[40,"ΦΟΥΝΤΟΥΚΙ",.50]]},
 {name:"ΓΑΛΑ",items:[[10,"ΦΡΕΣΚΟ ΓΑΛΑ",0],[20,"ΧΩΡΙΣ ΛΑΚΤΟΖΗ",.50],[30,"ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ",.50],[40,"ΓΑΛΑ ΒΡΩΜΗΣ",.50],[50,"ΓΑΛΑ ΣΟΓΙΑΣ",.50]]},
 {name:"EXTRA",items:[[10,"EXTRA ΔΟΣΗ",.60],[20,"DECAF",.20],[30,"ΚΑΝΕΛΑ",0],[40,"ΣΑΝΤΙΓΙ",.50]]}
];
const ingredientSku={beans:"MWS-PREP-COFFEE-BEANS",decaf:"MWS-PREP-DECAF",sugar:"MWS-PREP-SUGAR-WHITE",brown:"MWS-PREP-SUGAR-BROWN",sweetener:"MWS-PREP-SWEETENER",ice:"MWS-PREP-ICE",milk:"MWS-PREP-MILK",milkLf:"MWS-PREP-MILK-LF",almond:"MWS-PREP-MILK-ALMOND",oat:"MWS-PREP-MILK-OAT",soy:"MWS-PREP-MILK-SOY",syrChoc:"MWS-PREP-SYRUP-CHOC",syrCar:"MWS-PREP-SYRUP-CARAMEL",syrVan:"MWS-PREP-SYRUP-VANILLA",syrHaz:"MWS-PREP-SYRUP-HAZELNUT",cupS:"MWS-PREP-CUP-SMALL",cupL:"MWS-PREP-CUP-LARGE",lidS:"MWS-PREP-LID-SMALL",lidL:"MWS-PREP-LID-LARGE",straw:"MWS-PREP-STRAW",cinnamon:"MWS-PREP-CINNAMON",cocoa:"MWS-PREP-COCOA",whip:"MWS-PREP-WHIP"};

async function tables(){
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementModifierGroup" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"legacyId" INTEGER,"description" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementModifier" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"groupId" TEXT NOT NULL,"sequence" INTEGER NOT NULL DEFAULT 0,"description" TEXT NOT NULL,"price" NUMERIC(14,4) NOT NULL DEFAULT 0,"costNet" NUMERIC(14,4) NOT NULL DEFAULT 0,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationRecipeLine" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"ingredientProductId" TEXT NOT NULL,"quantity" NUMERIC(14,4) NOT NULL DEFAULT 0,"unit" TEXT NOT NULL DEFAULT 'PCS',"automatic" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationProductModifierGroup" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"groupId" TEXT NOT NULL,"required" BOOLEAN NOT NULL DEFAULT false,"minSelections" INTEGER NOT NULL DEFAULT 0,"maxSelections" INTEGER NOT NULL DEFAULT 1,"sequence" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PreparationProductModifierGroup_key" ON "PreparationProductModifierGroup"("companyId","productId","groupId")`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationModifierConsumption" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"modifierId" TEXT NOT NULL,"ingredientProductId" TEXT NOT NULL,"quantity" NUMERIC(14,4) NOT NULL DEFAULT 0,"unit" TEXT NOT NULL DEFAULT 'PCS',"multiplierMode" TEXT NOT NULL DEFAULT 'FIXED',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationProductSettings" ("companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"preparationEnabled" BOOLEAN NOT NULL DEFAULT false,"environmentalFee" NUMERIC(14,4) NOT NULL DEFAULT 0,"productionStation" TEXT,"autoPrint" BOOLEAN NOT NULL DEFAULT true,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("companyId","productId"))`);
 await prisma.$executeRawUnsafe(`ALTER TABLE "PreparationProductSettings" ADD COLUMN IF NOT EXISTS "recipeProfileVersion" INTEGER NOT NULL DEFAULT 0`);
}
async function ensureGroup(companyId,def){
 let [g]=await prisma.$queryRaw`SELECT "id" FROM "ManagementModifierGroup" WHERE "companyId"=${companyId} AND LOWER("description")=LOWER(${def.name}) LIMIT 1`;
 if(!g){g={id:uid()};await prisma.$executeRaw`INSERT INTO "ManagementModifierGroup" ("id","companyId","description","active") VALUES (${g.id},${companyId},${def.name},true)`}else await prisma.$executeRaw`UPDATE "ManagementModifierGroup" SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${g.id}`;
 const items=[];for(const [sequence,description,price] of def.items){let [m]=await prisma.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${companyId} AND "groupId"=${g.id} AND LOWER("description")=LOWER(${description}) LIMIT 1`;if(!m){m={id:uid()};await prisma.$executeRaw`INSERT INTO "ManagementModifier" ("id","companyId","groupId","sequence","description","price","active") VALUES (${m.id},${companyId},${g.id},${sequence},${description},${price},true)`}else await prisma.$executeRaw`UPDATE "ManagementModifier" SET "sequence"=${sequence},"price"=${price},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${m.id}`;items.push({...m,description})}return {id:g.id,name:def.name,items};
}

function recipeFor(name){
 const n=String(name||"").toLocaleUpperCase("el-GR");
 const cold=/FREDDO|ICED|ΦΡΑΠ/.test(n);
 const explicitSingle=/ΜΟΝΟ|ΜΟΝΟΣ|SINGLE/.test(n);
 const explicitDouble=/ΔΙΠΛ|DOUBLE/.test(n);
 const freddo=/FREDDO/.test(n);
 const espresso=/ESPRESSO|RISTRETTO|LUNGO|MACCHIATO/.test(n);
 const cappuccino=/CAPPUCCINO|CAPPUCINO|CAP /.test(n);
 const latte=/LATTE/.test(n);
 const americano=/AMERICANO/.test(n);
 const flatWhite=/FLAT WHITE/.test(n);
 const mocha=/MOCHA/.test(n);
 const coffee=espresso||cappuccino||latte||americano||flatWhite||mocha||freddo;
 const greek=/ΕΛΛΗΝΙΚ/.test(n),filter=/ΦΙΛΤΡ/.test(n),nes=/NESCAFE|ΦΡΑΠ/.test(n),choc=/ΣΟΚΟΛΑΤ/.test(n),tea=/ΤΣΑΙ|ΧΑΜΟΜΗΛ|MATCHA/.test(n);
 const rows=[];
 const shots=explicitDouble?2:explicitSingle?1:freddo?2:1;
 if(coffee)rows.push([/DECAF/.test(n)?ingredientSku.decaf:ingredientSku.beans,9*shots,"GR"]);
 if(greek)rows.push([ingredientSku.beans,explicitDouble?14:7,"GR"]);
 if(filter)rows.push([ingredientSku.beans,12,"GR"]);
 if(nes)rows.push([ingredientSku.beans,4,"GR"]);
 if(choc)rows.push([ingredientSku.cocoa,25,"GR"]);
 if(cappuccino)rows.push([ingredientSku.milk,cold?60:(shots===2?120:80),"ML"]);
 else if(latte)rows.push([ingredientSku.milk,cold?150:180,"ML"]);
 else if(flatWhite)rows.push([ingredientSku.milk,120,"ML"]);
 else if(mocha)rows.push([ingredientSku.milk,120,"ML"]);
 if(cold){
  rows.push([ingredientSku.ice,30,"GR"],[ingredientSku.cupL,1,"PCS"],[ingredientSku.lidL,1,"PCS"],[ingredientSku.straw,1,"PCS"]);
 }else{
  const smallHot=espresso&&!americano&&!latte&&!cappuccino&&!flatWhite&&!mocha;
  rows.push([smallHot?ingredientSku.cupS:ingredientSku.cupL,1,"PCS"],[smallHot?ingredientSku.lidS:ingredientSku.lidL,1,"PCS"]);
 }
 if(tea&&!/MATCHA/.test(n))rows.push([ingredientSku.sweetener,0.0001,"PCS"]);
 return rows;
}

async function modifierConsumption(companyId,groups,ingredients){const add=async(groupName,modifierName,sku,qty,unit)=>{const g=groups.find(x=>x.name===groupName),m=g?.items.find(x=>x.description===modifierName),p=ingredients.get(sku);if(!m||!p)return;const exists=await prisma.$queryRaw`SELECT "id" FROM "PreparationModifierConsumption" WHERE "companyId"=${companyId} AND "modifierId"=${m.id} AND "ingredientProductId"=${p.id} LIMIT 1`;if(!exists[0])await prisma.$executeRaw`INSERT INTO "PreparationModifierConsumption" ("id","companyId","modifierId","ingredientProductId","quantity","unit") VALUES (${uid()},${companyId},${m.id},${p.id},${qty},${unit})`};
 await add("ΖΑΧΑΡΗ","ΠΡΟΣ ΜΕΤΡΙΟ",ingredientSku.sugar,5,"GR");await add("ΖΑΧΑΡΗ","ΜΕΤΡΙΟΣ",ingredientSku.sugar,10,"GR");await add("ΖΑΧΑΡΗ","ΓΛΥΚΟΣ",ingredientSku.sugar,15,"GR");await add("ΖΑΧΑΡΗ","ΠΟΛΥ ΓΛΥΚΟΣ",ingredientSku.sugar,20,"GR");await add("ΖΑΧΑΡΗ","ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",ingredientSku.brown,10,"GR");await add("ΖΑΧΑΡΗ","ΣΤΕΒΙΑ",ingredientSku.sweetener,1,"PCS");await add("ΖΑΧΑΡΗ","ΖΑΧΑΡΙΝΗ",ingredientSku.sweetener,1,"PCS");await add("ΣΙΡΟΠΙ","ΣΟΚΟΛΑΤΑ",ingredientSku.syrChoc,10,"ML");await add("ΣΙΡΟΠΙ","ΚΑΡΑΜΕΛΑ",ingredientSku.syrCar,10,"ML");await add("ΣΙΡΟΠΙ","ΒΑΝΙΛΙΑ",ingredientSku.syrVan,10,"ML");await add("ΣΙΡΟΠΙ","ΦΟΥΝΤΟΥΚΙ",ingredientSku.syrHaz,10,"ML");await add("ΓΑΛΑ","ΧΩΡΙΣ ΛΑΚΤΟΖΗ",ingredientSku.milkLf,80,"ML");await add("ΓΑΛΑ","ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ",ingredientSku.almond,80,"ML");await add("ΓΑΛΑ","ΓΑΛΑ ΒΡΩΜΗΣ",ingredientSku.oat,80,"ML");await add("ΓΑΛΑ","ΓΑΛΑ ΣΟΓΙΑΣ",ingredientSku.soy,80,"ML");await add("EXTRA","EXTRA ΔΟΣΗ",ingredientSku.beans,9,"GR");await add("EXTRA","DECAF",ingredientSku.decaf,9,"GR");await add("EXTRA","ΚΑΝΕΛΑ",ingredientSku.cinnamon,1,"GR");await add("EXTRA","ΣΑΝΤΙΓΙ",ingredientSku.whip,20,"GR");}

export async function ensureKatPreparationDefaults(){
 await tables();
 const [store]=await prisma.$queryRaw`SELECT "id","companyId" FROM "Store" WHERE "active"=true AND (UPPER("name") LIKE '%ΚΑΤ%' OR UPPER("name") LIKE '%KAT%') ORDER BY "createdAt" LIMIT 1`;
 if(!store)return {ok:false};
 const companyId=store.companyId;
 const groups=[];for(const def of GROUPS)groups.push(await ensureGroup(companyId,def));
 const ingredientRows=await prisma.$queryRaw`SELECT "id","sku" FROM "Product" WHERE "companyId"=${companyId} AND "sku" LIKE 'MWS-PREP-%'`;
 const ingredients=new Map(ingredientRows.map(x=>[x.sku,x]));
 await modifierConsumption(companyId,groups,ingredients);
 const products=await prisma.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "companyId"=${companyId} AND "sku" LIKE 'MWS-KAT-BEV-%' AND "active"=true`;
 for(const product of products){
  await prisma.$executeRaw`INSERT INTO "PreparationProductSettings" ("companyId","productId","preparationEnabled","environmentalFee","productionStation","autoPrint","recipeProfileVersion") VALUES (${companyId},${product.id},true,0.05,'ΠΑΡΑΓΩΓΗ',true,0) ON CONFLICT ("companyId","productId") DO UPDATE SET "preparationEnabled"=true,"productionStation"='ΠΑΡΑΓΩΓΗ',"autoPrint"=true,"updatedAt"=NOW()`;
  const n=String(product.name||"").toLocaleUpperCase("el-GR"),familyGroups=/ΣΟΚΟΛΑΤ/.test(n)?["ΖΑΧΑΡΗ","ΠΑΓΟΣ","ΓΑΛΑ","EXTRA"]:/ΤΣΑΙ|ΧΑΜΟΜΗΛ/.test(n)?["ΖΑΧΑΡΗ","ΠΑΓΟΣ","ΓΑΛΑ","EXTRA"]:["ΖΑΧΑΡΗ","ΠΑΓΟΣ","ΧΤΥΠΗΜΑ","ΣΙΡΟΠΙ","ΓΑΛΑ","EXTRA"];
  let seq=0;for(const groupName of familyGroups){const g=groups.find(x=>x.name===groupName);if(!g)continue;await prisma.$executeRaw`INSERT INTO "PreparationProductModifierGroup" ("id","companyId","productId","groupId","required","minSelections","maxSelections","sequence") VALUES (${uid()},${companyId},${product.id},${g.id},false,0,1,${seq++}) ON CONFLICT ("companyId","productId","groupId") DO UPDATE SET "sequence"=EXCLUDED."sequence`;} 
  const [settings]=await prisma.$queryRaw`SELECT "recipeProfileVersion" FROM "PreparationProductSettings" WHERE "companyId"=${companyId} AND "productId"=${product.id} LIMIT 1`;
  const profileVersion=Number(settings?.recipeProfileVersion||0);
  if(profileVersion<RECIPE_PROFILE_VERSION){
   await prisma.$executeRaw`DELETE FROM "PreparationRecipeLine" WHERE "companyId"=${companyId} AND "productId"=${product.id}`;
   for(const [sku,quantity,unit] of recipeFor(product.name)){const ing=ingredients.get(sku);if(ing)await prisma.$executeRaw`INSERT INTO "PreparationRecipeLine" ("id","companyId","productId","ingredientProductId","quantity","unit","automatic") VALUES (${uid()},${companyId},${product.id},${ing.id},${quantity},${unit},true)`;}
   await prisma.$executeRaw`UPDATE "PreparationProductSettings" SET "recipeProfileVersion"=${RECIPE_PROFILE_VERSION},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "productId"=${product.id}`;
  }
 }
 return {ok:true,productCount:products.length,groupCount:groups.length,recipeProfileVersion:RECIPE_PROFILE_VERSION};
}
