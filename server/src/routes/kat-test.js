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

// Κρατάμε τα παλιά IDs μόνο για να μη χαθεί κανένα υπάρχον δεδομένο.
// Από εδώ και πέρα υπάρχει μόνο το μόνιμο TEST περιβάλλον.
const TEST_COMPANY_ID="kat-test-company";
const TEST_STORE_ID="kat-test-store";

const bootstrapSchema=z.object({
  ownerEmail:z.string().trim().email(),
  ownerPassword:z.string().min(8).max(100),
  adminEmail:z.string().trim().email(),
  adminPassword:z.string().min(8).max(100),
  sellerPin:z.string().regex(/^\d{4,8}$/),
  ownerName:z.string().trim().min(2).max(160).default("TEST Owner"),
  adminName:z.string().trim().min(2).max(160).default("TEST Admin"),
  sellerName:z.string().trim().min(2).max(160).default("TEST Πωλητής")
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
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TestStateSnapshot" (
    "id" TEXT PRIMARY KEY,"layoutVersion" INTEGER NOT NULL DEFAULT 0,"layoutJson" JSONB,
    "productCount" INTEGER NOT NULL DEFAULT 0,"snapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdBy" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TestStateSnapshot_created_idx" ON "TestStateSnapshot" ("createdAt" DESC)`);
}

async function ensureModules(tx){
  const moduleKeys=["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT","INVENTORY","POS","SALES_ANALYTICS","SHIFT_HANDOVER"];
  for(const moduleKey of moduleKeys){
    await tx.companyModule.upsert({
      where:{companyId_moduleKey:{companyId:TEST_COMPANY_ID,moduleKey}},
      update:{active:true,notes:"TEST - μόνιμο δοκιμαστικό περιβάλλον"},
      create:{companyId:TEST_COMPANY_ID,moduleKey,active:true,notes:"TEST - μόνιμο δοκιμαστικό περιβάλλον"}
    });
  }
}

async function saveCurrentTestState(tx,actorId){
  const layoutRows=await tx.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 AND "companyId"=$2 LIMIT 1`,TEST_STORE_ID,TEST_COMPANY_ID).catch(()=>[]);
  const categoryRows=await tx.$queryRawUnsafe(`SELECT "id","name","sortOrder","active" FROM "ProductCategory" WHERE "companyId"=$1 ORDER BY "sortOrder","name"`,TEST_COMPANY_ID).catch(()=>[]);
  const productRows=await tx.$queryRawUnsafe(`SELECT p."id",p."categoryId",p."sku",p."name",p."unit",p."vatRate",p."salePrice" AS "baseSalePrice",p."costPrice",p."trackStock",p."active",sp."salePrice" AS "storeSalePrice",sp."currentStock",sp."minStock",sp."active" AS "storeActive" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=$1 WHERE p."companyId"=$2 ORDER BY p."name"`,TEST_STORE_ID,TEST_COMPANY_ID).catch(()=>[]);
  const productIds=productRows.map(row=>row.id);
  const barcodeRows=productIds.length?await tx.$queryRawUnsafe(`SELECT "productId","barcode" FROM "ProductBarcode" WHERE "productId"=ANY($1::text[]) ORDER BY "productId","barcode"`,productIds).catch(()=>[]):[];
  const snapshot={layout:layoutRows[0]||null,categories:categoryRows,products:productRows,barcodes:barcodeRows};
  await tx.$executeRawUnsafe(`INSERT INTO "TestStateSnapshot" ("id","layoutVersion","layoutJson","productCount","snapshotJson","createdBy") VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6)`,crypto.randomUUID(),Number(layoutRows[0]?.version||0),JSON.stringify(layoutRows[0]?.layoutJson||null),productRows.length,JSON.stringify(snapshot),actorId||"SUPER_ADMIN");
  return {saved:true,layoutVersion:Number(layoutRows[0]?.version||0),productCount:productRows.length};
}

router.get("/status",async(req,res,next)=>{try{
  await ensureSupportTables();
  const [company,snapshotRows]=await Promise.all([
    prisma.company.findUnique({where:{id:TEST_COMPANY_ID},include:{stores:true,users:{select:{id:true,email:true,fullName:true,role:true}},modules:true}}),
    prisma.$queryRawUnsafe(`SELECT "layoutVersion","productCount","createdAt" FROM "TestStateSnapshot" ORDER BY "createdAt" DESC LIMIT 1`).catch(()=>[])
  ]);
  res.json({
    ready:Boolean(company),persistent:true,testSnapshot:snapshotRows[0]||null,
    company:company?{
      id:company.id,name:company.name,active:company.active,plan:company.plan,
      stores:company.stores.map(store=>({id:store.id,name:store.name,active:store.active})),
      users:company.users,
      modules:company.modules.filter(module=>module.active).map(module=>module.moduleKey)
    }:null
  });
}catch(error){next(error)}});

router.post("/save-state",async(req,res,next)=>{try{
  await ensureSupportTables();
  const store=await prisma.store.findFirst({where:{id:TEST_STORE_ID,companyId:TEST_COMPANY_ID,active:true}});
  if(!store)return res.status(404).json({error:"Δεν έχει δημιουργηθεί ακόμη το TEST."});
  const saved=await prisma.$transaction(tx=>saveCurrentTestState(tx,req.user?.id));
  res.json({ok:true,...saved,note:"Η τρέχουσα κατάσταση του TEST αποθηκεύτηκε μόνιμα στον server."});
}catch(error){next(error)}});

// Παλιό endpoint μόνο για συμβατότητα. Δεν υπάρχει πραγματικό ΚΑΤ ως πηγή.
router.post("/sync-from-kat",async(req,res)=>{
  res.status(410).json({error:"Η λειτουργία αφαιρέθηκε. Από εδώ και πέρα δουλεύουμε μόνο πάνω στο μόνιμο TEST."});
});

router.post("/bootstrap",async(req,res,next)=>{try{
  const body=bootstrapSchema.parse(req.body||{});
  if(body.ownerEmail.toLowerCase()===body.adminEmail.toLowerCase())return res.status(400).json({error:"Owner και Admin πρέπει να έχουν διαφορετικό email."});
  const existingEmails=await prisma.user.findMany({where:{email:{in:[body.ownerEmail,body.adminEmail]}}});
  const foreign=existingEmails.find(user=>user.companyId!==TEST_COMPANY_ID);
  if(foreign)return res.status(409).json({error:`Το email ${foreign.email} χρησιμοποιείται ήδη σε άλλο πελάτη.`});
  await ensureSupportTables();
  const ownerPasswordHash=await bcrypt.hash(body.ownerPassword,12),adminPasswordHash=await bcrypt.hash(body.adminPassword,12),sellerPinHash=await bcrypt.hash(body.sellerPin,12);
  const result=await prisma.$transaction(async tx=>{
    const company=await tx.company.upsert({
      where:{id:TEST_COMPANY_ID},
      update:{name:"TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",commercialNotes:"Μόνιμο δοκιμαστικό περιβάλλον MyWorkStation. Δεν αντιστοιχεί σε πραγματικό κατάστημα."},
      create:{id:TEST_COMPANY_ID,name:"TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",subscriptionStartsAt:new Date(),commercialNotes:"Μόνιμο δοκιμαστικό περιβάλλον MyWorkStation. Δεν αντιστοιχεί σε πραγματικό κατάστημα."}
    });
    const store=await tx.store.upsert({
      where:{id:TEST_STORE_ID},
      update:{name:"TEST",companyId:company.id,active:true,cashCloseEmailEnabled:false},
      create:{id:TEST_STORE_ID,name:"TEST",companyId:company.id,city:"Αθήνα",active:true,cashCloseEmailEnabled:false}
    });
    await ensureModules(tx);
    for(const [code,name,startTime,endTime] of [["MORNING","Πρωί","07:00","15:00"],["AFTERNOON","Απόγευμα","15:00","23:00"],["NIGHT","Βράδυ","23:00","07:00"]]){
      await tx.shiftType.upsert({where:{storeId_code:{storeId:store.id,code}},update:{name,startTime,endTime,requiredCount:1,active:true},create:{storeId:store.id,code,name,startTime,endTime,requiredCount:1,active:true}});
    }
    const owner=await tx.user.upsert({where:{email:body.ownerEmail},update:{passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id,sessionVersion:{increment:1}},create:{email:body.ownerEmail,passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id}});
    const admin=await tx.user.upsert({where:{email:body.adminEmail},update:{passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id,sessionVersion:{increment:1}},create:{email:body.adminEmail,passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id}});
    let seller=await tx.employee.findFirst({where:{storeId:store.id,fullName:body.sellerName}});
    if(!seller)seller=await tx.employee.create({data:{fullName:body.sellerName,position:"Πωλητής",storeId:store.id,maxDaysPerWeek:6,allowSixthDay:true,maxHoursPerWeek:48}});
    await tx.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","pinHash","active","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'EMPLOYEE',$6,TRUE,$7,NOW(),NOW()) ON CONFLICT ("storeId","employeeId") DO UPDATE SET "displayName"=EXCLUDED."displayName","role"='EMPLOYEE',"pinHash"=EXCLUDED."pinHash","active"=TRUE,"updatedAt"=NOW()`,crypto.randomUUID(),company.id,store.id,seller.id,body.sellerName,sellerPinHash,req.user?.id||"SUPER_ADMIN");
    return {company,store,owner,admin,seller};
  });
  res.status(201).json({
    ready:true,persistent:true,isolated:true,fiscalConnection:false,
    company:{id:result.company.id,name:result.company.name},store:{id:result.store.id,name:result.store.name},
    roles:{superAdmin:"Χρησιμοποιεί τον υπάρχοντα Platform Super Admin λογαριασμό.",owner:{email:result.owner.email,fullName:result.owner.fullName},admin:{email:result.admin.email,fullName:result.admin.fullName},seller:{employeeId:result.seller.id,fullName:result.seller.fullName,login:"PIN"}},
    note:"Το TEST είναι το μοναδικό μόνιμο δοκιμαστικό περιβάλλον. Η επαναδημιουργία χρηστών δεν διαγράφει προϊόντα, POS layout ή υπάρχουσα εμπορική κατάσταση."
  });
}catch(error){next(error)}});

export default router;
