import { Router } from "express";
import { getMailStatus,sendTestEmail } from "../services/mail.js";

const router=Router();

function requireSuperAdmin(req,res,next){
  if(req.user?.role!=="SUPER_ADMIN"&&!req.user?.isSuperAdmin){
    return res.status(403).json({error:"Η λειτουργία επιτρέπεται μόνο στον SUPER_ADMIN."});
  }
  next();
}

router.use(requireSuperAdmin);

router.get("/status",(req,res)=>res.json(getMailStatus()));

router.post("/test",async(req,res,next)=>{
  try{
    const result=await sendTestEmail();
    res.json({ok:true,...result});
  }catch(error){
    next(error);
  }
});

export default router;
