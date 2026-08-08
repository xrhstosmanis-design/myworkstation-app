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
const SOURCE_COMPANY_ID="pilot-company";
const SOURCE_STORE_ID="kat-store";

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

async function ensureOperatorTable(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorCredential" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "pinHash" TEXT,
    "cardCodeHash" TEXT,
    "cardCodeLast4" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lastLoginAt" TIMESTAMPTZ,
    UNIQUE ("storeId","employeeId")
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreOperatorCredential_store_active_idx" ON "StoreOperatorCredential" ("storeId","active")`);
}

async function copyModules(tx){
  const sourceModules=await tx.companyModule.findMany({where:{companyId:SOURCE_COMPANY_ID,active:true}});
  const fallback=["CORE","PERSONNEL","SHIFTS","LEAVES","CASH_CONTROL","STORE_MODE","PILOT_REPORT"];
  const moduleKeys=sourceModules.length?sourceModules.map(row=>row.moduleKey):fallback;
  for(const moduleKey of moduleKeys){
    await tx.companyModule.upsert({
      where:{companyId_moduleKey:{companyId:KAT_TEST_COMPANY_ID,moduleKey}},
      update:{active:true,notes:"KAT TEST - απομονωμένο δοκιμαστικό περιβάλλον"},
      create:{companyId:KAT_TEST_COMPANY_ID,moduleKey,active:true,notes:"KAT TEST - απομονωμένο δοκιμαστικό περιβάλλον"}
    });
  }
}

router.get("/status",async(req,res,next)=>{
  try{
    const company=await prisma.company.findUnique({
      where:{id:KAT_TEST_COMPANY_ID},
      include:{stores:true,users:{select:{id:true,email:true,fullName:true,role:true}},modules:true}
    });
    res.json({
      ready:Boolean(company),
      company:company?{
        id:company.id,name:company.name,active:company.active,plan:company.plan,
        stores:company.stores.map(store=>({id:store.id,name:store.name,active:store.active})),
        users:company.users,
        modules:company.modules.filter(module=>module.active).map(module=>module.moduleKey)
      }:null
    });
  }catch(error){next(error)}
});

router.post("/bootstrap",async(req,res,next)=>{
  try{
    const body=bootstrapSchema.parse(req.body||{});
    if(body.ownerEmail.toLowerCase()===body.adminEmail.toLowerCase()){
      return res.status(400).json({error:"Owner και Admin πρέπει να έχουν διαφορετικό email."});
    }

    const existingEmails=await prisma.user.findMany({where:{email:{in:[body.ownerEmail,body.adminEmail]}}});
    const foreign=existingEmails.find(user=>user.companyId!==KAT_TEST_COMPANY_ID);
    if(foreign)return res.status(409).json({error:`Το email ${foreign.email} χρησιμοποιείται ήδη σε άλλο πελάτη.`});

    await ensureOperatorTable();
    const ownerPasswordHash=await bcrypt.hash(body.ownerPassword,12);
    const adminPasswordHash=await bcrypt.hash(body.adminPassword,12);
    const sellerPinHash=await bcrypt.hash(body.sellerPin,12);

    const result=await prisma.$transaction(async tx=>{
      const company=await tx.company.upsert({
        where:{id:KAT_TEST_COMPANY_ID},
        update:{name:"KAT TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",commercialNotes:"Απομονωμένο ψηφιακό δίδυμο ΚΑΤ για δοκιμές πριν το πραγματικό κατάστημα."},
        create:{id:KAT_TEST_COMPANY_ID,name:"KAT TEST",active:true,plan:"PILOT",licenseStatus:"PILOT",subscriptionStartsAt:new Date(),commercialNotes:"Απομονωμένο ψηφιακό δίδυμο ΚΑΤ για δοκιμές πριν το πραγματικό κατάστημα."}
      });
      const store=await tx.store.upsert({
        where:{id:KAT_TEST_STORE_ID},
        update:{name:"KAT TEST",companyId:company.id,active:true,cashCloseEmailEnabled:false},
        create:{id:KAT_TEST_STORE_ID,name:"KAT TEST",companyId:company.id,city:"Αθήνα",active:true,cashCloseEmailEnabled:false}
      });

      await copyModules(tx);

      for(const [code,name,startTime,endTime] of [
        ["MORNING","Πρωί","07:00","15:00"],
        ["AFTERNOON","Απόγευμα","15:00","23:00"],
        ["NIGHT","Βράδυ","23:00","07:00"]
      ]){
        await tx.shiftType.upsert({
          where:{storeId_code:{storeId:store.id,code}},
          update:{name,startTime,endTime,requiredCount:1,active:true},
          create:{storeId:store.id,code,name,startTime,endTime,requiredCount:1,active:true}
        });
      }

      const owner=await tx.user.upsert({
        where:{email:body.ownerEmail},
        update:{passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id,sessionVersion:{increment:1}},
        create:{email:body.ownerEmail,passwordHash:ownerPasswordHash,mustChangePassword:false,fullName:body.ownerName,role:"OWNER",companyId:company.id}
      });
      const admin=await tx.user.upsert({
        where:{email:body.adminEmail},
        update:{passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id,sessionVersion:{increment:1}},
        create:{email:body.adminEmail,passwordHash:adminPasswordHash,mustChangePassword:false,fullName:body.adminName,role:"ADMIN",companyId:company.id}
      });

      let seller=await tx.employee.findFirst({where:{storeId:store.id,fullName:body.sellerName}});
      if(!seller){
        seller=await tx.employee.create({data:{fullName:body.sellerName,position:"Πωλητής",storeId:store.id,maxDaysPerWeek:6,allowSixthDay:true,maxHoursPerWeek:48}});
      }

      const sourceLayout=await tx.$queryRawUnsafe(`SELECT "layoutJson","version" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,SOURCE_STORE_ID).catch(()=>[]);
      if(sourceLayout[0]){
        await tx.$executeRawUnsafe(`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES ($1,$2,$3::jsonb,$4,$5,NOW()) ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"=EXCLUDED."version","publishedBy"=EXCLUDED."publishedBy","publishedAt"=NOW()`,store.id,company.id,JSON.stringify(sourceLayout[0].layoutJson),Number(sourceLayout[0].version||1),req.user?.id||"SUPER_ADMIN");
      }

      await tx.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","role","pinHash","active","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'EMPLOYEE',$6,TRUE,$7,NOW(),NOW()) ON CONFLICT ("storeId","employeeId") DO UPDATE SET "displayName"=EXCLUDED."displayName","role"='EMPLOYEE',"pinHash"=EXCLUDED."pinHash","active"=TRUE,"updatedAt"=NOW()`,crypto.randomUUID(),company.id,store.id,seller.id,body.sellerName,sellerPinHash,req.user?.id||"SUPER_ADMIN");

      return {company,store,owner,admin,seller,layoutCopied:Boolean(sourceLayout[0])};
    });

    res.status(201).json({
      ready:true,
      isolated:true,
      fiscalConnection:false,
      company:{id:result.company.id,name:result.company.name},
      store:{id:result.store.id,name:result.store.name},
      roles:{
        superAdmin:"Χρησιμοποιεί τον υπάρχοντα Platform Super Admin λογαριασμό.",
        owner:{email:result.owner.email,fullName:result.owner.fullName},
        admin:{email:result.admin.email,fullName:result.admin.fullName},
        seller:{employeeId:result.seller.id,fullName:result.seller.fullName,login:"PIN"}
      },
      posLayoutCopied:result.layoutCopied,
      note:"Το KAT TEST είναι ξεχωριστός tenant/store και δεν συνδέεται με RBS, CapDriver ή πραγματική ταμειακή."
    });
  }catch(error){next(error)}
});

export default router;
