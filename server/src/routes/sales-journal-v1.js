import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();

router.get("/sales-journal",requireCompanyModule("SALES_ANALYTICS"),async(req,res,next)=>{
  try{
    const storeId=req.query.storeId?String(req.query.storeId):null;
    if(storeId){
      const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true}});
      if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    }
    const to=req.query.to?new Date(String(req.query.to)):new Date();
    const from=req.query.from?new Date(String(req.query.from)):new Date(to.getTime()-30*86400000);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
    const rows=await prisma.$queryRaw`
      SELECT s."id" AS "saleId",s."occurredAt",s."status",s."total",st."name" AS "storeName",
             COALESCE(e."fullName",'Χωρίς εργαζόμενο') AS "employeeName",
             COALESCE(cu."name",'') AS "customerName",
             COALESCE(json_agg(json_build_object(
               'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal"
             ) ORDER BY l."id") FILTER (WHERE l."id" IS NOT NULL),'[]') AS "items",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]') AS "payments"
      FROM "Sale" s
      JOIN "Store" st ON st."id"=s."storeId"
      LEFT JOIN "Employee" e ON e."id"=s."operatorEmployeeId"
      LEFT JOIN "Customer" cu ON cu."id"=s."customerId"
      LEFT JOIN "SaleLine" l ON l."saleId"=s."id"
      WHERE s."companyId"=${req.user.companyId}
        AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
        AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
      GROUP BY s."id",st."name",e."fullName",cu."name"
      ORDER BY s."occurredAt" DESC
      LIMIT 500`;
    res.json({from,to,rows});
  }catch(error){next(error)}
});

export default router;
