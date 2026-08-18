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

  const store = await prisma.store.upsert({
    where:{id:"pilot-store"},
    update:{name:"Κυλικείο ΚΑΤ",companyId:company.id},
    create:{id:"pilot-store",name:"Κυλικείο ΚΑΤ",companyId:company.id}
  });

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
  if(!email || !password) throw new Error("Λείπουν τα INITIAL_ADMIN_EMAIL ή INITIAL_ADMIN_PASSWORD.");

  const existingAdmin=await prisma.user.findUnique({where:{email}});
  if(existingAdmin){
    await prisma.user.update({
      where:{id:existingAdmin.id},
      data:{fullName:"Χρήστος Μάνης",role:UserRole.SUPER_ADMIN,companyId:company.id}
    });
  }else{
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data:{email,passwordHash,fullName:"Χρήστος Μάνης",role:UserRole.SUPER_ADMIN,companyId:company.id}
    });
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

  console.log(`Platform Super Admin: ${email}`);
  console.log(`KAT customer owner: ${katOwnerEmail}`);
}

main().finally(()=>prisma.$disconnect());