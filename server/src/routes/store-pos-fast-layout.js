import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();

router.get("/stores/:storeId/fast-layout",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==req.params.storeId)return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα."});
    const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});
    const rows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id);
    res.json({store,layout:rows[0]?.layoutJson||null,layoutVersion:Number(rows[0]?.version||0),publishedAt:rows[0]?.publishedAt||null});
  }catch(error){next(error)}
});

export default router;
