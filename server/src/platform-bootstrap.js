import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma.js";

export async function ensurePlatformSchema(){
  // Existing Render databases predate Platform Admin. These idempotent changes
  // add only the missing commercial-platform fields and preserve all data.
  await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'TRIAL'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3)`);

  const company=await prisma.company.findUnique({where:{id:"pilot-company"}});
  if(!company) throw new Error("Δεν βρέθηκε η πιλοτική εταιρεία pilot-company.");

  await prisma.company.update({
    where:{id:company.id},
    data:{name:"Κυλικείο ΚΑΤ",active:true,plan:"PILOT"}
  });

  const adminEmail=process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword=process.env.INITIAL_ADMIN_PASSWORD;
  if(!adminEmail) throw new Error("Λείπει το INITIAL_ADMIN_EMAIL.");

  const existingAdmin=await prisma.user.findUnique({where:{email:adminEmail}});
  if(existingAdmin){
    await prisma.user.update({
      where:{id:existingAdmin.id},
      data:{fullName:"Χρήστος Μάνης",role:"SUPER_ADMIN",companyId:company.id}
    });
  }else{
    if(!adminPassword) throw new Error("Λείπει το INITIAL_ADMIN_PASSWORD για δημιουργία Platform Super Admin.");
    await prisma.user.create({
      data:{
        email:adminEmail,
        passwordHash:await bcrypt.hash(adminPassword,12),
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
        fullName:ownerName,
        role:"OWNER",
        companyId:company.id
      }
    });
  }

  console.log("Platform schema bootstrap completed.");
}
