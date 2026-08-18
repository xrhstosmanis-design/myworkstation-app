import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient, EmployeeType, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main(){
  const company = await prisma.company.upsert({
    where:{id:"pilot-company"},
    update:{name:"Κυλικείο ΚΑΤ"},
    create:{id:"pilot-company",name:"Κυλικείο ΚΑΤ"}
  });

  // Prefer the real KAT store already created by the commercial/bootstrap flow.
  // The old seed used to create a second synthetic `pilot-store`, producing a duplicate
  // "Κυλικείο ΚΑΤ / Χωρίς πόλη" entry in Platform Admin.
  let store = await prisma.store.findFirst({
    where:{
      companyId:company.id,
      name:"Κυλικείο ΚΑΤ",
      id:{not:"pilot-store"},
      city:{not:null}
    },
    orderBy:{createdAt:"asc"}
  });

  if(store){
    const legacyPilotStore=await prisma.store.findUnique({where:{id:"pilot-store"}});
    if(legacyPilotStore&&legacyPilotStore.id!==store.id){
      await prisma.store.delete({where:{id:legacyPilotStore.id}});
      console.log(`Removed duplicate synthetic KAT store: ${legacyPilotStore.id}`);
    }
    store=await prisma.store.update({
      where:{id:store.id},
      data:{name:"Κυλικείο ΚΑΤ",city:store.city||"Αθήνα",companyId:company.id}
    });
  }else{
    store = await prisma.store.upsert({
      where:{id:"pilot-store"},
      update:{name:"Κυλικείο ΚΑΤ",city:"Αθήνα",companyId:company.id},
      create:{id:"pilot-store",name:"Κυλικείο ΚΑΤ",city:"Αθήνα",companyId:company.id}
    });
  }

  const shifts = {};
  for(const s of [
    ["MORNING","Πρωί","07:00","15:00"],
    ["AFTERNOON","Απόγευμα","15:00","23:00"],
    ["NIGHT","Βράδυ","23:00","07:00"]
  ]){
    const [code,name,startTime,endTime]=s;
    shifts[code]=await prisma.shiftType.upsert({
      where:{storeId_code:{storeId:store.id,code}},
      update:{name,startTime,endTime},
      create:{storeId:store.id,code,name,startTime,endTime}
    });
  }

  const employees=[
    ["Αθηνά","Ταμείο",5,["MORNING"]],
    ["Χριστίνα","Ταμείο",5,["MORNING","AFTERNOON"]],
    ["Δήμητρα","Ταμείο",5,["AFTERNOON"]],
    ["Γαρίνης","Ταμείο",6,["NIGHT","AFTERNOON"]],
    ["Νικόλ","Delivery",5,["MORNING"]],
    ["Άννα","Παραγωγή καφέ",5,["MORNING"]],
    ["Μουτοπούλου","Ταμείο",6,["MORNING","AFTERNOON"]],
    ["Σίσσυ","Ταμείο",5,["MORNING","AFTERNOON"]],
    ["Νόπη","Ταμείο",5,["MORNING"]],
    ["Αντώνης","Ταμείο",6,["MORNING","NIGHT"]],
    ["Πάμελα","Ταμείο",5,["AFTERNOON"]]
  ];

  for(const [fullName,position,maxDaysPerWeek,allowed] of employees){
    let employee=await prisma.employee.findFirst({where:{storeId:store.id,fullName}});
    if(employee){
      employee=await prisma.employee.update({where:{id:employee.id},data:{position,type:EmployeeType.PERMANENT,maxDaysPerWeek,allowSixthDay:true,maxHoursPerWeek:48}});
    }else{
      employee=await prisma.employee.create({data:{fullName,position,storeId:store.id,type:EmployeeType.PERMANENT,maxDaysPerWeek,allowSixthDay:true,maxHoursPerWeek:48}});
    }
    for (const code of allowed) {
      await prisma.employeeRule.create({
        data:{employeeId:employee.id,shiftTypeId:shifts[code].id,allowed:true,note:"Αρχικός κανόνας"}
      }).catch(()=>{});
    }
  }

  const email = String(process.env.INITIAL_ADMIN_EMAIL||"").trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const resetToken = String(process.env.INITIAL_ADMIN_RESET_TOKEN||"").trim();
  if(!email || !password) throw new Error("Λείπουν τα INITIAL_ADMIN_EMAIL ή INITIAL_ADMIN_PASSWORD.");

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SeedControl" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const resetKey=`initial-admin-password:${email}`;
  const resetRows=resetToken
    ? await prisma.$queryRaw`SELECT "value" FROM "SeedControl" WHERE "key"=${resetKey} LIMIT 1`
    : [];
  const shouldResetPassword=Boolean(resetToken)&&resetRows[0]?.value!==resetToken;

  const existingAdmin=await prisma.user.findUnique({where:{email}});
  if(existingAdmin){
    const data={fullName:"Χρήστος Μάνης",role:UserRole.SUPER_ADMIN,companyId:company.id};
    if(shouldResetPassword){
      data.passwordHash=await bcrypt.hash(password,12);
      data.sessionVersion={increment:1};
    }
    await prisma.user.update({where:{id:existingAdmin.id},data});
    if(shouldResetPassword){
      await prisma.userSession.updateMany({where:{userId:existingAdmin.id,revokedAt:null},data:{revokedAt:new Date()}}).catch(()=>{});
    }
  }else{
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data:{email,passwordHash,fullName:"Χρήστος Μάνης",role:UserRole.SUPER_ADMIN,companyId:company.id}
    });
  }

  if(resetToken&&(!existingAdmin||shouldResetPassword)){
    await prisma.$executeRaw`INSERT INTO "SeedControl" ("key","value","updatedAt") VALUES (${resetKey},${resetToken},CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=CURRENT_TIMESTAMP`;
    console.log("Platform Super Admin password reset token applied once.");
  }

  const katOwnerEmail=process.env.KAT_OWNER_EMAIL||"nikirazatou@hotmail.gr";
  const katOwnerName=process.env.KAT_OWNER_NAME||"Νίκη Ραζάτου";
  const katOwner=await prisma.user.findUnique({where:{email:katOwnerEmail}});
  if(katOwner){
    await prisma.user.update({
      where:{id:katOwner.id},
      data:{fullName:katOwnerName,role:UserRole.OWNER,companyId:company.id}
    });
  }else{
    const lockedPasswordHash=await bcrypt.hash(crypto.randomBytes(32).toString("hex"),12);
    await prisma.user.create({
      data:{email:katOwnerEmail,passwordHash:lockedPasswordHash,fullName:katOwnerName,role:UserRole.OWNER,companyId:company.id}
    });
  }

  console.log(`Seed KAT store: ${store.id} / ${store.name} / ${store.city||"—"}`);
  console.log(`Platform Super Admin: ${email}`);
  console.log(`KAT customer owner: ${katOwnerEmail}`);
}

main().finally(()=>prisma.$disconnect());