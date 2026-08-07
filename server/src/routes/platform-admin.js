import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { catalogView,moduleCatalog,moduleKeys,planDefaults } from "../services/module-catalog.js";

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
    stores:company.stores.map(store=>({id:store.id,name:store.name,city:store.city,active:store.active,employees:store._count?.employees||0})),
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
          select:{id:true,name:true,city:true,active:true,_count:{select:{employees:true}}},
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
