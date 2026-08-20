import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

const router=Router();
router.use(auth);

function assertOperator(req,storeId){
  if(req.user?.tokenType!=="STORE_OPERATOR"){
    const error=new Error("Η ολοκλήρωση Online παραγγελίας γίνεται μόνο από το POS καταστήματος.");error.status=403;throw error;
  }
  if(String(req.user.storeId||"")!==String(storeId||"")){
    const error=new Error("Η Online παραγγελία δεν ανήκει στο κατάστημά σου.");error.status=403;throw error;
  }
}

router.post("/stores/:storeId/orders/:orderId/complete-from-pos",async(req,res,next)=>{
  try{
    assertOperator(req,req.params.storeId);
    const saleId=String(req.body?.saleId||"").trim();
    if(!saleId)return res.status(400).json({error:"Λείπει το saleId της πώλησης POS."});
    const paymentMethod=String(req.body?.paymentMethod||"").toUpperCase();
    const result=await prisma.$transaction(async tx=>{
      const order=(await tx.$queryRaw`
        SELECT o."id",o."orderNumber",o."storeId",o."companyId",o."status",o."saleId",o."total",o."paymentMethod"
        FROM "OnlineOrder" o
        WHERE o."id"=${req.params.orderId} AND o."storeId"=${req.params.storeId} AND o."companyId"=${req.user.companyId}
        FOR UPDATE`)[0];
      if(!order){const error=new Error("Η Online παραγγελία δεν βρέθηκε.");error.status=404;throw error}
      if(order.saleId){
        if(String(order.saleId)===saleId)return{orderNumber:order.orderNumber,saleId,status:order.status,replay:true};
        const error=new Error("Η Online παραγγελία έχει ήδη συνδεθεί με άλλη πώληση.");error.status=409;throw error;
      }
      if(!["READY","OUT_FOR_DELIVERY"].includes(String(order.status))){
        const error=new Error("Η Online παραγγελία δεν είναι ακόμη έτοιμη για πληρωμή στο POS.");error.status=409;throw error;
      }
      const sale=(await tx.$queryRaw`
        SELECT s."id",s."storeId",s."companyId",s."status",s."total"
        FROM "Sale" s WHERE s."id"=${saleId} AND s."storeId"=${req.params.storeId} AND s."companyId"=${req.user.companyId}
        LIMIT 1`)[0];
      if(!sale||sale.status!=="COMPLETED"){const error=new Error("Η πώληση POS δεν ολοκληρώθηκε.");error.status=409;throw error}
      const expected=Number(order.total||0),actual=Number(sale.total||0);
      if(Math.abs(expected-actual)>0.011){const error=new Error(`Το σύνολο POS (${actual.toFixed(2)} €) δεν συμφωνεί με την Online παραγγελία (${expected.toFixed(2)} €).`);error.status=409;throw error}
      const method=paymentMethod==="CARD"?"CARD":paymentMethod==="CASH"?"CASH":order.paymentMethod;
      await tx.$executeRaw`
        UPDATE "OnlineOrder"
        SET "status"='DELIVERED',"saleId"=${saleId},"commercialPostedAt"=NOW(),"deliveredAt"=NOW(),"paymentMethod"=${method},"assignedEmployeeId"=COALESCE(${req.user.employeeId||null},"assignedEmployeeId"),"updatedAt"=NOW()
        WHERE "id"=${order.id}`;
      await tx.$executeRaw`
        INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","fromStatus","toStatus","userId","employeeId","note")
        VALUES (${crypto.randomUUID()},${order.id},${order.status},'DELIVERED',${null},${req.user.employeeId||null},${`POS_CHECKOUT_COMPLETED · sale ${saleId}`})`;
      return{orderNumber:order.orderNumber,saleId,status:"DELIVERED",replay:false};
    });
    res.json({ok:true,...result});
  }catch(error){next(error)}
});

export default router;
