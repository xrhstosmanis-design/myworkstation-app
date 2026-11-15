import {prisma} from "../prisma.js";
import { Router } from "express";
import { getMailStatus,sendTestEmail,sendMonthlyTurnoverTestEmail } from "../services/mail.js";

const router=Router();

function requireSuperAdmin(req,res,next){
  if(req.user?.role!=="SUPER_ADMIN"&&!req.user?.isSuperAdmin){
    return res.status(403).json({error:"Η λειτουργία επιτρέπεται μόνο στον SUPER_ADMIN."});
  }
  next();
}

router.use(requireSuperAdmin);

const labTurnoverTestEnabled=req=>!req.user?.supportContext && req.user?.role === "SUPER_ADMIN" && process.env.MONTHLY_TURNOVER_LAB_SMTP_TEST === "true" && Boolean(process.env.MONTHLY_TURNOVER_LAB_STORE_ID);

router.get("/status",(req,res)=>res.json({...getMailStatus(),labTurnoverTestEnabled:labTurnoverTestEnabled(req)}));

router.post("/test",async(req,res,next)=>{
  try{
    const result=await sendTestEmail();
    res.json({ok:true,...result});
  }catch(error){
    next(error);
  }
});

router.post("/test/monthly-turnover",async(req,res)=>{
  try{
    if(!labTurnoverTestEnabled(req)){
      return res.status(403).json({error:"Η δοκιμή μηνιαίου τζίρου δεν είναι ενεργή για αυτή τη συνεδρία."});
    }
    const storeId=process.env.MONTHLY_TURNOVER_LAB_STORE_ID;
    const store=storeId && await prisma.store.findFirst({
      where:{id:storeId,active:true,name:"ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",company:{name:"MYWORKSTATION LAB",active:true}},
      select:{id:true,companyId:true},
    });
    if(!store)return res.status(403).json({error:"Δεν έχει οριστεί ενεργό κατάστημα LAB."});
    const result=await sendMonthlyTurnoverTestEmail({companyId:store.companyId,storeId:store.id});
    return res.json({ok:true,...result});
  }catch{
    return res.status(503).json({error:"Η δοκιμαστική παράδοση SMTP δεν επιβεβαιώθηκε."});
  }
});

export default router;
