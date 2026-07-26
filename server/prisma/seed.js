
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, EmployeeType } from "@prisma/client";

const prisma = new PrismaClient();

const people = [
  ["Αθήνα","Προσωπικό",["MORNING"],5],
  ["Χριστίνα","Προσωπικό",["MORNING","AFTERNOON"],5],
  ["Σίσσυ","Προσωπικό",["MORNING","AFTERNOON"],5],
  ["Λασκώνη","Προσωπικό",["AFTERNOON","NIGHT"],5],
  ["Γαρίνης","Προσωπικό",["NIGHT"],5],
  ["Νικόλ","Delivery",["DELIVERY"],5],
  ["Άννα","Προσωπικό",["MORNING"],5],
  ["Μουτσοπούλου","Προσωπικό",["MORNING","AFTERNOON"],5],
  ["Λευτέρης","Υπεύθυνος",["MANAGER"],5],
  ["Όλγα","Προσωπικό",["AFTERNOON"],5],
  ["Δέσποινα","Προσωπικό",["MORNING","MIDDLE","AFTERNOON"],5]
];

async function main() {
  const company = await prisma.company.upsert({
    where: { id: "pilot-company" },
    update: {},
    create: { id: "pilot-company", name: "MyWorkStation Pilot" }
  });

  const store = await prisma.store.upsert({
    where: { id: "kat-store" },
    update: {},
    create: { id: "kat-store", name: "Κυλικείο ΚΑΤ", companyId: company.id, city: "Αθήνα" }
  });

  const shiftData = [
    ["MORNING","Πρωί","06:00","14:00",6],
    ["MIDDLE","Ενδιάμεση","11:00","19:00",1],
    ["AFTERNOON","Απόγευμα","14:00","22:00",2],
    ["NIGHT","Βράδυ","22:00","06:00",1],
    ["DELIVERY","Delivery","06:00","14:00",1],
    ["MANAGER","Υπεύθυνος","07:00","15:00",1]
  ];
  const shifts = {};
  for (const [code,name,startTime,endTime,requiredCount] of shiftData) {
    shifts[code] = await prisma.shiftType.upsert({
      where:{storeId_code:{storeId:store.id,code}},
      update:{name,startTime,endTime,requiredCount},
      create:{storeId:store.id,code,name,startTime,endTime,requiredCount}
    });
  }

  for (const [fullName, position, allowed, maxDaysPerWeek] of people) {
    const existing = await prisma.employee.findFirst({where:{storeId:store.id,fullName}});
    const employee = existing || await prisma.employee.create({
      data:{fullName,position,storeId:store.id,type:EmployeeType.PERMANENT,maxDaysPerWeek,allowSixthDay:true,maxHoursPerWeek:48}
    });
    for (const code of allowed) {
      await prisma.employeeRule.create({
        data:{employeeId:employee.id,shiftTypeId:shifts[code].id,allowed:true,note:"Αρχικός κανόνας"}
      }).catch(()=>{});
    }
  }

  const email = process.env.INITIAL_ADMIN_EMAIL || "admin@myworkstationapp.gr";
  const password = process.env.INITIAL_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where:{email},
    update:{passwordHash},
    create:{email,passwordHash,fullName:"Χρήστος Μάνης",role:UserRole.OWNER,companyId:company.id}
  });
  console.log(`Admin: ${email}`);
}

main().finally(()=>prisma.$disconnect());
