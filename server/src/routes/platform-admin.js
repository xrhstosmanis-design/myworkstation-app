import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed) return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const plans=["TRIAL","PILOT","BASIC","PRO","ENTERPRISE"];
const planSchema=z.enum(plans);

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
        stores:{
          select:{id:true,name:true,city:true,active:true,_count:{select:{employees:true}}},
          orderBy:{name:"asc"}
        }
      },
      orderBy:{createdAt:"desc"}
    });
    const rows=companies.map(companyView);
    res.json({
      stats:{
        companies:rows.length,
        activeCompanies:rows.filter(row=>row.active).length,
        trialCompanies:rows.filter(row=>row.plan==="TRIAL").length,
        stores:rows.reduce((total,row)=>total+row.storeCount,0),
        users:rows.reduce((total,row)=>total+row.userCount,0),
        employees:rows.reduce((total,row)=>total+row.employeeCount,0)
      },
      companies:rows,
      plans,
      platformCompanyId:req.user.companyId
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
          trialEndsAt
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
      return {company,owner,store};
    });

    res.status(201).json({
      company:{id:created.company.id,name:created.company.name,plan:created.company.plan,active:created.company.active,trialEndsAt:created.company.trialEndsAt},
      owner:{id:created.owner.id,fullName:created.owner.fullName,email:created.owner.email},
      store:{id:created.store.id,name:created.store.name}
    });
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
    if(company.id===req.user.companyId&&body.active===false){
      return res.status(400).json({error:"Δεν μπορείς να απενεργοποιήσεις την εταιρεία της πλατφόρμας."});
    }
    const data={};
    if(body.active!==undefined)data.active=body.active;
    if(body.plan!==undefined){
      data.plan=body.plan;
      if(body.plan!=="TRIAL")data.trialEndsAt=null;
    }
    if(body.trialDays!==undefined){
      data.plan="TRIAL";
      data.trialEndsAt=new Date(Date.now()+body.trialDays*24*60*60*1000);
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
