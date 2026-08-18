import {prisma} from "./prisma.js";

const ingredientRows=[
 {sku:"PREP-COFFEE-ARABICA",name:"ΚΑΦΕΣ ESPRESSO ΚΟΚΚΟΣ",unit:"GR",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-SUGAR-WHITE",name:"ΖΑΧΑΡΗ ΛΕΥΚΗ",unit:"GR",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-SUGAR-BROWN",name:"ΖΑΧΑΡΗ ΚΑΣΤΑΝΗ",unit:"GR",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-CUP-FREDDO",name:"ΠΟΤΗΡΙ FREDDO",unit:"PCS",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-LID-FREDDO",name:"ΚΑΠΑΚΙ FREDDO",unit:"PCS",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-STRAW",name:"ΚΑΛΑΜΑΚΙ",unit:"PCS",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-MILK-FULL",name:"ΓΑΛΑ ΠΛΗΡΕΣ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-MILK-LIGHT",name:"ΓΑΛΑ LIGHT",unit:"ML",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-MILK-LACTOSEFREE",name:"ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-MILK-ALMOND",name:"ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-MILK-OAT",name:"ΓΑΛΑ ΒΡΩΜΗΣ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ ΠΑΡΑΣΚΕΥΗΣ"},
 {sku:"PREP-SYRUP-CHOC",name:"ΣΙΡΟΠΙ ΣΟΚΟΛΑΤΑ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-SYRUP-CARAMEL",name:"ΣΙΡΟΠΙ ΚΑΡΑΜΕΛΑ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-SYRUP-VANILLA",name:"ΣΙΡΟΠΙ ΒΑΝΙΛΙΑ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-SYRUP-HAZELNUT",name:"ΣΙΡΟΠΙ ΦΟΥΝΤΟΥΚΙ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-CREAM",name:"ΣΑΝΤΙΓΙ",unit:"ML",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-CINNAMON",name:"ΚΑΝΕΛΑ",unit:"GR",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-DECAF",name:"DECAF ΔΟΣΗ",unit:"GR",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"},
 {sku:"PREP-EXTRA-SHOT",name:"EXTRA SHOT ESPRESSO",unit:"GR",category:"ΠΡΟΪΟΝΤΑ MODIFIERS"}
];

export async function ensureKatPreparationSeed(){
 const store=await prisma.store.findFirst({where:{OR:[{slug:"kat-store"},{name:{contains:"ΚΑΤ",mode:"insensitive"}}]},select:{id:true,companyId:true}}).catch(()=>null);
 if(!store)return {ok:false,reason:"KAT_STORE_NOT_FOUND"};
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "KatPreparationSeedMarker" ("companyId" TEXT PRIMARY KEY,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 const marker=await prisma.$queryRaw`SELECT "companyId" FROM "KatPreparationSeedMarker" WHERE "companyId"=${store.companyId} LIMIT 1`;
 if(marker.length)return {ok:true,skipped:true};
 for(const row of ingredientRows){
  const existing=await prisma.product.findFirst({where:{companyId:store.companyId,sku:row.sku},select:{id:true}}).catch(()=>null);
  if(existing)continue;
  const product=await prisma.product.create({data:{companyId:store.companyId,sku:row.sku,name:row.name,isActive:true,salePrice:0}});
  try{await prisma.$executeRaw`UPDATE "Product" SET "categoryName"=${row.category},"unitOfMeasure"=${row.unit} WHERE "id"=${product.id}`}catch{}
  try{await prisma.storeProduct.create({data:{storeId:store.id,productId:product.id,isActive:true,currentStock:0}})}catch{}
 }
 await prisma.$executeRaw`INSERT INTO "KatPreparationSeedMarker" ("companyId") VALUES (${store.companyId}) ON CONFLICT DO NOTHING`;
 return {ok:true,count:ingredientRows.length};
}
