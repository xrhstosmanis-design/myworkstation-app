import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

router.post("/login", async (req,res,next)=>{
  try{
    const {email,password}=z.object({email:z.string().email(),password:z.string().min(6)}).parse(req.body);
    const user=await prisma.user.findUnique({where:{email},include:{company:true}});
    if(!user || !(await bcrypt.compare(password,user.passwordHash)))
      return res.status(401).json({error:"Λανθασμένο email ή κωδικός."});
    const token=jwt.sign({id:user.id,companyId:user.companyId,role:user.role},process.env.JWT_SECRET,{expiresIn:"12h"});
    res.json({token,user:{id:user.id,email:user.email,fullName:user.fullName,role:user.role,company:user.company}});
  }catch(e){next(e)}
});

export default router;
