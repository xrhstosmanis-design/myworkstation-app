import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const KAT_TEST_COMPANY_ID="kat-test-company";
const KAT_TEST_STORE_ID="kat-test-store";
const LEGACY_SOURCE_COMPANY_ID="pilot-company";
const LEGACY_SOURCE_STORE_ID="kat-store";

const bootstrapSchema=z.object({
  ownerEmail:z.string().trim().email(),
  ownerPassword:z.string().min(8).max(100),
  adminEmail:z.string().trim().email(),
  adminPassword:z.string().min(8).max(100),
  sellerPin:z.string().regex(/^\d{4,8}$/),
  ownerName:z.string().trim().min(2).max(160).default("KAT TEST Owner"),
  adminName:z.string().trim().min(2).max(160).default("KAT TEST Admin"),
  sellerName:z.string().trim().min(2).max(160).default("KAT TEST Πωλητής")
});

async function ensureSupportTables(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorCredential" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,"role" TEXT NOT NULL DEFAULT 'EMPLOYEE',"pinHash" TEXT,"cardCodeHash" TEXT,
    "cardCodeLast4" TEXT,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"lastLoginAt" TIMESTAMPTZ,
    UNIQUE ("storeId","employeeId")
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreOperatorCredential_store_active_idx" ON "StoreOperatorCredential" ("storeId","active")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "KatTestGoldenSnapshot" (
    "id" TEXT PRIMARY KEY,"sourceCompanyId" TEXT NOT NULL,"sourceStoreId" TEXT NOT NULL,"sourceStoreName" TEXT NOT NULL,
    "layoutVersion" INTEGER NOT NULL DEFAULT 0,"layoutJson" JSONB,"productCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KatTestGoldenSnapshot_created_idx" ON "KatTestGoldenSnapshot" ("createdAt" DESC)`);
}

async function resolveSourceStore(tx=prisma){
  const legacy=await tx.store.findFirst({where:{id:LEGACY_SOURCE_STORE_ID,active:true},include:{company:true}}).catch(()=>null);
  if(legacy&&legacy.companyId!==KAT_TEST_COMPANY_ID)return legacy;
  const rows=await tx.$queryRawUnsafe(`
    SELECT s."id",s."name",s."companyId",c."name" AS "companyName"
    FROM "Store" s JOIN "Company" c ON c."id"=s."companyId"
    WHERE s."active"=TRUE AND c."active"=TRUE AND s."id"<>$1 AND c."id"<>$2
      AND (UPPER(s."name") LIKE '%ΚΑΤ%' OR UPPER(c."name") LIKE '%ΚΑΤ%' OR UPPER(s."name") LIKE '%KAT%' OR UPPER(c."name") LIKE '%KAT%')
    ORDER BY CASE WHEN s."id"=$3 THEN 0 ELSE 1 END,s."createdAt" ASC
    LIMIT 1`,KAT_TEST_STORE_ID,KAT_TEST_COMPANY_ID,LEGACY_SOURCE_STORE_ID).catch(()=>[]);
  if(!rows[0])return null;
  return {id:rows[0].id,name:rows[0].name,companyId:rows[0].companyId,company:{id:rows[0].companyId,name:rows[0].companyName}};
}

async function copyModules(tx,sourceCompanyId){
  const sourceModules=await tx.companyModule.findMany({where:{companyId:sourceCompanyId||LEGACY_SOURCE_COMPANY_ID,active:true}});
  const fallback=["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT","INVENTORY","POS"];
  const moduleKeys=[...new Set([...(sourceModules.length?sourceModules.map(row=>row.moduleKey):fallback),"INVENTORY","POS"])];
  for(const moduleKey of moduleKeys){
    await tx.companyModule.upsert({where:{companyId_moduleKey:{companyId:KAT_TEST_COMPANY_ID,moduleKey}},update:{active:true,notes:"KAT TEST - απομονωμένο δοκιμαστικό περιβάλλον"},create:{companyId:KAT_TEST_COMPANY_ID,moduleKey,active:true,notes:"KAT TEST - απομονωμένο δοκιμαστικό περιβάλλον"}});
  }
}

async function createGoldenSnapshot(tx,source,actorId,{force=false}={}){
  if(!source)return {copied:false,reason:"Δεν βρέθηκε το πραγματικό κατάστημα ΚΑΤ."};
  const existing=await tx.$queryRawUnsafe(`SELECT "id" FROM "KatTestGoldenSnapshot" ORDER BY "createdAt" DESC LIMIT 1`).catch(()=>[]);
  if(existing[0]&&!force)return {copied:false,reason:"Υπάρχει ήδη αποθηκευμένο golden snapshot."};

  const layoutRows=await tx.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 AND "companyId"=$2 LIMIT 1`,source.id,source.companyId).catch(()=>[]);
  const categoryRows=await tx.$queryRawUnsafe(`SELECT DISTINCT c."id",c."name",c."sortOrder",c."active" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" WHERE sp."storeId"=$1 AND p."companyId"=$2 AND c."id" IS NOT NULL ORDER BY c."sortOrder",c."name"`,source.id,source.companyId).catch(()=>[]);
  const productRows=await tx.$queryRawUnsafe(`SELECT p."id",p."categoryId",p."sku",p."name",p."unit",p."vatRate",p."salePrice" AS "baseSalePrice",p."costPrice",p."trackStock",p."active",sp."salePrice" AS "storeSalePrice",sp."currentStock",sp."minStock",sp."active" AS "storeActive" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=$1 AND p."companyId"=$2 ORDER BY p."name"`,source.id,source.companyId).catch(()=>[]);
  const productIds=productRows.map(row=>row.id);
  const barcodeRows=productIds.length?await tx.$queryRawUnsafe(`SELECT "productId","barcode" FROM "ProductBarcode" WHERE "productId"=ANY($1::text[]) ORDER BY "productId","barcode"`,productIds).catch(()=>[]):[];
  const snapshot={source:{companyId:source.companyId,companyName:source.company?.name||source.companyName||"",storeId:source.id,storeName:source.name},layout:layoutRows[0]||null,categories:categoryRows,products:productRows,barcodes:barcodeRows};
  await tx.$executeRawUnsafe(`INSERT INTO "KatTestGoldenSnapshot" ("id","sourceCompanyId","sourceStoreId","sourceStoreName","layoutVersion","layoutJson","productCount","snapshotJson","createdBy") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)`,crypto.randomUUID(),source.companyId,source.id,source.name,Number(layoutRows[0]?.version||0),JSON.stringify(layoutRows[0]?.layoutJson||null),productRows.length,JSON.stringify(snapshot),actorId||"SUPER_ADMIN");
  return {copied:true,snapshot};
}

async function restoreGoldenToKatTest(tx,actorId){
  const snapshots=await tx.$queryRawUnsafe(`SELECT * FROM "KatTestGoldenSnapshot" ORDER BY "createdAt" DESC LIMIT 1`);
  const row=snapshots[0];
  if(!row)return {restored:false,reason:"Δεν υπάρχει golden snapshot."};
  const snap=row.snapshotJson||{};
  const categories=Array.isArray(snap.categories)?snap.categories:[];
  const products=Array.isArray(snap.products)?snap.products:[];
  const barcodes=Array.isArray(snap.barcodes)?snap.barcodes:[];
  const categoryMap=new Map(),productMap=new Map();

  await tx.$executeRawUnsafe(`DELETE FROM "StoreProduct" WHERE "storeId"=$1`,KAT_TEST_STORE_ID);
  const testProducts=await tx.$queryRawUnsafe(`SELECT "id" FROM "Product" WHERE "companyId"=$1`,KAT_TEST_COMPANY_ID);
  const testProductIds=testProducts.map(x=>x.id);
  if(testProductIds.length)await tx.$executeRawUnsafe(`DELETE FROM "ProductBarcode" WHERE "productId"=ANY($1::text[])`,testProductIds);
  await tx.$executeRawUnsafe(`DELETE FROM "Product" WHERE "companyId"=$1`,KAT_TEST_COMPANY_ID);
  await tx.$executeRawUnsafe(`DELETE FROM "ProductCategory" WHERE "companyId"=$1`,KAT_TEST_COMPANY_ID);

  for(const category of categories){
    const newId=crypto.randomUUID();categoryMap.set(category.id,newId);
    await tx.$executeRawUnsafe(`INSERT INTO "ProductCategory" ("id","companyId","name","sortOrder","active") VALUES ($1,$2,$3,$4,$5)`,newId,KAT_TEST_COMPANY_ID,category.name,Number(category.sortOrder||0),category.active!==false);
  }
  for(const product of products){
    const newId=crypto.randomUUID();productMap.set(product.id,newId);
    await tx.$executeRawUnsafe(`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,newId,KAT_TEST_COMPANY_ID,categoryMap.get(product.categoryId)||null,product.sku||null,product.name,product.unit||"PIECE",Number(product.vatRate||24),Number(product.baseSalePrice||0),product.costPrice==null?null:Number(product.costPrice),product.trackStock!==false,product.active!==false);
    await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","minStock","active") VALUES ($1,$2,$3,$4,$5,$6,$7)`,crypto.randomUUID(),KAT_TEST_STORE_ID,newId,product.storeSalePrice==null?null:Number(product.storeSalePrice),Number(product.currentStock||0),product.minStock==null?null:Number(product.minStock),product.storeActive!==false);
  }
  for(const barcode of barcodes){const productId=productMap.get(barcode.productId);if(productId)await tx.$executeRawUnsafe(`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES ($1,$2,$3)`,crypto.randomUUID(),productId,barcode.barcode).catch(()=>{});}
  if(row.layoutJson){await tx.$executeRawUnsafe(`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES ($1,$2,$3::jsonb,$4,$5,NOW()) ON CONFLICT ("storeId") DO UPDATE SET "companyId"=EXCLUDED."companyId","layoutJson"=EXCLUDED."layoutJson","version"=EXCLUDED."version","publishedBy"=EXCLUDED."publishedBy","publishedAt"=NOW()`,KAT_TEST_STORE_ID,KAT_TEST_COMPANY_ID,JSON.stringify(row.layoutJson),Number(row.layoutVersion||1),actorId||"SUPER_ADMIN");}
  return {restored:true,sourceStoreId:row.sourceStoreId,sourceStoreName:row.sourceStoreName,layoutVersion:Number(row.layoutVersion||0),productCount:Number(row.productCount||0)};
}

router.get("/status",async(req,res,next)=>{try{
  await ensureSupportTables();
  const [company,snapshotRows]=await Promise.all([prisma.company.findUnique({where:{id:KAT_TEST_COMPANY_ID},include:{stores:true,users:{select:{id:true,email:true,fullName:true,role:true}},modules:true}}),prisma.$queryRawUnsafe(`SELECT "sourceStoreId","sourceStoreName","layoutVersion","productCount","createdAt" FROM "KatTestGoldenSnapshot" ORDER BY "createdAt" DESC LIMIT 1`).catch(()=>[])]);
  res.json({ready:Boolean(company),goldenSnapshot:snapshotRows[0]||null,company:company?{id:company.id,name:company.name,active:company.active,plan:company.plan,stores:company.stores.map(store=>({id:store.id,name:store.name,active:store.active})),users:company.users,modules:company.modules.filter(module=>module.active).map(module=>module.moduleKey)}:null});
}catch(error){next(error)}});

router.post("/sync-from-kat",async(req,res,next)=>{try{
  await ensureSupportTables();
  const source=await resolveSourceStore();
  if(!source)return res.status(404).json({error:"Δεν βρέθηκε το πραγματικό κατάστημα ΚΑΤ για συγχρονισμό."});
  const result=await prisma.$transaction(async tx=>{await createGoldenSnapshot(tx,source,req.user?.id,{force:true});await copyModules(tx,source.companyId);return restoreGoldenToKatTest(tx,req.user?.id)});
  res.json({ok:true,...result,note:"Το KAT TEST αποθηκεύτηκε server-side ως golden snapshot. Δεν εξαρτάται από browser ή ανοιχτή σελίδα."});
}catch(error){next(error)}});

router.post("/bootstrap",async(req,res,next)=>{try{
  const body=bootstrapSchema.parse(req.body||{});
  if(body.ownerEmail.toLowerCase()===body.adminEmail.toLowerCase())return res.status(400).json({error:"Owner και Admin πρέπει να έχουν διαφορετικό email."});
  const existingEmails=await prisma.user.findMany({where:{email:{in:[body.ownerEmail,body.adminEmail]}}});
  const foreign=existingEmails.find(user=>user.companyId!==KAT_TEST_COMPANY_ID);if(foreign)return res.status(409).json({error:`Το email ${foreign.email} χρησιμοποιείται ήδη σε άλλο πελάτη.`});
  await ensureSupportTables();
  const source=await resolveSourceStore();
  const ownerPasswordHash=await bcrypt.hash(body.ownerPassword,12),adminPasswordHash=await bcrypt.hash(body.adminPassword,12),sellerPinHash=await bcrypt.hash(body.sellerPin,12);
  const result=await prisma.$transaction(async tx=>{
    const company=await tx.company.upsert({where:{id:KAT_TEST_COMPANY_ID},update:{name:"KAT TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",commercialNotes:"Απομονωμένο ψηφιακό δίδυμο ΚΑΤ για δοκιμές πριν το πραγματικό κατάστημα."},create:{id:KAT_TEST_COMPANY_ID,name:"KAT TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",subscriptionStartsAt:new Date(),commercialNotes:"Απομονωμένο ψηφιακό δίδυμο ΚΑΤ για δοκιμές πριν το πραγματικό κατάστημα."}});
    const store=await tx.store.upsert({where:{id:KAT_TEST_STORE_ID},update:{name:"KAT TEST",companyId:company.id,active:true,cashCloseEmailEnabled:false},create:{id:KAT_TEST_STORE_ID,name:"KAT TEST",companyId:company.id,city:"Αθήνα",active:true,cashCloseEmailEnabled:false}});
    await copyModules(tx,source?.companyId);
    for(const [code,name,startTime,endTime] of [["MORNING","Πρωί","07:00","15:00"],["AFTERNOON","Απόγευμα","15:00","23:00"],["NIGHT","Βράδυ","23:00","07:00"]])await tx.shiftType.upsert({where:{storeId_code:{storeId:store.id,code}},update:{name,startTime,endTime,requiredCount:1,active:true},create:{storeId:store.id,code,name,startTime,endTime,requiredCount:1,active:true}});
    const owner=await tx.user.upsert({where:{email:body.ownerEmail},update:{passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id,sessionVersion:{increment:1}},create:{email:body.ownerEmail,passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id}});
    const admin=await tx.user.upsert({where:{email:body.adminEmail},update:{passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id,sessionVersion:{increment:1}},create:{email:body.adminEmail,passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id}});
    let seller=await tx.employee.findFirst({where:{storeId:store.id,fullName:body.sellerName}});if(!seller)seller=await tx.employee.create({data:{fullName:body.sellerName,position:"Πωλητής",storeId:store.id,maxDaysPerWeek:6,allowSixthDay:true,maxHoursPerWeek:48}});
    await tx.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","pinHash","active","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'EMPLOYEE',$6,TRUE,$7,NOW(),NOW()) ON CONFLICT ("storeId","employeeId") DO UPDATE SET "displayName"=EXCLUDED."displayName","role"='EMPLOYEE',"pinHash"=EXCLUDED."pinHash","active"=TRUE,"updatedAt"=NOW()`,crypto.randomUUID(),company.id,store.id,seller.id,body.sellerName,sellerPinHash,req.user?.id||"SUPER_ADMIN");
    const snapshots=await tx.$queryRawUnsafe(`SELECT "id" FROM "KatTestGoldenSnapshot" ORDER BY "createdAt" DESC LIMIT 1`);
    if(!snapshots[0]&&source)await createGoldenSnapshot(tx,source,req.user?.id,{force:false});
    const restored=await restoreGoldenToKatTest(tx,req.user?.id);
    return {company,store,owner,admin,seller,restored};
  });
  res.status(201).json({ready:true,isolated:true,fiscalConnection:false,company:{id:result.company.id,name:result.company.name},store:{id:result.store.id,name:result.store.name},roles:{superAdmin:"Χρησιμοποιεί τον υπάρχοντα Platform Super Admin λογαριασμό.",owner:{email:result.owner.email,fullName:result.owner.fullName},admin:{email:result.admin.email,fullName:result.admin.fullName},seller:{employeeId:result.seller.id,fullName:result.seller.fullName,login:"PIN"}},posLayoutCopied:result.restored.restored,goldenSnapshot:result.restored,note:"Το KAT TEST αποθηκεύεται στη βάση ως golden snapshot και δεν χάνεται όταν κλείνει η σελίδα."});
}catch(error){next(error)}});

export default router;
