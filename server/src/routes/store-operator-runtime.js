import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();

router.get("/stores/:storeId/access",async(req,res,next)=>{
  try{
    if(req.user?.tokenType!=="STORE_OPERATOR"||req.user.storeId!==req.params.storeId)return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για τον ενεργό χειριστή."});
    const rows=await prisma.$queryRaw`SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions",COALESCE(p."posAccess",TRUE) AS "posAccess" FROM "StoreOperatorCredential" c LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${req.user.id} AND c."companyId"=${req.user.companyId} AND c."storeId"=${req.params.storeId} AND c."active"=TRUE LIMIT 1`;
    if(!rows[0])return res.status(403).json({error:"Δεν βρέθηκε ενεργή καρτέλα χειριστή."});
    const p=rows[0].permissions&&typeof rows[0].permissions==="object"?rows[0].permissions:{};
    res.json({posAccess:rows[0].posAccess!==false,shiftTransactionsPos:Boolean(p.shiftTransactionsPos),allShiftTransactionsPos:Boolean(p.allShiftTransactionsPos),closeShiftPos:Boolean(p.centralCashPos)});
  }catch(error){next(error)}
});

export default router;
