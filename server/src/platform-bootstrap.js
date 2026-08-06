import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma.js";

const katPilotModules=[
  "CORE",
  "PERSONNEL",
  "SHIFTS",
  "LEAVES",
  "CASH_CONTROL",
  "STORE_MODE",
  "PILOT_REPORT"
];

export async function ensurePlatformSchema(){
  // Existing Render databases predate Platform Admin. These idempotent changes
  // add only missing fields/tables and preserve all operational data.
  await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'TRIAL'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "licenseStatus" TEXT NOT NULL DEFAULT 'TRIAL'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "subscriptionStartsAt" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP(3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "commercialNotes" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpRecoveryCodes" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyModule" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "moduleKey" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "startsAt" TIMESTAMP(3),
      "endsAt" TIMESTAMP(3),
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CompanyModule_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CompanyModule_companyId_moduleKey_key" ON "CompanyModule"("companyId","moduleKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CompanyModule_companyId_idx" ON "CompanyModule"("companyId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "deviceName" TEXT,
      "userAgent" TEXT,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "revokedAt" TIMESTAMP(3),
      CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuthAudit" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "email" TEXT NOT NULL,
      "event" TEXT NOT NULL,
      "success" BOOLEAN NOT NULL,
      "deviceName" TEXT,
      "userAgent" TEXT,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuthAudit_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuthAudit_userId_idx" ON "AuthAudit"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuthAudit_createdAt_idx" ON "AuthAudit"("createdAt")`);

  const company=await prisma.company.findUnique({where:{id:"pilot-company"}});
  if(!company) throw new Error("Δεν βρέθηκε η πιλοτική εταιρεία pilot-company.");

  await prisma.company.update({
    where:{id:company.id},
    data:{
      name:"Κυλικείο ΚΑΤ",
      active:true,
      plan:"PILOT",
      licenseStatus:"PILOT",
      subscriptionStartsAt:company.subscriptionStartsAt||new Date()
    }
  });

  for(const moduleKey of katPilotModules){
    await prisma.companyModule.upsert({
      where:{companyId_moduleKey:{companyId:company.id,moduleKey}},
      update:{active:true},
      create:{companyId:company.id,moduleKey,active:true,notes:"Αρχικό πιλοτικό module ΚΑΤ"}
    });
  }

  const adminEmail=process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword=process.env.INITIAL_ADMIN_PASSWORD;
  if(!adminEmail) throw new Error("Λείπει το INITIAL_ADMIN_EMAIL.");

  const existingAdmin=await prisma.user.findUnique({where:{email:adminEmail}});
  if(existingAdmin){
    await prisma.user.update({
      where:{id:existingAdmin.id},
      data:{fullName:"Χρήστος Μάνης",role:"SUPER_ADMIN",companyId:company.id,mustChangePassword:false}
    });
  }else{
    if(!adminPassword) throw new Error("Λείπει το INITIAL_ADMIN_PASSWORD για δημιουργία Platform Super Admin.");
    await prisma.user.create({
      data:{
        email:adminEmail,
        passwordHash:await bcrypt.hash(adminPassword,12),
        mustChangePassword:false,
        fullName:"Χρήστος Μάνης",
        role:"SUPER_ADMIN",
        companyId:company.id
      }
    });
  }

  const ownerEmail=process.env.KAT_OWNER_EMAIL||"nikirazatou@hotmail.gr";
  const ownerName=process.env.KAT_OWNER_NAME||"Νίκη Ραζάτου";
  const existingOwner=await prisma.user.findUnique({where:{email:ownerEmail}});
  if(existingOwner){
    await prisma.user.update({
      where:{id:existingOwner.id},
      data:{fullName:ownerName,role:"OWNER",companyId:company.id}
    });
  }else{
    const lockedPasswordHash=await bcrypt.hash(crypto.randomBytes(32).toString("hex"),12);
    await prisma.user.create({
      data:{
        email:ownerEmail,
        passwordHash:lockedPasswordHash,
        mustChangePassword:false,
        fullName:ownerName,
        role:"OWNER",
        companyId:company.id
      }
    });
  }

  await prisma.userSession.updateMany({
    where:{expiresAt:{lt:new Date()},revokedAt:null},
    data:{revokedAt:new Date()}
  }).catch(()=>{});

  console.log("Platform schema, MFA, password change, customer licenses and module entitlements bootstrap completed.");
}
