import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { catalogView,moduleCatalog,moduleKeys,planDefaults } from "../services/module-catalog.js";
import { getMailStatus } from "../services/mail.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed) return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const plans=["TRIAL","PILOT","BASIC","PRO","ENTERPRISE"];
const licenseStatuses=["TRIAL","PILOT","ACTIVE","SUSPENDED","EXPIRED"];
const planSchema=z.enum(plans);
const licenseStatusSchema=z.enum(licenseStatuses);
const dateValue=z.string().trim().optional().or(z.literal(""));
const quickLabels=["ΝΕΡΟ 500ML","ΝΕΡΟ 1,5LT","ΚΟΥΛΟΥΡΙ ΘΕΣ/ΝΙΚΗΣ","ΠΟΤΗΡΙ ΜΕ ΠΑΓΟ","ΠΛΑΣΤΙΚΗ ΣΑΚΟΥΛΑ","ΜΑΣΚΑ 0,60","ΠΑΡΟΧΗ","ΜΠΑΝΑΝΑ ΤΜΧ.","ΣΑΝΤΟΥΙΤΣ","ΧΥΜΟΣ ΠΟΡΤΟΚΑΛΙ","FREDDO ESPRESSO","CAPPUCCINO","ΤΣΙΧΛΕΣ","ΑΝΑΨΥΚΤΙΚΟ 330ML","ENERGY DRINK","ΣΟΚΟΛΑΤΑ ΜΠΑΡΑ"];
const categoryLabels=["ΖΕΣΤΑ ΡΟΦΗΜΑΤΑ","ΚΡΥΑ ΡΟΦΗΜΑΤΑ","ΑΝΑΨΥΚΤΙΚΑ","ΧΥΜΟΙ","ΝΕΡΑ","ΜΠΥΡΕΣ","ΚΡΑΣΙΑ","ΑΛΚΟΟΛΟΥΧΑ","PREMIUM BAKERY","ΑΡΤΟΠΟΙΙΑ","ΣΦΟΛΙΑΤΕΣ","ΣΑΝΤΟΥΙΤΣ","ΓΛΥΚΑ","ΠΑΓΩΤΑ","SNACKS","ΞΗΡΟΙ ΚΑΡΠΟΙ & ΣΠΟΡΟΙ","ΕΙΔΗ ΧΩΡΙΣ BARCODE","ΑΡΤΙΖΑΝ - ΠΕΡΕΚ","ΧΩΡΙΑΤΙΚΗ ΖΥΜΗ","ΔΙΑ ΧΕΙΡΟΣ","ΠΑΚΕΤΑ ΠΡΟΣΦΟΡΩΝ","ΥΠΗΡΕΣΙΕΣ","ΚΕΝΟ","ΚΕΝΟ"];
const palette=["#1597a5","#287e9e","#4f8fbe","#dc7a27","#3978b8","#9aa82f","#9a5353","#76558e","#b99a42","#98734b","#b59336","#77983f","#aa526e","#467ba3","#38989a","#8b6b48","#498769","#397d78","#71925d","#79549a","#d3832e","#40779a","#c9cecc","#d7dad8"];
const defaultPosLayout={
  title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},
  quickKeys:quickLabels.map((label,index)=>({id:`quick-${index+1}`,label,productQuery:label,color:palette[index%palette.length],visible:true})),
  categories:categoryLabels.map((label,index)=>({id:`category-${index+1}`,label,categoryName:label==="ΚΕΝΟ"?"":label,color:palette[index],visible:label!=="ΚΕΝΟ"})),
  buttons:[
    {id:"cancel",label:"ΑΚΥΡΩΣΗ",action:"CLEAR_CART",color:"#e33d3d",visible:true},{id:"print",label:"ΕΚΤΥΠΩΣΗ",action:"PRINT",color:"#ffffff",visible:true},
    {id:"hold",label:"ΑΝΑΜΟΝΗ",action:"HOLD",color:"#eea51d",visible:true},{id:"payments",label:"ΠΛΗΡΩΜΕΣ",action:"PAYMENTS",color:"#ffffff",visible:true},
    {id:"internal",label:"ΕΣΩΤΕΡΙΚΗ",action:"INTERNAL",color:"#8556ae",visible:true},{id:"waste",label:"ΚΟΥΒΑΣ",action:"WASTE",color:"#f0672f",visible:true},
    {id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#078a4d",visible:true},{id:"iris",label:"IRIS",action:"IRIS",color:"#149dad",visible:true},
    {id:"mixed",label:"ΜΙΚΤΗ",action:"MIXED",color:"#ffffff",visible:true},{id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3979cc",visible:true}
  ]
};
const colorSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const keyedButtonSchema=z.object({id:z.string().trim().min(1).max(60),label:z.string().trim().min(1).max(60),color:colorSchema,visible:z.boolean()});
const posLayoutSchema=z.object({
  title:z.string().trim().min(1).max(80),productColumns:z.coerce.number().int().min(2).max(8),showSku:z.boolean(),
  theme:z.object({headerColor:colorSchema,accentColor:colorSchema,surfaceColor:colorSchema}).default(defaultPosLayout.theme),
  quickKeys:z.array(keyedButtonSchema.extend({productQuery:z.string().trim().max(120)})).max(24).default(defaultPosLayout.quickKeys),
  categories:z.array(keyedButtonSchema.extend({categoryName:z.string().trim().max(120)})).max(32).default(defaultPosLayout.categories),
  buttons:z.array(keyedButtonSchema.extend({action:z.enum(["CASH","CARD","CLEAR_CART","PRINT","HOLD","PAYMENTS","INTERNAL","WASTE","IRIS","MIXED"])})).max(20)
}).superRefine((value,ctx)=>{
  const ids=[...value.quickKeys,...value.categories,...value.buttons].map(button=>button.id);
  if(new Set(ids).size!==ids.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Κάθε κουμπί χρειάζεται μοναδικό αναγνωριστικό."});
});

function parseDate(value){
  if(!value)return null;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error("Μη έγκυρη ημερομηνία.");
  return date;
}

function companyView(company){
  const owner=company.users.find(user=>user.role==="OWNER")||null;
  const employees=company.stores.reduce((total,store)=>total+(store._count?.employees||0),0);
  return {
    id:company.id,
    name:company.name,
    taxId:company.taxId,
    city:company.city,
    email:company.email,
    phone:company.phone,
    active:company.active,
    plan:company.plan,
    trialEndsAt:company.trialEndsAt,
    licenseStatus:company.licenseStatus,
    subscriptionStartsAt:company.subscriptionStartsAt,
    subscriptionEndsAt:company.subscriptionEndsAt,
    autoRenew:company.autoRenew,
    commercialNotes:company.commercialNotes,
    modules:catalogView(company.modules),
    activeModuleCount:company.modules.filter(module=>module.active).length,
    createdAt:company.createdAt,
    stores:company.stores.map(store=>({id:store.id,name:store.name,city:store.city,responsibleEmail:store.responsibleEmail,cashCloseEmailEnabled:store.cashCloseEmailEnabled,active:store.active,employees:store._count?.employees||0})),
    storeCount:company.stores.length,
    userCount:company.users.length,
    employeeCount:employees,
    owner:owner?{id:owner.id,fullName:owner.fullName,email:owner.email,role:owner.role}:null
  };
}

router.get("/overview",async(req,res,next)=>{
  try{
    const companies=await prisma.company.findMany({
      include:{
        users:{select:{id:true,fullName:true,email:true,role:true,createdAt:true}},
        modules:{orderBy:{moduleKey:"asc"}},
        stores:{
          select:{id:true,name:true,city:true,responsibleEmail:true,cashCloseEmailEnabled:true,active:true,_count:{select:{employees:true}}},
          orderBy:{name:"asc"}
        }
      },
      orderBy:{createdAt:"desc"}
    });
    const rows=companies.map(companyView);
    const now=Date.now();
    const month=30*24*60*60*1000;
    res.json({
      stats:{
        companies:rows.length,
        activeCompanies:rows.filter(row=>row.active).length,
        trialCompanies:rows.filter(row=>row.licenseStatus==="TRIAL").length,
        pilotCompanies:rows.filter(row=>row.licenseStatus==="PILOT").length,
        expiringLicenses:rows.filter(row=>row.subscriptionEndsAt&&new Date(row.subscriptionEndsAt).getTime()>=now&&new Date(row.subscriptionEndsAt).getTime()-now<=month).length,
        stores:rows.reduce((total,row)=>total+row.storeCount,0),
        users:rows.reduce((total,row)=>total+row.userCount,0),
        employees:rows.reduce((total,row)=>total+row.employeeCount,0)
      },
      companies:rows,
      plans,
      licenseStatuses,
      moduleCatalog
    });
  }catch(error){next(error)}
});

router.post("/companies",async(req,res,next)=>{
  try{
    const body=z.object({
      companyName:z.string().trim().min(2).max(160),
      taxId:z.string().trim().max(30).optional().or(z.literal("")),
      city:z.string().trim().max(100).optional().or(z.literal("")),
      phone:z.string().trim().max(40).optional().or(z.literal("")),
      companyEmail:z.string().trim().email().optional().or(z.literal("")),
      ownerFullName:z.string().trim().min(2).max(160),
      ownerEmail:z.string().trim().email(),
      temporaryPassword:z.string().min(8).max(100),
      storeName:z.string().trim().min(2).max(160),
      storeCity:z.string().trim().max(100).optional().or(z.literal("")),
      plan:planSchema.default("TRIAL"),
      trialDays:z.coerce.number().int().min(1).max(365).default(14)
    }).parse(req.body||{});

    const existing=await prisma.user.findUnique({where:{email:body.ownerEmail}});
    if(existing)return res.status(409).json({error:"Υπάρχει ήδη χρήστης με αυτό το email."});

    const passwordHash=await bcrypt.hash(body.temporaryPassword,12);
    const trialEndsAt=body.plan==="TRIAL"?new Date(Date.now()+body.trialDays*24*60*60*1000):null;
    const licenseStatus=body.plan==="TRIAL"?"TRIAL":body.plan==="PILOT"?"PILOT":"ACTIVE";
    const defaultModules=planDefaults[body.plan]||planDefaults.TRIAL;

    const created=await prisma.$transaction(async tx=>{
      const company=await tx.company.create({
        data:{
          name:body.companyName,
          taxId:body.taxId||null,
          city:body.city||null,
          email:body.companyEmail||null,
          phone:body.phone||null,
          active:true,
          plan:body.plan,
          trialEndsAt,
          licenseStatus,
          subscriptionStartsAt:new Date(),
          subscriptionEndsAt:trialEndsAt
        }
      });
      const owner=await tx.user.create({
        data:{
          email:body.ownerEmail,
          passwordHash,
          fullName:body.ownerFullName,
          role:"OWNER",
          companyId:company.id
        }
      });
      const store=await tx.store.create({
        data:{name:body.storeName,city:body.storeCity||body.city||null,companyId:company.id}
      });
      await tx.shiftType.createMany({data:[
        {storeId:store.id,code:"MORNING",name:"Πρωί",startTime:"07:00",endTime:"15:00",requiredCount:1},
        {storeId:store.id,code:"AFTERNOON",name:"Απόγευμα",startTime:"15:00",endTime:"23:00",requiredCount:1},
        {storeId:store.id,code:"NIGHT",name:"Βράδυ",startTime:"23:00",endTime:"07:00",requiredCount:1}
      ]});
      await tx.companyModule.createMany({
        data:defaultModules.map(moduleKey=>({companyId:company.id,moduleKey,active:true}))
      });
      return {company,owner,store};
    });

    res.status(201).json({
      company:{id:created.company.id,name:created.company.name,plan:created.company.plan,active:created.company.active,licenseStatus:created.company.licenseStatus,trialEndsAt:created.company.trialEndsAt},
      owner:{id:created.owner.id,fullName:created.owner.fullName,email:created.owner.email},
      store:{id:created.store.id,name:created.store.name}
    });
  }catch(error){next(error)}
});

router.put("/companies/:companyId/owner",async(req,res,next)=>{
  try{
    const body=z.object({
      fullName:z.string().trim().min(2).max(160),
      email:z.string().trim().email(),
      temporaryPassword:z.string().min(8).max(100).optional().or(z.literal(""))
    }).parse(req.body||{});
    const company=await prisma.company.findUnique({where:{id:req.params.companyId},include:{modules:true}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});

    const currentOwner=await prisma.user.findFirst({where:{companyId:company.id,role:"OWNER"}});
    const emailUser=await prisma.user.findUnique({where:{email:body.email}});
    if(emailUser&&emailUser.id!==currentOwner?.id){
      return res.status(409).json({error:"Το email χρησιμοποιείται ήδη από άλλον λογαριασμό."});
    }
    if(!currentOwner&&!body.temporaryPassword){
      return res.status(400).json({error:"Για νέο ιδιοκτήτη απαιτείται προσωρινός κωδικός τουλάχιστον 8 χαρακτήρων."});
    }

    const data={fullName:body.fullName,email:body.email,role:"OWNER",companyId:company.id};
    if(body.temporaryPassword)data.passwordHash=await bcrypt.hash(body.temporaryPassword,12);

    const owner=currentOwner
      ? await prisma.user.update({where:{id:currentOwner.id},data})
      : await prisma.user.create({data:{...data,passwordHash:data.passwordHash}});

    res.json({id:owner.id,fullName:owner.fullName,email:owner.email,role:owner.role,companyId:owner.companyId});
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId",async(req,res,next)=>{
  try{
    const body=z.object({
      name:z.string().trim().min(2).max(160),
      city:z.string().trim().max(100).optional().or(z.literal("")),
      responsibleEmail:z.string().trim().email().optional().or(z.literal("")),
      cashCloseEmailEnabled:z.boolean().default(true)
    }).parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.params.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const updated=await prisma.store.update({
      where:{id:store.id},
      data:{name:body.name,city:body.city||null,responsibleEmail:body.responsibleEmail.toLowerCase()||null,cashCloseEmailEnabled:body.cashCloseEmailEnabled}
    });
    res.json({id:updated.id,name:updated.name,city:updated.city,responsibleEmail:updated.responsibleEmail,cashCloseEmailEnabled:updated.cashCloseEmailEnabled,companyId:updated.companyId});
  }catch(error){next(error)}
});

router.get("/companies/:companyId/stores/:storeId/pilot-readiness",async(req,res,next)=>{
  try{
    const company=await prisma.company.findUnique({where:{id:req.params.companyId},include:{modules:true,users:{where:{role:"OWNER"},select:{id:true,email:true}},stores:{where:{id:req.params.storeId},include:{_count:{select:{employees:true}}}}}});
    const store=company?.stores?.[0];
    if(!company||!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const requiredModules=["CORE","STORE_MODE","CASH_CONTROL","PILOT_REPORT"];
    const now=new Date();
    const activeModules=new Set(company.modules.filter(row=>row.active&&(!row.startsAt||row.startsAt<=now)&&(!row.endsAt||row.endsAt>=now)).map(row=>row.moduleKey));
    const credentialTable=await prisma.$queryRaw`SELECT to_regclass('public."StoreOperatorCredential"')::text AS "tableName"`;
    const credentialRows=credentialTable[0]?.tableName?await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "total",COUNT(*) FILTER (WHERE "pinHash" IS NOT NULL)::int AS "withPin",
             COUNT(*) FILTER (WHERE "cardCodeHash" IS NOT NULL)::int AS "withCard",COUNT(*) FILTER (WHERE "role"='MANAGER')::int AS "managers"
      FROM "StoreOperatorCredential" WHERE "companyId"=${company.id} AND "storeId"=${store.id} AND "active"=TRUE
    `:[{total:0,withPin:0,withCard:0,managers:0}];
    const credentials=credentialRows[0];
    const activeEmployees=await prisma.employee.count({where:{storeId:store.id,active:true}});
    const cashTable=await prisma.$queryRaw`SELECT to_regclass('public."CashShiftSession"')::text AS "tableName"`;
    const openShifts=cashTable[0]?.tableName?await prisma.$queryRaw`SELECT COUNT(*)::int AS "total" FROM "CashShiftSession" WHERE "companyId"=${company.id} AND "storeId"=${store.id} AND "status"='OPEN'`:[{total:0}];
    const layoutTable=await prisma.$queryRaw`SELECT to_regclass('public."StorePosLayout"')::text AS "tableName"`;
    const layouts=layoutTable[0]?.tableName?await prisma.$queryRaw`SELECT COUNT(*)::int AS "total" FROM "StorePosLayout" WHERE "companyId"=${company.id} AND "storeId"=${store.id}`:[{total:0}];
    const profileTable=await prisma.$queryRaw`SELECT to_regclass('public."PilotStoreProfile"')::text AS "tableName"`;
    const profileRows=profileTable[0]?.tableName?await prisma.$queryRaw`SELECT "pcName","operatingHours","responsibleName","notes","backupConfirmedAt","designFrozenAt","databaseFrozenAt","loginTestedAt","shiftOpenTestedAt","shiftCloseTestedAt","kioskUnaffectedAt","updatedAt" FROM "PilotStoreProfile" WHERE "companyId"=${company.id} AND "storeId"=${store.id} LIMIT 1`:[];
    const profile=profileRows[0]||null;
    const mail=getMailStatus();
    const emailRecipient=Boolean(company.users[0]?.email||store.responsibleEmail);
    const checks=[
      {key:"company",label:"Ενεργή εταιρεία και άδεια",ok:company.active&&!['SUSPENDED','EXPIRED'].includes(company.licenseStatus),blocking:true,detail:`${company.licenseStatus} · ${company.plan}`},
      {key:"store",label:"Ενεργό κατάστημα",ok:store.active,blocking:true,detail:store.name},
      {key:"modules",label:"Βασικά modules πιλοτικής λειτουργίας",ok:requiredModules.every(key=>activeModules.has(key)),blocking:true,detail:requiredModules.filter(key=>!activeModules.has(key)).length?`Λείπουν: ${requiredModules.filter(key=>!activeModules.has(key)).join(", ")}`:"CORE · STORE MODE · CASH CONTROL · PILOT REPORT"},
      {key:"employees",label:"Ενεργό προσωπικό καταστήματος",ok:activeEmployees>0,blocking:true,detail:`${activeEmployees} ενεργοί εργαζόμενοι`},
      {key:"credentials",label:"Προσωπική είσοδος με PIN ή κάρτα",ok:credentials.total>0&&(credentials.withPin>0||credentials.withCard>0),blocking:true,detail:`${credentials.total} ενεργοί · ${credentials.withPin} PIN · ${credentials.withCard} κάρτες`},
      {key:"manager",label:"Υπεύθυνος Store Mode",ok:credentials.managers>0,blocking:true,detail:`${credentials.managers} υπεύθυνοι`},
      {key:"pilotProfile",label:"Στοιχεία πιλοτικής εγκατάστασης",ok:Boolean(profile?.pcName&&profile?.operatingHours&&profile?.responsibleName),blocking:true,detail:profile?.pcName&&profile?.operatingHours&&profile?.responsibleName?`${profile.pcName} · ${profile.operatingHours} · ${profile.responsibleName}`:"Συμπληρώστε PC, ωράριο και υπεύθυνο"},
      {key:"backup",label:"Επιβεβαιωμένο backup πριν από αλλαγές",ok:Boolean(profile?.backupConfirmedAt),blocking:true,detail:profile?.backupConfirmedAt?`Επιβεβαιώθηκε ${new Date(profile.backupConfirmedAt).toLocaleString("el-GR")}`:"Δεν έχει επιβεβαιωθεί backup"},
      {key:"scopeFreeze",label:"Κλείδωμα design και βάσης δεδομένων",ok:Boolean(profile?.designFrozenAt&&profile?.databaseFrozenAt),blocking:true,detail:profile?.designFrozenAt&&profile?.databaseFrozenAt?"Design και βάση κλειδωμένα για την πιλοτική εγκατάσταση":"Απαιτείται κλείδωμα design και βάσης"},
      {key:"operatorSmoke",label:"Δοκιμή εισόδου εργαζομένου",ok:Boolean(profile?.loginTestedAt),blocking:true,detail:profile?.loginTestedAt?`Επιβεβαιώθηκε ${new Date(profile.loginTestedAt).toLocaleString("el-GR")}`:"Εκκρεμεί πραγματική είσοδος με PIN ή κάρτα"},
      {key:"shiftSmoke",label:"Δοκιμή ανοίγματος και κλεισίματος βάρδιας",ok:Boolean(profile?.shiftOpenTestedAt&&profile?.shiftCloseTestedAt),blocking:true,detail:profile?.shiftOpenTestedAt&&profile?.shiftCloseTestedAt?"Άνοιγμα και κλείσιμο επιβεβαιώθηκαν":"Εκκρεμεί πραγματική δοκιμή βάρδιας"},
      {key:"kioskIsolation",label:"Επιβεβαίωση ανεπηρέαστου Kiosk Manager",ok:Boolean(profile?.kioskUnaffectedAt),blocking:true,detail:profile?.kioskUnaffectedAt?"Kiosk Manager και ταμειακή συνέχισαν κανονικά":"Εκκρεμεί επιβεβαίωση μετά τη δοκιμή"},
      {key:"mail",label:"Email αναφοράς κλεισίματος",ok:!store.cashCloseEmailEnabled||(mail.configured&&emailRecipient),blocking:store.cashCloseEmailEnabled,detail:store.cashCloseEmailEnabled?(mail.configured&&emailRecipient?"SMTP έτοιμο και υπάρχει παραλήπτης":"Ελέγξτε SMTP ή email παραλήπτη"):"Απενεργοποιημένο για το κατάστημα"},
      {key:"posLayout",label:"Δημοσιευμένος σχεδιασμός POS",ok:Number(layouts[0]?.total||0)>0,blocking:false,detail:Number(layouts[0]?.total||0)>0?"Έχει δημοσιευτεί στο κατάστημα":"Προαιρετικό για την πρώτη παράλληλη δοκιμή"},
      {key:"openShift",label:"Κατάσταση βάρδιας",ok:true,blocking:false,detail:Number(openShifts[0]?.total||0)>0?"Υπάρχει ανοιχτή βάρδια — μην εκτελέσετε νέα δοκιμή ανοίγματος":"Δεν υπάρχει ανοιχτή βάρδια"},
      {key:"fiscalIsolation",label:"Απομόνωση από RBS / φορολογική λειτουργία",ok:true,blocking:true,detail:"Παράλληλη μη φορολογική λειτουργία — καμία εντολή προς RBS"}
    ];
    const blockers=checks.filter(check=>check.blocking&&!check.ok);
    res.json({ready:blockers.length===0,checkedAt:new Date().toISOString(),company:{id:company.id,name:company.name},store:{id:store.id,name:store.name},profile,checks,blockers:blockers.length});
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId/pilot-profile",async(req,res,next)=>{
  try{
    const body=z.object({
      pcName:z.string().trim().min(2).max(120),
      operatingHours:z.string().trim().min(3).max(160),
      responsibleName:z.string().trim().min(2).max(160),
      notes:z.string().trim().max(1000).optional().or(z.literal("")),
      backupConfirmed:z.boolean(),designFrozen:z.boolean(),databaseFrozen:z.boolean(),
      loginTested:z.boolean(),shiftOpenTested:z.boolean(),shiftCloseTested:z.boolean(),kioskUnaffected:z.boolean()
    }).parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.params.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const now=new Date();
    const rows=await prisma.$queryRaw`
      INSERT INTO "PilotStoreProfile" ("storeId","companyId","pcName","operatingHours","responsibleName","notes","backupConfirmedAt","designFrozenAt","databaseFrozenAt","loginTestedAt","shiftOpenTestedAt","shiftCloseTestedAt","kioskUnaffectedAt","updatedBy","updatedAt")
      VALUES (${store.id},${store.companyId},${body.pcName},${body.operatingHours},${body.responsibleName},${body.notes||null},${body.backupConfirmed?now:null},${body.designFrozen?now:null},${body.databaseFrozen?now:null},${body.loginTested?now:null},${body.shiftOpenTested?now:null},${body.shiftCloseTested?now:null},${body.kioskUnaffected?now:null},${req.user.id},CURRENT_TIMESTAMP)
      ON CONFLICT ("storeId") DO UPDATE SET "pcName"=EXCLUDED."pcName","operatingHours"=EXCLUDED."operatingHours","responsibleName"=EXCLUDED."responsibleName","notes"=EXCLUDED."notes",
        "backupConfirmedAt"=CASE WHEN ${body.backupConfirmed} THEN COALESCE("PilotStoreProfile"."backupConfirmedAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "designFrozenAt"=CASE WHEN ${body.designFrozen} THEN COALESCE("PilotStoreProfile"."designFrozenAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "databaseFrozenAt"=CASE WHEN ${body.databaseFrozen} THEN COALESCE("PilotStoreProfile"."databaseFrozenAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "loginTestedAt"=CASE WHEN ${body.loginTested} THEN COALESCE("PilotStoreProfile"."loginTestedAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "shiftOpenTestedAt"=CASE WHEN ${body.shiftOpenTested} THEN COALESCE("PilotStoreProfile"."shiftOpenTestedAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "shiftCloseTestedAt"=CASE WHEN ${body.shiftCloseTested} THEN COALESCE("PilotStoreProfile"."shiftCloseTestedAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "kioskUnaffectedAt"=CASE WHEN ${body.kioskUnaffected} THEN COALESCE("PilotStoreProfile"."kioskUnaffectedAt",CURRENT_TIMESTAMP) ELSE NULL END,
        "updatedBy"=${req.user.id},"updatedAt"=CURRENT_TIMESTAMP
      RETURNING "pcName","operatingHours","responsibleName","notes","backupConfirmedAt","designFrozenAt","databaseFrozenAt","loginTestedAt","shiftOpenTestedAt","shiftCloseTestedAt","kioskUnaffectedAt","updatedAt"`;
    res.json(rows[0]);
  }catch(error){next(error)}
});

router.post("/companies/:companyId/support-access",async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string().optional().nullable(),destination:z.enum(["ALL","BACKOFFICE","SHIFTS","CASH_CONTROL"]).default("ALL")}).parse(req.body||{});
    const company=await prisma.company.findUnique({where:{id:req.params.companyId},select:{id:true,name:true,active:true}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
    const store=body.storeId?await prisma.store.findFirst({where:{id:body.storeId,companyId:company.id},select:{id:true,name:true}}):null;
    if(body.storeId&&!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const token=jwt.sign({id:req.user.id,companyId:company.id,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,fullName:req.user.fullName,email:req.user.email,tokenType:"BACKOFFICE_USER",sessionId:req.user.sessionId,sessionVersion:req.user.sessionVersion,supportContext:{companyId:company.id,companyName:company.name,storeId:store?.id||null,storeName:store?.name||null,destination:body.destination}},process.env.JWT_SECRET,{expiresIn:"2h"});
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"SUPER_ADMIN_SUPPORT_ACCESS",success:true,deviceName:`${company.name}${store?` · ${store.name}`:""}`}});
    res.json({token,expiresInMinutes:120,user:{id:req.user.id,fullName:req.user.fullName,role:"OWNER",isSuperAdmin:true,company:{id:company.id,name:company.name}},supportContext:{companyId:company.id,companyName:company.name,storeId:store?.id||null,storeName:store?.name||null,destination:body.destination}});
  }catch(error){next(error)}
});

router.get("/pos-designer",async(req,res,next)=>{
  try{
    const drafts=await prisma.$queryRaw`SELECT "layoutJson","version","updatedAt" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;
    const companies=await prisma.company.findMany({select:{id:true,name:true,stores:{where:{active:true},select:{id:true,name:true,city:true},orderBy:{name:"asc"}}},orderBy:{name:"asc"}});
    const published=await prisma.$queryRaw`SELECT "storeId","version","publishedAt" FROM "StorePosLayout"`;
    res.json({draft:drafts[0]?.layoutJson||defaultPosLayout,draftVersion:drafts[0]?.version||0,updatedAt:drafts[0]?.updatedAt||null,companies,published});
  }catch(error){next(error)}
});

router.put("/pos-designer/draft",async(req,res,next)=>{
  try{
    const layout=posLayoutSchema.parse(req.body||{});
    const rows=await prisma.$queryRaw`INSERT INTO "PlatformPosDraft" ("id","layoutJson","version","updatedBy","updatedAt") VALUES ('GLOBAL',${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("id") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="PlatformPosDraft"."version"+1,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=CURRENT_TIMESTAMP RETURNING "version","updatedAt"`;
    res.json({ok:true,draftVersion:rows[0].version,updatedAt:rows[0].updatedAt});
  }catch(error){next(error)}
});

router.post("/pos-designer/publish",async(req,res,next)=>{
  try{
    const body=z.object({storeIds:z.array(z.string()).min(1).max(1000)}).parse(req.body||{});
    const storeIds=[...new Set(body.storeIds)];
    const stores=await prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,companyId:true}});
    if(stores.length!==storeIds.length)return res.status(404).json({error:"Ένα ή περισσότερα καταστήματα δεν βρέθηκαν."});
    const drafts=await prisma.$queryRaw`SELECT "layoutJson" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;
    const layout=posLayoutSchema.parse(drafts[0]?.layoutJson||defaultPosLayout);
    await prisma.$transaction(async tx=>{for(const store of stores)await tx.$executeRaw`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES (${store.id},${store.companyId},${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="StorePosLayout"."version"+1,"publishedBy"=EXCLUDED."publishedBy","publishedAt"=CURRENT_TIMESTAMP`});
    res.json({ok:true,publishedStores:stores.length});
  }catch(error){next(error)}
});

router.put("/companies/:companyId/license",async(req,res,next)=>{
  try{
    const moduleSchema=z.object({
      key:z.enum(moduleKeys),
      active:z.boolean(),
      startsAt:dateValue,
      endsAt:dateValue,
      notes:z.string().trim().max(500).optional().or(z.literal(""))
    });
    const body=z.object({
      plan:planSchema,
      licenseStatus:licenseStatusSchema,
      subscriptionStartsAt:dateValue,
      subscriptionEndsAt:dateValue,
      autoRenew:z.boolean().default(false),
      commercialNotes:z.string().trim().max(2000).optional().or(z.literal("")),
      modules:z.array(moduleSchema)
    }).parse(req.body||{});

    const company=await prisma.company.findUnique({where:{id:req.params.companyId}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});

    const moduleByKey=new Map(moduleCatalog.map(module=>[module.key,module]));
    const selectedKeys=new Set(body.modules.filter(module=>module.active).map(module=>module.key));
    if(!selectedKeys.has("CORE"))return res.status(400).json({error:"Το MyWorkStation Core δεν μπορεί να απενεργοποιηθεί."});
    for(const module of body.modules){
      const catalogModule=moduleByKey.get(module.key);
      const alreadyTechnicallyActive=company.modules.some(row=>row.moduleKey===module.key&&row.active);
      if(module.active&&!catalogModule?.commercialReady&&!alreadyTechnicallyActive){
        return res.status(400).json({error:`Το module «${catalogModule?.name||module.key}» δεν είναι ακόμη διαθέσιμο για εμπορική ενεργοποίηση.`});
      }
    }

    const shouldBeActive=!(["SUSPENDED","EXPIRED"].includes(body.licenseStatus));
    const updated=await prisma.$transaction(async tx=>{
      const result=await tx.company.update({
        where:{id:company.id},
        data:{
          plan:body.plan,
          licenseStatus:body.licenseStatus,
          active:shouldBeActive,
          subscriptionStartsAt:parseDate(body.subscriptionStartsAt),
          subscriptionEndsAt:parseDate(body.subscriptionEndsAt),
          trialEndsAt:body.licenseStatus==="TRIAL"?parseDate(body.subscriptionEndsAt):null,
          autoRenew:body.autoRenew,
          commercialNotes:body.commercialNotes||null
        }
      });
      for(const module of body.modules){
        await tx.companyModule.upsert({
          where:{companyId_moduleKey:{companyId:company.id,moduleKey:module.key}},
          update:{
            active:module.active,
            startsAt:parseDate(module.startsAt),
            endsAt:parseDate(module.endsAt),
            notes:module.notes||null
          },
          create:{
            companyId:company.id,
            moduleKey:module.key,
            active:module.active,
            startsAt:parseDate(module.startsAt),
            endsAt:parseDate(module.endsAt),
            notes:module.notes||null
          }
        });
      }
      return result;
    });
    res.json({ok:true,company:{id:updated.id,name:updated.name,active:updated.active,plan:updated.plan,licenseStatus:updated.licenseStatus}});
  }catch(error){next(error)}
});

router.post("/companies/:companyId/modules/:moduleKey/technical-activation",async(req,res,next)=>{
  try{
    const moduleKey=z.enum(moduleKeys).parse(req.params.moduleKey);
    const body=z.object({active:z.boolean(),reason:z.string().trim().min(10).max(500)}).parse(req.body||{});
    const catalogModule=moduleCatalog.find(module=>module.key===moduleKey);
    if(!catalogModule?.requiresTechnicalActivation)return res.status(400).json({error:"Το module δεν υποστηρίζει τεχνική ενεργοποίηση."});
    const company=await prisma.company.findUnique({where:{id:req.params.companyId}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});
    const entitlement=await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId:company.id,moduleKey}},update:{active:body.active,notes:`TECHNICAL PILOT: ${body.reason}`},create:{companyId:company.id,moduleKey,active:body.active,notes:`TECHNICAL PILOT: ${body.reason}`}});
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"platform-admin",event:`TECHNICAL_MODULE_${body.active?"ACTIVATED":"DEACTIVATED"}:${company.id}:${moduleKey}:${body.reason}`,success:true,deviceName:req.headers["x-device-name"]||null,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
    res.json({ok:true,module:{key:moduleKey,active:entitlement.active,notes:entitlement.notes},mode:"TECHNICAL_PILOT_READ_ONLY"});
  }catch(error){next(error)}
});

router.patch("/companies/:companyId",async(req,res,next)=>{
  try{
    const body=z.object({
      active:z.boolean().optional(),
      plan:planSchema.optional(),
      trialDays:z.coerce.number().int().min(1).max(365).optional()
    }).refine(value=>Object.keys(value).length>0,{message:"Δεν δόθηκε αλλαγή."}).parse(req.body||{});
    const company=await prisma.company.findUnique({where:{id:req.params.companyId}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});
    const data={};
    if(body.active!==undefined)data.active=body.active;
    if(body.plan!==undefined){
      data.plan=body.plan;
      if(body.plan!=="TRIAL")data.trialEndsAt=null;
    }
    if(body.trialDays!==undefined){
      data.plan="TRIAL";
      data.licenseStatus="TRIAL";
      data.active=true;
      data.trialEndsAt=new Date(Date.now()+body.trialDays*24*60*60*1000);
      data.subscriptionEndsAt=data.trialEndsAt;
    }
    res.json(await prisma.company.update({where:{id:company.id},data}));
  }catch(error){next(error)}
});

router.post("/companies/:companyId/reset-owner-password",async(req,res,next)=>{
  try{
    const body=z.object({temporaryPassword:z.string().min(8).max(100)}).parse(req.body||{});
    const owner=await prisma.user.findFirst({where:{companyId:req.params.companyId,role:"OWNER"}});
    if(!owner)return res.status(404).json({error:"Δεν βρέθηκε ιδιοκτήτης πελάτη."});
    const passwordHash=await bcrypt.hash(body.temporaryPassword,12);
    await prisma.user.update({where:{id:owner.id},data:{passwordHash}});
    res.json({ok:true,owner:{id:owner.id,fullName:owner.fullName,email:owner.email}});
  }catch(error){next(error)}
});

export default router;
