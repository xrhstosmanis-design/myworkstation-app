import {Router} from "express";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import fixedPosDesignerRoutes from "./platform-pos-designer-fixed.js";
import platformWorkforceV2Routes from "./platform-workforce-v2.js";

const router=Router();
router.use(auth);

// This is the first generic /api/platform router in the server composition.
// Expose only the exact Workforce v2 path to OWNER / ADMIN / MANAGER before the
// generic Platform Super Admin gate. Package activation and every other
// store-module operation remain available only through the Super Admin router.
router.use(
  "/store-modules/companies/:companyId/stores/:storeId/workforce-v2",
  platformWorkforceV2Routes
);

router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

router.use("/pos-designer-fixed",fixedPosDesignerRoutes);

router.put("/companies/:companyId/owner",async(req,res,next)=>{
  try{
    const body=z.object({
      fullName:z.string().trim().min(2).max(160),
      email:z.string().trim().email(),
      temporaryPassword:z.string().min(8).max(100).optional().or(z.literal(""))
    }).parse(req.body||{});
    const company=await prisma.company.findUnique({where:{id:req.params.companyId}});
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε πελάτης."});

    const currentOwner=await prisma.user.findFirst({where:{companyId:company.id,role:"OWNER"}});
    const emailUser=await prisma.user.findUnique({where:{email:body.email}});
    if(emailUser&&emailUser.id!==currentOwner?.id){
      return res.status(409).json({error:"Το email χρησιμοποιείται ήδη από άλλον λογαριασμό."});
    }
    if(!currentOwner&&!body.temporaryPassword){
      return res.status(400).json({error:"Για νέο ιδιοκτήτη απαιτείται προσωρινός κωδικός τουλάχιστον 8 χαρακτήρων."});
    }

    let owner;
    if(currentOwner){
      const updateData={fullName:body.fullName,email:body.email,role:"OWNER",companyId:company.id};
      if(body.temporaryPassword){
        updateData.passwordHash=await bcrypt.hash(body.temporaryPassword,12);
        updateData.mustChangePassword=true;
        updateData.sessionVersion={increment:1};
      }
      owner=await prisma.user.update({where:{id:currentOwner.id},data:updateData});
    }else{
      owner=await prisma.user.create({
        data:{
          fullName:body.fullName,
          email:body.email,
          role:"OWNER",
          companyId:company.id,
          passwordHash:await bcrypt.hash(body.temporaryPassword,12),
          mustChangePassword:true
        }
      });
    }

    if(body.temporaryPassword){
      await prisma.userSession.updateMany({
        where:{userId:owner.id,revokedAt:null},
        data:{revokedAt:new Date()}
      });
    }

    res.json({
      id:owner.id,
      fullName:owner.fullName,
      email:owner.email,
      role:owner.role,
      companyId:owner.companyId,
      mustChangePassword:owner.mustChangePassword
    });
  }catch(error){next(error)}
});

router.post("/companies/:companyId/reset-owner-password",async(req,res,next)=>{
  try{
    const body=z.object({temporaryPassword:z.string().min(8).max(100)}).parse(req.body||{});
    const owner=await prisma.user.findFirst({where:{companyId:req.params.companyId,role:"OWNER"}});
    if(!owner)return res.status(404).json({error:"Δεν βρέθηκε ιδιοκτήτης πελάτη."});

    const updated=await prisma.user.update({
      where:{id:owner.id},
      data:{
        passwordHash:await bcrypt.hash(body.temporaryPassword,12),
        mustChangePassword:true,
        sessionVersion:{increment:1}
      }
    });
    await prisma.userSession.updateMany({
      where:{userId:owner.id,revokedAt:null},
      data:{revokedAt:new Date()}
    });

    res.json({
      ok:true,
      owner:{id:updated.id,fullName:updated.fullName,email:updated.email,mustChangePassword:true}
    });
  }catch(error){next(error)}
});

export default router;
