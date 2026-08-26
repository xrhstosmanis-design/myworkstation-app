import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { catalogView,moduleCatalog,moduleKeys,planDefaults } from "../services/module-catalog.js";
import { getMailStatus,sendCashControlDailyReportEmail } from "../services/mail.js";

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
const deletableTestCompanyNames=new Set(["KAT TEST"]);
const permanentDeletePhrase="DELETE KAT TEST";
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

function platformCashAuditAmount(details){
  for(const key of ["reversalTotal","originalTotal","total","amount"]){const value=Number(details?.[key]);if(Number.isFinite(value)&&value!==0)return value}
  return null;
}

async function platformCashInvestigation(session,tables){
  const auditUntil=session.closedAt?new Date(new Date(session.closedAt).getTime()+24*60*60*1000):new Date();
  const [transactions,operatorEvents,actionEvents,safetyEvents]=await Promise.all([
    prisma.$queryRaw`SELECT t."id",t."type",t."amount",t."actorName",t."occurredAt",t."reversedAt",t."reversedByName",t."reversalReason",(t."attachmentData" IS NOT NULL OR t."attachmentMimeType"='application/vnd.myworkstation.purchase-document') AS "hasEvidence",p."totalGross" AS "documentTotal" FROM "StoreTransaction" t LEFT JOIN "PurchaseDocument" p ON p."id"=CASE WHEN t."attachmentMimeType"='application/vnd.myworkstation.purchase-document' THEN t."attachmentFilename" ELSE NULL END WHERE t."companyId"=${session.companyId} AND t."storeId"=${session.storeId} AND t."sessionId"=${session.sessionId} ORDER BY t."occurredAt"`,
    tables.operator?prisma.$queryRaw`SELECT "eventType","actorId","operatorId","details","createdAt" FROM "StoreOperatorAudit" WHERE "companyId"=${session.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`:[],
    tables.actions?prisma.$queryRaw`SELECT "saleId","relatedSaleId","actionType","reason","actorId","actorName","details","createdAt" FROM "PosSaleActionAudit" WHERE "companyId"=${session.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`:[],
    tables.safety?prisma.$queryRaw`SELECT "saleId","relatedSaleId","eventType","actorId","actorName","details","createdAt" FROM "PosSaleSafetyAudit" WHERE "companyId"=${session.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`:[]
  ]);
  const findings=[];
  for(const row of transactions){
    const amount=Number(row.amount||0),documentTotal=row.documentTotal==null?null:Number(row.documentTotal);
    if(["SUPPLIER_PAYMENT","OTHER_EXPENSE"].includes(row.type)&&!row.hasEvidence)findings.push({code:"EXPENSE_WITHOUT_DOCUMENT",amount});
    if(["SUPPLIER_PAYMENT","OTHER_EXPENSE"].includes(row.type)&&documentTotal!=null&&Math.abs(amount-documentTotal)>.01)findings.push({code:"EXPENSE_DOCUMENT_MISMATCH",amount,difference:Number((amount-documentTotal).toFixed(2))});
    if(row.reversedAt)findings.push({code:"REVERSED_TRANSACTION",amount,actorName:row.reversedByName||row.actorName,at:row.reversedAt,reason:row.reversalReason});
  }
  for(const row of operatorEvents)if(/CANCEL|RETURN|VOID|REVERSE|DUPLICATE|DELAY|OVERRIDE|CREDENTIAL|PERMISSION|LOGOUT/i.test(String(row.eventType||"")))findings.push({code:`AUDIT_${row.eventType}`,actorId:row.actorId,operatorId:row.operatorId,at:row.createdAt});
  const actionsByOriginal=new Map();
  for(const row of actionEvents){
    const amount=platformCashAuditAmount(row.details),type=String(row.actionType||"");
    findings.push({code:`AUDIT_${type}`,saleId:row.saleId,relatedSaleId:row.relatedSaleId,actorName:row.actorName,amount,at:row.createdAt});
    if(session.closedAt&&new Date(row.createdAt)>new Date(session.closedAt))findings.push({code:"ACTION_AFTER_SHIFT_CLOSE",saleId:row.saleId,amount,at:row.createdAt});
    if(/RETURN|CANCEL|VOID/i.test(type)&&!row.relatedSaleId)findings.push({code:"ACTION_WITHOUT_ORIGINAL_SALE",saleId:row.saleId,amount,at:row.createdAt});
    if(row.relatedSaleId){const related=actionsByOriginal.get(row.relatedSaleId)||[];related.push(row);actionsByOriginal.set(row.relatedSaleId,related)}
    if(row.actorId&&row.actorId!==session.openedBy&&row.actorId!==session.closedBy)findings.push({code:"ACTION_BY_DIFFERENT_OPERATOR",saleId:row.saleId,actorName:row.actorName,amount,at:row.createdAt});
    if(amount!=null&&Math.abs(Math.abs(amount)-Math.abs(Number(session.variance||0)))<=.01)findings.push({code:"AMOUNT_MATCHES_CASH_DIFFERENCE",saleId:row.saleId,amount,at:row.createdAt});
  }
  for(const [relatedSaleId,events] of actionsByOriginal)if(events.length>1)findings.push({code:"MULTIPLE_ACTIONS_ON_SAME_SALE",relatedSaleId,count:events.length});
  for(const row of safetyEvents)if(/DUPLICATE|REPLAY|BLOCKED/i.test(String(row.eventType||"")))findings.push({code:`AUDIT_${row.eventType}`,saleId:row.saleId,relatedSaleId:row.relatedSaleId,actorName:row.actorName,amount:platformCashAuditAmount(row.details),at:row.createdAt});
  if(Number(session.duplicateCandidates||0)>0)findings.push({code:"DUPLICATE_CANDIDATES",count:Number(session.duplicateCandidates)});
  if(Math.abs(Number(session.cardVariance||0))>.009)findings.push({code:"POS_EFTPOS_DIFFERENCE",amount:Number(session.cardVariance)});
  const variance=Number(session.variance||0);
  const conclusion=variance<-.009?(findings.length?"SHORTAGE_WITH_FINDINGS":"UNEXPLAINED_SHORTAGE"):variance>.009?(findings.length?"SURPLUS_WITH_FINDINGS":"UNEXPLAINED_SURPLUS"):findings.length?"FINDINGS_WITHOUT_CASH_VARIANCE":"AGREEMENT";
  return{completed:true,checkedAt:new Date(),checks:["CASH_TOTALS","POS_EFTPOS","EXPENSE_DOCUMENTS","REVERSALS","RETURNS_CANCELLATIONS","DUPLICATE_TRANSACTIONS","OPERATOR_EVENTS","POST_CLOSE_EVENTS"],findings,conclusion};
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
    const operatorRows=credentialTable[0]?.tableName?await prisma.$queryRaw`
      SELECT "employeeId","displayName","role",("pinHash" IS NOT NULL OR "cardCodeHash" IS NOT NULL) AS "hasCredential"
      FROM "StoreOperatorCredential"
      WHERE "companyId"=${company.id} AND "storeId"=${store.id} AND "active"=TRUE
      ORDER BY "displayName" ASC
    `:[];
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
      {key:"manager",label:"ΑΠΟΜΑΚΡΥΣΜΕΝΑ — Υπεύθυνος Store Mode",ok:credentials.managers>0,blocking:true,detail:`${credentials.managers} υπεύθυνοι`},
      {key:"pilotProfile",label:"Στοιχεία πιλοτικής εγκατάστασης",ok:Boolean(profile?.pcName&&profile?.operatingHours&&profile?.responsibleName),blocking:true,detail:profile?.pcName&&profile?.operatingHours&&profile?.responsibleName?`${profile.pcName} · ${profile.operatingHours} · ${profile.responsibleName}`:"Συμπληρώστε PC, ωράριο και υπεύθυνο"},
      {key:"backup",label:"ΑΠΟΜΑΚΡΥΣΜΕΝΑ — Επιβεβαιωμένο backup πριν από αλλαγές",ok:Boolean(profile?.backupConfirmedAt),blocking:true,detail:profile?.backupConfirmedAt?`Επιβεβαιώθηκε ${new Date(profile.backupConfirmedAt).toLocaleString("el-GR")}`:"Δεν έχει επιβεβαιωθεί backup"},
      {key:"scopeFreeze",label:"Κλείδωμα design και βάσης δεδομένων",ok:Boolean(profile?.designFrozenAt&&profile?.databaseFrozenAt),blocking:true,detail:profile?.designFrozenAt&&profile?.databaseFrozenAt?"Design και βάση κλειδωμένα για την πιλοτική εγκατάσταση":"Απαιτείται κλείδωμα design και βάσης"},
      {key:"operatorSmoke",label:"ΣΤΟ ΚΑΤ — Δοκιμή εισόδου εργαζομένου",ok:Boolean(profile?.loginTestedAt),blocking:true,detail:profile?.loginTestedAt?`Επιβεβαιώθηκε ${new Date(profile.loginTestedAt).toLocaleString("el-GR")}`:"Εκκρεμεί πραγματική είσοδος με PIN ή κάρτα"},
      {key:"shiftSmoke",label:"ΣΤΟ ΚΑΤ — Δοκιμή ανοίγματος και κλεισίματος βάρδιας",ok:Boolean(profile?.shiftOpenTestedAt&&profile?.shiftCloseTestedAt),blocking:true,detail:profile?.shiftOpenTestedAt&&profile?.shiftCloseTestedAt?"Άνοιγμα και κλείσιμο επιβεβαιώθηκαν":"Εκκρεμεί πραγματική δοκιμή βάρδιας"},
      {key:"kioskIsolation",label:"ΣΤΟ ΚΑΤ — Επιβεβαίωση ανεπηρέαστου Kiosk Manager",ok:Boolean(profile?.kioskUnaffectedAt),blocking:true,detail:profile?.kioskUnaffectedAt?"Kiosk Manager και ταμειακή συνέχισαν κανονικά":"Εκκρεμεί επιβεβαίωση μετά τη δοκιμή"},
      {key:"mail",label:"Email αναφοράς κλεισίματος",ok:!store.cashCloseEmailEnabled||(mail.configured&&emailRecipient),blocking:store.cashCloseEmailEnabled,detail:store.cashCloseEmailEnabled?(mail.configured&&emailRecipient?"SMTP έτοιμο και υπάρχει παραλήπτης":"Ελέγξτε SMTP ή email παραλήπτη"):"Απενεργοποιημένο για το κατάστημα"},
      {key:"posLayout",label:"ΑΠΟΜΑΚΡΥΣΜΕΝΑ — Δημοσιευμένος σχεδιασμός POS",ok:Number(layouts[0]?.total||0)>0,blocking:false,detail:Number(layouts[0]?.total||0)>0?"Έχει δημοσιευτεί στο κατάστημα":"Προαιρετικό για την πρώτη παράλληλη δοκιμή"},
      {key:"openShift",label:"Κατάσταση βάρδιας",ok:true,blocking:false,detail:Number(openShifts[0]?.total||0)>0?"Υπάρχει ανοιχτή βάρδια — μην εκτελέσετε νέα δοκιμή ανοίγματος":"Δεν υπάρχει ανοιχτή βάρδια"},
      {key:"fiscalIsolation",label:"Απομόνωση από RBS / φορολογική λειτουργία",ok:true,blocking:true,detail:"Παράλληλη μη φορολογική λειτουργία — καμία εντολή προς RBS"}
    ];
    const blockers=checks.filter(check=>check.blocking&&!check.ok);
    res.json({ready:blockers.length===0,checkedAt:new Date().toISOString(),company:{id:company.id,name:company.name},store:{id:store.id,name:store.name},profile,operators:operatorRows,checks,blockers:blockers.length});
  }catch(error){next(error)}
});

router.post("/companies/:companyId/stores/:storeId/pilot-backup",async(req,res,next)=>{
  try{
    const company=await prisma.company.findUnique({
      where:{id:req.params.companyId},
      select:{id:true,name:true,taxId:true,city:true,email:true,phone:true,active:true,plan:true,licenseStatus:true,subscriptionStartsAt:true,subscriptionEndsAt:true,autoRenew:true,createdAt:true,updatedAt:true,modules:true,users:{select:{id:true,email:true,fullName:true,role:true,mustChangePassword:true,totpEnabled:true,createdAt:true,updatedAt:true}}}
    });
    const store=company?await prisma.store.findFirst({
      where:{id:req.params.storeId,companyId:company.id},
      include:{employees:{include:{rules:true,availability:true,leaveRequests:true},orderBy:{fullName:"asc"}},shifts:{orderBy:{code:"asc"}},schedules:{include:{assignments:true},orderBy:{weekStart:"desc"}}}
    }):null;
    if(!company||!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});

    // A rolling deploy can briefly expose only part of the commercial schema. Probe
    // every optional table independently so the safety backup remains available and
    // never turns a missing optional table into a Platform Admin error.
    const commercialTables=await prisma.$queryRaw`
      SELECT to_regclass('public."Product"')::text AS "product",
             to_regclass('public."ProductCategory"')::text AS "category",
             to_regclass('public."ProductBarcode"')::text AS "barcode",
             to_regclass('public."StoreProduct"')::text AS "storeProduct",
             to_regclass('public."Supplier"')::text AS "supplier"`;
    const available=commercialTables[0]||{};
    const products=available.product?await prisma.$queryRaw`SELECT * FROM "Product" WHERE "companyId"=${company.id} ORDER BY "name" ASC`:[];
    const categories=available.category?await prisma.$queryRaw`SELECT * FROM "ProductCategory" WHERE "companyId"=${company.id} ORDER BY "sortOrder" ASC,"name" ASC`:[];
    const barcodes=available.barcode&&available.product?await prisma.$queryRaw`SELECT b.* FROM "ProductBarcode" b JOIN "Product" p ON p."id"=b."productId" WHERE p."companyId"=${company.id} ORDER BY b."barcode" ASC`:[];
    const storeProducts=available.storeProduct?await prisma.$queryRaw`SELECT * FROM "StoreProduct" WHERE "storeId"=${store.id} ORDER BY "productId" ASC`:[];
    const suppliers=available.supplier?await prisma.$queryRaw`SELECT * FROM "Supplier" WHERE "companyId"=${company.id} ORDER BY "name" ASC`:[];
    const credentialsTable=await prisma.$queryRaw`SELECT to_regclass('public."StoreOperatorCredential"')::text AS "tableName"`;
    const operators=credentialsTable[0]?.tableName?await prisma.$queryRaw`SELECT "id","employeeId","displayName","role","active","createdAt","updatedAt",("pinHash" IS NOT NULL) AS "hasPin",("cardCodeHash" IS NOT NULL) AS "hasCard" FROM "StoreOperatorCredential" WHERE "companyId"=${company.id} AND "storeId"=${store.id} ORDER BY "displayName" ASC`:[];
    const layoutTable=await prisma.$queryRaw`SELECT to_regclass('public."StorePosLayout"')::text AS "tableName"`;
    const layouts=layoutTable[0]?.tableName?await prisma.$queryRaw`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "companyId"=${company.id} AND "storeId"=${store.id}`:[];
    const generatedAt=new Date();
    const snapshot={
      format:"MYWORKSTATION_PILOT_SAFETY_BACKUP_V1",generatedAt:generatedAt.toISOString(),generatedBy:{id:req.user.id,email:req.user.email||"super-admin"},
      scope:{companyId:company.id,companyName:company.name,storeId:store.id,storeName:store.name},
      security:{containsPasswords:false,containsPinOrCardSecrets:false,restorationRequiresSuperAdmin:true},
      completeness:{
        productCatalog:Boolean(available.product),categories:Boolean(available.category),barcodes:Boolean(available.barcode),
        storeProducts:Boolean(available.storeProduct),suppliers:Boolean(available.supplier)
      },
      company,store,commercial:{categories,products,barcodes,storeProducts,suppliers},storeMode:{operators},pos:{publishedLayouts:layouts}
    };
    const serialized=JSON.stringify(snapshot,(_key,value)=>typeof value==="bigint"?value.toString():value,2);
    const checksum=crypto.createHash("sha256").update(serialized).digest("hex");
    const document=JSON.stringify({...snapshot,integrity:{algorithm:"SHA-256",checksum}},(_key,value)=>typeof value==="bigint"?value.toString():value,2);
    await prisma.$executeRaw`
      INSERT INTO "PilotStoreProfile" ("storeId","companyId","backupConfirmedAt","updatedBy","updatedAt")
      VALUES (${store.id},${company.id},${generatedAt},${req.user.id},CURRENT_TIMESTAMP)
      ON CONFLICT ("storeId") DO UPDATE SET "backupConfirmedAt"=${generatedAt},"updatedBy"=${req.user.id},"updatedAt"=CURRENT_TIMESTAMP`;
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"PILOT_SAFETY_BACKUP_DOWNLOADED",success:true,deviceName:`${store.name} · SHA256 ${checksum.slice(0,16)}`,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
    const date=generatedAt.toISOString().slice(0,10);
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="MyWorkStation_${date}_pilot-safety-backup.json"`);
    res.setHeader("X-Backup-SHA256",checksum);
    res.send(document);
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId/store-mode-manager",async(req,res,next)=>{
  try{
    const body=z.object({employeeId:z.string().trim().min(1)}).parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.params.companyId},select:{id:true,companyId:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const selected=await prisma.$queryRaw`
      SELECT "id","employeeId","displayName",("pinHash" IS NOT NULL OR "cardCodeHash" IS NOT NULL) AS "hasCredential"
      FROM "StoreOperatorCredential"
      WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "employeeId"=${body.employeeId} AND "active"=TRUE
      LIMIT 1
    `;
    if(!selected[0])return res.status(404).json({error:"Δεν βρέθηκε ενεργός εργαζόμενος στο Store Mode."});
    if(!selected[0].hasCredential)return res.status(400).json({error:"Ο εργαζόμενος χρειάζεται πρώτα ενεργό PIN ή κάρτα."});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreOperatorCredential" SET "role"='EMPLOYEE',"updatedAt"=NOW() WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "role"='MANAGER'`;
      await tx.$executeRaw`UPDATE "StoreOperatorCredential" SET "role"='MANAGER',"updatedAt"=NOW() WHERE "id"=${selected[0].id}`;
    });
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"STORE_MODE_MANAGER_ASSIGNED",success:true,deviceName:`${selected[0].displayName} · ${store.id}`}});
    res.json({ok:true,employeeId:selected[0].employeeId,displayName:selected[0].displayName});
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId/pilot-profile",async(req,res,next)=>{
  try{
    const body=z.object({
      pcName:z.string().trim().min(2).max(120),
      operatingHours:z.string().trim().min(3).max(160),
      responsibleName:z.string().trim().min(2).max(160),
      notes:z.string().trim().max(1000).optional().or(z.literal("")),
      designFrozen:z.boolean(),databaseFrozen:z.boolean(),
      loginTested:z.boolean(),shiftOpenTested:z.boolean(),shiftCloseTested:z.boolean(),kioskUnaffected:z.boolean()
    }).parse(req.body||{});
    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.params.companyId}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα στον συγκεκριμένο πελάτη."});
    const now=new Date();
    const rows=await prisma.$queryRaw`
      INSERT INTO "PilotStoreProfile" ("storeId","companyId","pcName","operatingHours","responsibleName","notes","backupConfirmedAt","designFrozenAt","databaseFrozenAt","loginTestedAt","shiftOpenTestedAt","shiftCloseTestedAt","kioskUnaffectedAt","updatedBy","updatedAt")
      VALUES (${store.id},${store.companyId},${body.pcName},${body.operatingHours},${body.responsibleName},${body.notes||null},NULL,${body.designFrozen?now:null},${body.databaseFrozen?now:null},${body.loginTested?now:null},${body.shiftOpenTested?now:null},${body.shiftCloseTested?now:null},${body.kioskUnaffected?now:null},${req.user.id},CURRENT_TIMESTAMP)
      ON CONFLICT ("storeId") DO UPDATE SET "pcName"=EXCLUDED."pcName","operatingHours"=EXCLUDED."operatingHours","responsibleName"=EXCLUDED."responsibleName","notes"=EXCLUDED."notes",
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

router.post("/support-access/exit",async(req,res,next)=>{
  try{
    const context=req.user?.supportContext;
    if(!context?.companyId){
      return res.status(400).json({error:"Δεν υπάρχει ενεργή πρόσβαση υποστήριξης πελάτη."});
    }
    const company=await prisma.company.findUnique({where:{id:context.companyId},select:{id:true,name:true}});
    const store=context.storeId
      ?await prisma.store.findFirst({where:{id:context.storeId,companyId:context.companyId},select:{id:true,name:true}})
      :null;
    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:"SUPER_ADMIN_SUPPORT_EXIT",
      success:true,
      deviceName:`${company?.name||context.companyName||context.companyId}${store?` · ${store.name}`:context.storeName?` · ${context.storeName}`:""}`,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});
    res.json({ok:true});
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

    const company=await prisma.company.findUnique({where:{id:req.params.companyId},include:{modules:true}});
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

router.delete("/companies/:companyId",async(req,res,next)=>{
  try{
    const body=z.object({
      confirmationName:z.string().trim(),
      confirmationPhrase:z.string().trim()
    }).parse(req.body||{});
    const company=await prisma.company.findUnique({
      where:{id:req.params.companyId},
      include:{
        users:{select:{id:true}},
        stores:{select:{id:true,_count:{select:{employees:true}}}}
      }
    });
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});
    if(!deletableTestCompanyNames.has(company.name)){
      return res.status(403).json({error:"Η οριστική διαγραφή επιτρέπεται μόνο για ρητά εγκεκριμένες δοκιμαστικές εταιρείες."});
    }
    if(body.confirmationName!==company.name||body.confirmationPhrase!==permanentDeletePhrase){
      return res.status(400).json({error:`Για οριστική διαγραφή γράψε ακριβώς «${company.name}» και «${permanentDeletePhrase}».`});
    }
    const counts={
      stores:company.stores.length,
      users:company.users.length,
      employees:company.stores.reduce((sum,store)=>sum+(store._count?.employees||0),0)
    };
    await prisma.$transaction(async tx=>{
      await tx.company.delete({where:{id:company.id}});
      await tx.authAudit.create({data:{
        userId:req.user.id,
        email:req.user.email||"platform-admin",
        event:`TEST_COMPANY_PERMANENTLY_DELETED:${company.id}:${company.name}:stores=${counts.stores}:users=${counts.users}:employees=${counts.employees}`,
        success:true,
        deviceName:req.headers["x-device-name"]||null,
        userAgent:req.headers["user-agent"]||null,
        ipAddress:req.ip||null
      }});
    });
    res.json({ok:true,deleted:{id:company.id,name:company.name,...counts}});
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

router.get("/cash-control/daily",async(req,res,next)=>{
  try{
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const filters=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(today),fromTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("00:00"),toTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("23:59")}).parse(req.query);
    const {date,fromTime,toTime}=filters;
    const rows=await prisma.$queryRaw`
      SELECT c."id" AS "companyId",c."name" AS "companyName",st."id" AS "storeId",st."name" AS "storeName",
        s."id" AS "sessionId",s."terminalPos",s."shiftLabel",s."openedBy",s."closedBy",s."openedByName",s."closedByName",s."openedAt",s."closedAt",
        s."cashSales",s."cardSales",s."eftposTotal",s."cardVariance",s."expenses",s."expectedOperational",s."actualOperational",s."variance",
        COALESCE(jsonb_array_length(s."duplicateReviewJson"),0) AS "duplicateCandidates",
        COUNT(t."id") FILTER (WHERE t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND t."reversedAt" IS NULL) AS "expenseCount",
        COUNT(t."id") FILTER (WHERE t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND t."reversedAt" IS NULL AND t."attachmentData" IS NULL AND COALESCE(t."attachmentMimeType",'')<>'application/vnd.myworkstation.purchase-document') AS "expensesWithoutDocument"
      FROM "CashShiftSession" s
      JOIN "Store" st ON st."id"=s."storeId"
      JOIN "Company" c ON c."id"=s."companyId" AND c."id"=st."companyId"
      LEFT JOIN "StoreTransaction" t ON t."sessionId"=s."id" AND t."companyId"=s."companyId" AND t."storeId"=s."storeId"
      WHERE s."status"='CLOSED' AND (s."closedAt" AT TIME ZONE 'Europe/Athens')::date=${date}::date
        AND ((${fromTime}::time<=${toTime}::time AND (s."closedAt" AT TIME ZONE 'Europe/Athens')::time BETWEEN ${fromTime}::time AND ${toTime}::time)
          OR (${fromTime}::time>${toTime}::time AND ((s."closedAt" AT TIME ZONE 'Europe/Athens')::time>=${fromTime}::time OR (s."closedAt" AT TIME ZONE 'Europe/Athens')::time<=${toTime}::time)))
      GROUP BY c."id",c."name",st."id",st."name",s."id"
      ORDER BY c."name",st."name",s."openedAt"`;
    const normalized=rows.map(row=>({...row,cashSales:Number(row.cashSales||0),cardSales:Number(row.cardSales||0),eftposTotal:Number(row.eftposTotal||0),cardVariance:Number(row.cardVariance||0),expenses:Number(row.expenses||0),expectedOperational:Number(row.expectedOperational||0),actualOperational:Number(row.actualOperational||0),variance:Number(row.variance||0),duplicateCandidates:Number(row.duplicateCandidates||0),expenseCount:Number(row.expenseCount||0),expensesWithoutDocument:Number(row.expensesWithoutDocument||0)}));
    const auditTableRows=await prisma.$queryRaw`SELECT to_regclass('"StoreOperatorAudit"') AS "operator",to_regclass('"PosSaleActionAudit"') AS "actions",to_regclass('"PosSaleSafetyAudit"') AS "safety"`;
    const investigated=await Promise.all(normalized.map(async row=>({...row,investigation:await platformCashInvestigation(row,auditTableRows[0]||{})})));
    const totals=normalized.reduce((sum,row)=>{sum.shifts++;sum.cashSales+=row.cashSales;sum.cardSales+=row.cardSales;sum.eftposTotal+=row.eftposTotal;sum.expenses+=row.expenses;sum.variance+=row.variance;sum.shortage+=row.variance<0?Math.abs(row.variance):0;sum.surplus+=row.variance>0?row.variance:0;sum.cardVariance+=row.cardVariance;sum.duplicateCandidates+=row.duplicateCandidates;sum.expensesWithoutDocument+=row.expensesWithoutDocument;return sum},{shifts:0,cashSales:0,cardSales:0,eftposTotal:0,expenses:0,variance:0,shortage:0,surplus:0,cardVariance:0,duplicateCandidates:0,expensesWithoutDocument:0});
    const byStore=new Map();
    for(const row of normalized){const current=byStore.get(row.storeId)||{companyId:row.companyId,companyName:row.companyName,storeId:row.storeId,storeName:row.storeName,shifts:0,shortage:0,surplus:0,variance:0,cardVariance:0,expensesWithoutDocument:0,duplicateCandidates:0};current.shifts++;current.variance+=row.variance;current.shortage+=row.variance<0?Math.abs(row.variance):0;current.surplus+=row.variance>0?row.variance:0;current.cardVariance+=row.cardVariance;current.expensesWithoutDocument+=row.expensesWithoutDocument;current.duplicateCandidates+=row.duplicateCandidates;byStore.set(row.storeId,current)}
    res.json({date,fromTime,toTime,timeZone:"Europe/Athens",rows:investigated,stores:[...byStore.values()],totals});
  }catch(error){next(error)}
});

router.get("/cash-control/shortages",async(req,res,next)=>{try{
  const range=z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fromTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("00:00"),toTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("23:59"),storeId:z.string().trim().optional(),operator:z.string().trim().max(180).optional()}).parse(req.query);
  if(range.from>range.to)return res.status(422).json({error:"Η ημερομηνία Από πρέπει να είναι πριν από την ημερομηνία Έως."});
  const rows=await prisma.$queryRaw`
    SELECT c."name" AS "companyName",st."id" AS "storeId",st."name" AS "storeName",s."id" AS "sessionId",
      (s."closedAt" AT TIME ZONE 'Europe/Athens')::date::text AS "date",s."openedAt",s."closedAt",s."shiftLabel",s."terminalPos",s."openedByName",s."closedByName",s."variance",s."cardVariance"
    FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId" JOIN "Company" c ON c."id"=s."companyId" AND c."id"=st."companyId"
    WHERE s."status"='CLOSED' AND s."variance"<0
      AND (s."closedAt" AT TIME ZONE 'Europe/Athens')::date BETWEEN ${range.from}::date AND ${range.to}::date
      AND ((${range.fromTime}::time<=${range.toTime}::time AND (s."closedAt" AT TIME ZONE 'Europe/Athens')::time BETWEEN ${range.fromTime}::time AND ${range.toTime}::time)
        OR (${range.fromTime}::time>${range.toTime}::time AND ((s."closedAt" AT TIME ZONE 'Europe/Athens')::time>=${range.fromTime}::time OR (s."closedAt" AT TIME ZONE 'Europe/Athens')::time<=${range.toTime}::time)))
      AND (${range.storeId||null}::text IS NULL OR st."id"=${range.storeId||null})
      AND (${range.operator||null}::text IS NULL OR COALESCE(s."openedByName",s."closedByName",'') ILIKE ${range.operator?`%${range.operator}%`:null})
    ORDER BY "date",c."name",st."name",s."openedAt"`;
  const normalized=rows.map(row=>({...row,variance:Number(row.variance||0),shortage:Math.abs(Number(row.variance||0)),cardVariance:Number(row.cardVariance||0)}));
  const byOperator=new Map();for(const row of normalized){const name=row.openedByName||row.closedByName||"Χωρίς χειριστή";const current=byOperator.get(name)||{operatorName:name,shifts:0,shortage:0};current.shifts++;current.shortage+=row.shortage;byOperator.set(name,current)}
  res.json({from:range.from,to:range.to,fromTime:range.fromTime,toTime:range.toTime,storeId:range.storeId||null,operator:range.operator||null,rows:normalized,operators:[...byOperator.values()],totalShortage:normalized.reduce((sum,row)=>sum+row.shortage,0),timeZone:"Europe/Athens"});
}catch(error){next(error)}});

async function cashReportEmailData(storeId,date){
  const store=await prisma.store.findUnique({where:{id:storeId},select:{id:true,name:true,responsibleEmail:true,companyId:true,company:{select:{users:{where:{role:"OWNER"},select:{email:true}}}}}});
  if(!store)return null;
  const rows=await prisma.$queryRaw`SELECT s."id" AS "sessionId",s."shiftLabel",s."terminalPos",s."openedByName",s."variance",s."cardVariance",r."decision" AS "reviewDecision",r."actorName" AS "reviewedBy",r."createdAt" AS "reviewedAt",mv."lastMovementAt",(r."id" IS NOT NULL AND (mv."lastMovementAt" IS NULL OR r."createdAt">=mv."lastMovementAt")) AS "reviewValid" FROM "CashShiftSession" s LEFT JOIN LATERAL (SELECT cr."id",cr."decision",cr."actorName",cr."createdAt" FROM "CashControlReview" cr WHERE cr."companyId"=s."companyId" AND cr."storeId"=s."storeId" AND cr."sessionId"=s."id" ORDER BY cr."createdAt" DESC LIMIT 1) r ON TRUE LEFT JOIN LATERAL (SELECT MAX(GREATEST(t."createdAt",COALESCE(t."reversedAt",t."createdAt"))) AS "lastMovementAt" FROM "StoreTransaction" t WHERE t."companyId"=s."companyId" AND t."storeId"=s."storeId" AND t."sessionId"=s."id") mv ON TRUE WHERE s."storeId"=${storeId} AND s."companyId"=${store.companyId} AND s."status"='CLOSED' AND (s."closedAt" AT TIME ZONE 'Europe/Athens')::date=${date}::date ORDER BY s."openedAt"`;
  const recipients=[...new Set([...store.company.users.map(row=>row.email),store.responsibleEmail].map(value=>String(value||"").trim().toLowerCase()).filter(Boolean))];
  return {store,recipients,rows:rows.map(row=>({...row,variance:Number(row.variance||0),cardVariance:Number(row.cardVariance||0),reviewValid:Boolean(row.reviewValid)}))};
}

router.get("/cash-control/stores/:storeId/email-preview",async(req,res,next)=>{try{
  const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(String(req.query.date||""));
  const report=await cashReportEmailData(req.params.storeId,date);if(!report)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  res.json({date,storeId:report.store.id,storeName:report.store.name,recipients:report.recipients,rows:report.rows,readyToSend:report.rows.length>0&&report.rows.every(row=>row.reviewValid),manualSendOnly:true});
}catch(error){next(error)}});

router.post("/cash-control/stores/:storeId/send-email",async(req,res,next)=>{try{
  const body=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),comment:z.string().trim().max(2000).optional().default("")}).parse(req.body||{});
  const report=await cashReportEmailData(req.params.storeId,body.date);if(!report)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  if(!report.rows.length)return res.status(422).json({error:"Δεν υπάρχουν κλεισμένες βάρδιες για αυτή την ημερομηνία."});
  if(report.rows.some(row=>!row.reviewValid))return res.status(409).json({error:"Η αναφορά δεν μπορεί να σταλεί: υπάρχει βάρδια χωρίς ολοκληρωμένο έλεγχο ή με νεότερη κίνηση που απαιτεί επανέλεγχο.",code:"CASH_CONTROL_RECHECK_REQUIRED"});
  if(!report.recipients.length)return res.status(422).json({error:"Δεν έχει οριστεί email ιδιοκτήτη ή υπευθύνου."});
  const sent=await sendCashControlDailyReportEmail({to:report.recipients,storeName:report.store.name,date:body.date,rows:report.rows,comment:body.comment,auditorName:req.user.fullName||req.user.email||"Super Admin"});
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"CASH_CONTROL_REPORT_EMAIL_SENT",success:true,deviceName:`${report.store.name} · ${body.date} · ${sent.recipients.join(", ")}`}});
  res.json({ok:true,recipients:sent.recipients,messageId:sent.messageId});
}catch(error){next(error)}});

router.post("/cash-control/stores/:storeId/send-preview",async(req,res,next)=>{try{
  const body=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),comment:z.string().trim().max(2000).optional().default("")}).parse(req.body||{});
  const recipient=String(req.user.email||"").trim().toLowerCase();if(!recipient)return res.status(422).json({error:"Δεν έχει οριστεί email στον λογαριασμό Super Admin."});
  const report=await cashReportEmailData(req.params.storeId,body.date);if(!report)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  if(!report.rows.length)return res.status(422).json({error:"Δεν υπάρχουν κλεισμένες βάρδιες για αυτή την ημερομηνία."});
  const sent=await sendCashControlDailyReportEmail({to:[recipient],storeName:report.store.name,date:body.date,rows:report.rows,comment:body.comment,auditorName:req.user.fullName||req.user.email||"Super Admin"});
  await prisma.authAudit.create({data:{userId:req.user.id,email:recipient,event:"CASH_CONTROL_REPORT_PREVIEW_SENT",success:true,deviceName:`${report.store.name} · ${body.date}`}});
  res.json({ok:true,recipients:sent.recipients,messageId:sent.messageId,previewOnly:true});
}catch(error){next(error)}});

export default router;
