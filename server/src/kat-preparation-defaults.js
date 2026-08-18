import crypto from "crypto";
import {prisma} from "./prisma.js";

const uid=()=>crypto.randomUUID();
const RECIPE_PROFILE_VERSION=4;
const GROUPS=[
 {name:"ΖΑΧΑΡΗ",items:[[10,"ΣΚΕΤΟΣ",0],[20,"ΜΕΤΡΙΟΣ",0],[30,"ΓΛΥΚΟΣ",0],[40,"ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",0],[50,"ΣΤΕΒΙΑ",0],[60,"ΖΑΧΑΡΙΝΗ",0]]},
 {name:"ΠΑΓΟΣ",items:[[10,"ΧΩΡΙΣ ΠΑΓΟ",0],[20,"ΛΙΓΟΣ ΠΑΓΟΣ",0],[30,"ΚΑΝΟΝΙΚΟΣ ΠΑΓΟΣ",0],[40,"ΠΟΛΥΣ ΠΑΓΟΣ",0]]},
 {name:"ΧΤΥΠΗΜΑ",items:[[10,"ΧΤΥΠΗΤΟΣ",0],[20,"ΑΧΤΥΠΗΤΟΣ",0]]},
 {name:"ΣΙΡΟΠΙ",items:[[10,"ΣΟΚΟΛΑΤΑ",.50],[20,"ΚΑΡΑΜΕΛΑ",.50],[30,"ΒΑΝΙΛΙΑ",.50],[40,"ΦΟΥΝΤΟΥΚΙ",.50]]},
 {name:"ΓΑΛΑ",items:[[10,"ΦΡΕΣΚΟ ΓΑΛΑ",0],[20,"ΓΑΛΑ ΕΒΑΠΟΡΕ",0],[30,"ΧΩΡΙΣ ΛΑΚΤΟΖΗ",.50],[40,"ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ",.50],[50,"ΓΑΛΑ ΒΡΩΜΗΣ",.50],[60,"ΓΑΛΑ ΣΟΓΙΑΣ",.50]]},
 {name:"EXTRA",items:[[10,"EXTRA ΔΟΣΗ",.60],[20,"DECAF",.20],[30,"ΚΑΝΕΛΑ",0],[40,"ΣΑΝΤΙΓΙ",.50]]}
];
const ingredientSku={
 beans:"MWS-PREP-COFFEE-BEANS",decaf:"MWS-PREP-DECAF",instant:"MWS-PREP-INSTANT-COFFEE",greek:"MWS-PREP-GREEK-COFFEE",filter:"MWS-PREP-FILTER-COFFEE",water:"MWS-PREP-WATER",
 sugar:"MWS-PREP-SUGAR-WHITE",brown:"MWS-PREP-SUGAR-BROWN",sweetener:"MWS-PREP-SWEETENER",ice:"MWS-PREP-ICE",
 milk:"MWS-PREP-MILK",milkEvap:"MWS-PREP-MILK-EVAP",milkLf:"MWS-PREP-MILK-LF",almond:"MWS-PREP-MILK-ALMOND",oat:"MWS-PREP-MILK-OAT",soy:"MWS-PREP-MILK-SOY",
 syrChoc:"MWS-PREP-SYRUP-CHOC",syrCar:"MWS-PREP-SYRUP-CARAMEL",syrVan:"MWS-PREP-SYRUP-VANILLA",syrHaz:"MWS-PREP-SYRUP-HAZELNUT",
 cupS:"MWS-PREP-CUP-SMALL",cupL:"MWS-PREP-CUP-LARGE",lidS:"MWS-PREP-LID-SMALL",lidL:"MWS-PREP-LID-LARGE",straw:"MWS-PREP-STRAW",
 cinnamon:"MWS-PREP-CINNAMON",choc:"MWS-PREP-CHOC-MIX",whiteChoc:"MWS-PREP-WHITE-CHOC-MIX",cocoa:"MWS-PREP-COCOA",whip:"MWS-PREP-WHIP"
};

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
 const items=[];
 for(const [sequence,description,price] of def.items){
  let [m]=await prisma.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${companyId} AND "groupId"=${g.id} AND LOWER("description")=LOWER(${description}) LIMIT 1`;
  if(!m){m={id:uid()};await prisma.$executeRaw`INSERT INTO "ManagementModifier" ("id","companyId","groupId","sequence","description","price","active") VALUES (${m.id},${companyId},${g.id},${sequence},${description},${price},true)`}
  else await prisma.$executeRaw`UPDATE "ManagementModifier" SET "sequence"=${sequence},"price"=${price},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${m.id}`;
  items.push({...m,description});
 }
 const wanted=def.items.map(x=>x[1]);
 await prisma.$executeRaw`UPDATE "ManagementModifier" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "groupId"=${g.id} AND NOT ("description"=ANY(${wanted}::text[]))`;
 return {id:g.id,name:def.name,items};
}

const withColdPack=rows=>[...rows,[ingredientSku.ice,100,"GR"],[ingredientSku.cupL,1,"PCS"],[ingredientSku.lidL,1,"PCS"],[ingredientSku.straw,1,"PCS"]];
const withHotPack=(rows,small=false)=>[...rows,[small?ingredientSku.cupS:ingredientSku.cupL,1,"PCS"],[small?ingredientSku.lidS:ingredientSku.lidL,1,"PCS"]];

function recipeFor(name){
 const n=String(name||"").toLocaleUpperCase("el-GR");
 const decaf=/DECAF/.test(n),bean=decaf?ingredientSku.decaf:ingredientSku.beans;
 if(/FREDDO CAPPUCCINO LATTE/.test(n))return withColdPack([[bean,18,"GR"],[ingredientSku.milk,140,"ML"]]);
 if(/FREDDO CAPPUCCINO/.test(n))return withColdPack([[bean,18,"GR"],[ingredientSku.milk,70,"ML"]]);
 if(/FREDDO ESPRESSO/.test(n))return withColdPack([[bean,18,"GR"]]);
 if(/ICED LATTE/.test(n))return withColdPack([[bean,18,"GR"],[ingredientSku.milk,160,"ML"]]);
 if(/ICED AMERICANO/.test(n))return withColdPack([[bean,18,"GR"],[ingredientSku.water,100,"ML"]]);
 if(/ΦΡΑΠΕ ΜΕ ΓΑΛΑ/.test(n))return withColdPack([[ingredientSku.instant,2,"GR"],[ingredientSku.water,150,"ML"],[ingredientSku.milkEvap,30,"ML"]]);
 if(/ΦΡΑΠΕ/.test(n))return withColdPack([[ingredientSku.instant,2,"GR"],[ingredientSku.water,180,"ML"]]);
 if(/NESCAFE ΚΡΥ/.test(n))return withColdPack([[ingredientSku.instant,2,"GR"],[ingredientSku.water,180,"ML"]]);
 if(/MOCHA ΚΡΥ|ICED MOCHA/.test(n))return withColdPack([[bean,18,"GR"],[ingredientSku.choc,25,"GR"],[ingredientSku.milk,160,"ML"]]);

 if(/ESPRESSO LUNGO ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"]],true);
 if(/ESPRESSO LUNGO/.test(n))return withHotPack([[bean,9,"GR"]],true);
 if(/ESPRESSO MACCHIATO ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,25,"ML"]],true);
 if(/ESPRESSO MACCHIATO/.test(n))return withHotPack([[bean,9,"GR"],[ingredientSku.milk,17.5,"ML"]],true);
 if(/^AMERICANO ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.water,120,"ML"]]);
 if(/^AMERICANO/.test(n))return withHotPack([[bean,9,"GR"],[ingredientSku.water,100,"ML"]]);
 if(/CAPPUCCINO LATTE ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,180,"ML"]]);
 if(/CAPPUCCINO LATTE/.test(n))return withHotPack([[bean,9,"GR"],[ingredientSku.milk,170,"ML"]]);
 if(/CAPPUCCINO ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,120,"ML"]]);
 if(/CAPPUCCINO/.test(n))return withHotPack([[bean,9,"GR"],[ingredientSku.milk,100,"ML"]]);
 if(/FLAT WHITE/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,120,"ML"]]);
 if(/CORTADO/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,60,"ML"]]);
 if(/MOCHA ΖΕΣΤ/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.choc,25,"GR"],[ingredientSku.milk,160,"ML"]]);
 if(/ESPRESSO ΔΙΠΛ/.test(n))return withHotPack([[bean,18,"GR"]],true);
 if(/ESPRESSO ΜΟΝ|ESPRESSO DECAF|RISTRETTO/.test(n))return withHotPack([[bean,9,"GR"]],true);
 if(/CAFFE LATTE|LATTE DECAF/.test(n))return withHotPack([[bean,18,"GR"],[ingredientSku.milk,180,"ML"]]);

 if(/ΕΛΛΗΝΙΚΟΣ ΔΙΠΛ/.test(n))return withHotPack([[ingredientSku.greek,14,"GR"],[ingredientSku.water,140,"ML"]],true);
 if(/ΕΛΛΗΝΙΚΟΣ/.test(n))return withHotPack([[ingredientSku.greek,7,"GR"],[ingredientSku.water,70,"ML"]],true);
 if(/NESCAFE ΖΕΣΤ/.test(n))return withHotPack([[ingredientSku.instant,2,"GR"],[ingredientSku.water,200,"ML"]]);
 if(/ΦΙΛΤΡΟΥ ΜΕΓΑΛ/.test(n))return withHotPack([[ingredientSku.filter,18,"GR"],[ingredientSku.water,300,"ML"]]);
 if(/ΦΙΛΤΡΟΥ/.test(n))return withHotPack([[ingredientSku.filter,12,"GR"],[ingredientSku.water,200,"ML"]]);

 const cold=/ΚΡΥ|COLD|ICED/.test(n),white=/ΛΕΥΚ/.test(n),mix=white?ingredientSku.whiteChoc:ingredientSku.choc;
 if(/ΣΟΚΟΛΑΤΑ ΦΟΥΝΤΟΥΚΙ/.test(n))return cold?withColdPack([[mix,35,"GR"],[ingredientSku.milk,220,"ML"],[ingredientSku.syrHaz,15,"ML"]]):withHotPack([[mix,30,"GR"],[ingredientSku.milk,200,"ML"],[ingredientSku.syrHaz,15,"ML"]]);
 if(/ΣΟΚΟΛΑΤΑ ΚΑΡΑΜΕΛΑ/.test(n))return cold?withColdPack([[mix,35,"GR"],[ingredientSku.milk,220,"ML"],[ingredientSku.syrCar,15,"ML"]]):withHotPack([[mix,30,"GR"],[ingredientSku.milk,200,"ML"],[ingredientSku.syrCar,15,"ML"]]);
 if(/ΣΟΚΟΛΑΤΑ/.test(n))return cold?withColdPack([[mix,35,"GR"],[ingredientSku.milk,220,"ML"]]):withHotPack([[mix,30,"GR"],[ingredientSku.milk,200,"ML"]]);

 return [];
}

async function modifierConsumption(companyId,groups,ingredients){
 const set=async(groupName,modifierName,sku,qty,unit)=>{
  const g=groups.find(x=>x.name===groupName),m=g?.items.find(x=>x.description===modifierName),p=ingredients.get(sku);if(!m||!p)return;
  const [row]=await prisma.$queryRaw`SELECT "id" FROM "PreparationModifierConsumption" WHERE "companyId"=${companyId} AND "modifierId"=${m.id} AND "ingredientProductId"=${p.id} LIMIT 1`;
  if(row)await prisma.$executeRaw`UPDATE "PreparationModifierConsumption" SET "quantity"=${qty},"unit"=${unit},"updatedAt"=NOW() WHERE "id"=${row.id}`;
  else await prisma.$executeRaw`INSERT INTO "PreparationModifierConsumption" ("id","companyId","modifierId","ingredientProductId","quantity","unit") VALUES (${uid()},${companyId},${m.id},${p.id},${qty},${unit})`;
 };
 await set("ΖΑΧΑΡΗ","ΜΕΤΡΙΟΣ",ingredientSku.sugar,8,"GR");
 await set("ΖΑΧΑΡΗ","ΓΛΥΚΟΣ",ingredientSku.sugar,16,"GR");
 await set("ΖΑΧΑΡΗ","ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",ingredientSku.brown,8,"GR");
 await set("ΖΑΧΑΡΗ","ΣΤΕΒΙΑ",ingredientSku.sweetener,1,"PCS");
 await set("ΖΑΧΑΡΗ","ΖΑΧΑΡΙΝΗ",ingredientSku.sweetener,1,"PCS");
 await set("ΣΙΡΟΠΙ","ΣΟΚΟΛΑΤΑ",ingredientSku.syrChoc,15,"ML");
 await set("ΣΙΡΟΠΙ","ΚΑΡΑΜΕΛΑ",ingredientSku.syrCar,15,"ML");
 await set("ΣΙΡΟΠΙ","ΒΑΝΙΛΙΑ",ingredientSku.syrVan,15,"ML");
 await set("ΣΙΡΟΠΙ","ΦΟΥΝΤΟΥΚΙ",ingredientSku.syrHaz,15,"ML");
 await set("ΓΑΛΑ","ΓΑΛΑ ΕΒΑΠΟΡΕ",ingredientSku.milkEvap,80,"ML");
 await set("ΓΑΛΑ","ΧΩΡΙΣ ΛΑΚΤΟΖΗ",ingredientSku.milkLf,80,"ML");
 await set("ΓΑΛΑ","ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ",ingredientSku.almond,80,"ML");
 await set("ΓΑΛΑ","ΓΑΛΑ ΒΡΩΜΗΣ",ingredientSku.oat,80,"ML");
 await set("ΓΑΛΑ","ΓΑΛΑ ΣΟΓΙΑΣ",ingredientSku.soy,80,"ML");
 await set("EXTRA","EXTRA ΔΟΣΗ",ingredientSku.beans,9,"GR");
 await set("EXTRA","DECAF",ingredientSku.decaf,9,"GR");
 await set("EXTRA","ΚΑΝΕΛΑ",ingredientSku.cinnamon,1,"GR");
 await set("EXTRA","ΣΑΝΤΙΓΙ",ingredientSku.whip,20,"GR");
}

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
  const n=String(product.name||"").toLocaleUpperCase("el-GR");
  const cold=/FREDDO|ICED|ΦΡΑΠ|ΚΡΥ|COLD/.test(n);
  const baseFamily=/ΣΟΚΟΛΑΤ/.test(n)?["ΖΑΧΑΡΗ","ΓΑΛΑ","ΣΙΡΟΠΙ","EXTRA"]:/ΤΣΑΙ|ΧΑΜΟΜΗΛ/.test(n)?["ΖΑΧΑΡΗ","ΓΑΛΑ","EXTRA"]:["ΖΑΧΑΡΗ","ΧΤΥΠΗΜΑ","ΣΙΡΟΠΙ","ΓΑΛΑ","EXTRA"];
  const familyGroups=cold?["ΖΑΧΑΡΗ","ΠΑΓΟΣ",...baseFamily.filter(x=>x!=="ΖΑΧΑΡΗ")]:baseFamily;
  const wantedIds=familyGroups.map(groupName=>groups.find(x=>x.name===groupName)?.id).filter(Boolean);
  let seq=0;for(const groupName of familyGroups){const g=groups.find(x=>x.name===groupName);if(!g)continue;await prisma.$executeRaw`INSERT INTO "PreparationProductModifierGroup" ("id","companyId","productId","groupId","required","minSelections","maxSelections","sequence") VALUES (${uid()},${companyId},${product.id},${g.id},false,0,1,${seq++}) ON CONFLICT ("companyId","productId","groupId") DO UPDATE SET "sequence"=EXCLUDED."sequence"`;}
  if(wantedIds.length)await prisma.$executeRaw`DELETE FROM "PreparationProductModifierGroup" WHERE "companyId"=${companyId} AND "productId"=${product.id} AND NOT ("groupId"=ANY(${wantedIds}::text[]))`;
  const [settings]=await prisma.$queryRaw`SELECT "recipeProfileVersion" FROM "PreparationProductSettings" WHERE "companyId"=${companyId} AND "productId"=${product.id} LIMIT 1`;
  const profileVersion=Number(settings?.recipeProfileVersion||0);
  if(profileVersion<RECIPE_PROFILE_VERSION){
   await prisma.$executeRaw`DELETE FROM "PreparationRecipeLine" WHERE "companyId"=${companyId} AND "productId"=${product.id} AND "automatic"=true`;
   for(const [sku,quantity,unit] of recipeFor(product.name)){const ing=ingredients.get(sku);if(ing)await prisma.$executeRaw`INSERT INTO "PreparationRecipeLine" ("id","companyId","productId","ingredientProductId","quantity","unit","automatic") VALUES (${uid()},${companyId},${product.id},${ing.id},${quantity},${unit},true)`;}
   await prisma.$executeRaw`UPDATE "PreparationProductSettings" SET "recipeProfileVersion"=${RECIPE_PROFILE_VERSION},"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "productId"=${product.id}`;
  }
 }
 return {ok:true,productCount:products.length,groupCount:groups.length,recipeProfileVersion:RECIPE_PROFILE_VERSION};
}