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
    const requestedMethod=String(req.body?.paymentMethod||"").toUpperCase();
    if(!["CASH","CARD"].includes(requestedMethod))return res.status(400).json({error:"Ο τρόπος πληρωμής POS δεν είναι έγκυρος."});

    const result=await prisma.$transaction(async tx=>{
      const order=(await tx.$queryRaw`
        SELECT o."id",o."orderNumber",o."storeId",o."companyId",o."status",o."saleId",o."total",o."paymentMethod",o."paymentStatus"
        FROM "OnlineOrder" o
        WHERE o."id"=${req.params.orderId} AND o."storeId"=${req.params.storeId} AND o."companyId"=${req.user.companyId}
        FOR UPDATE`)[0];
      if(!order){const error=new Error("Η Online παραγγελία δεν βρέθηκε.");error.status=404;throw error}
      if(order.saleId&&String(order.saleId)!==saleId){const error=new Error("Η Online παραγγελία έχει ήδη συνδεθεί με άλλη πώληση.");error.status=409;throw error}
      if(String(order.status)==="DELIVERED"&&String(order.saleId||"")===saleId)return{orderNumber:order.orderNumber,saleId,status:"DELIVERED",replay:true};
      if(!["READY","OUT_FOR_DELIVERY"].includes(String(order.status))){
        const error=new Error("Η Online παραγγελία δεν είναι ακόμη έτοιμη για πληρωμή στο POS.");error.status=409;throw error;
      }

      const sale=(await tx.$queryRaw`
        SELECT s."id",s."storeId",s."companyId",s."status",s."total",s."source",
               COALESCE((SELECT SUM(p."amount") FROM "Payment" p WHERE p."saleId"=s."id"),0) AS "paidTotal",
               COALESCE((SELECT COUNT(*)::int FROM "Payment" p WHERE p."saleId"=s."id" AND p."method"=${requestedMethod}),0) AS "methodCount",
               COALESCE((SELECT COUNT(*)::int FROM "Payment" p WHERE p."saleId"=s."id" AND p."method"<>${requestedMethod}),0) AS "otherMethodCount"
        FROM "Sale" s
        WHERE s."id"=${saleId} AND s."storeId"=${req.params.storeId} AND s."companyId"=${req.user.companyId}
        LIMIT 1`)[0];
      if(!sale||sale.status!=="COMPLETED"){const error=new Error("Η πώληση POS δεν ολοκληρώθηκε.");error.status=409;throw error}

      const expected=Number(order.total||0),actual=Number(sale.total||0),paid=Number(sale.paidTotal||0);
      if(Math.abs(expected-actual)>0.011){const error=new Error(`Το σύνολο POS (${actual.toFixed(2)} €) δεν συμφωνεί με την Online παραγγελία (${expected.toFixed(2)} €).`);error.status=409;throw error}
      if(Math.abs(actual-paid)>0.011){const error=new Error(`Η πληρωμή POS (${paid.toFixed(2)} €) δεν συμφωνεί με την πώληση (${actual.toFixed(2)} €).`);error.status=409;throw error}
      if(Number(sale.methodCount||0)<1||Number(sale.otherMethodCount||0)>0){const error=new Error("Ο τρόπος πληρωμής της πώλησης POS δεν συμφωνεί με την επιλογή του χειριστή.");error.status=409;throw error}

      let verifiedOnlineSource=String(sale.source)==="ONLINE_POS";
      if(!verifiedOnlineSource){
        const expectedDescription=`ONLINE ΠΑΡΑΓΓΕΛΙΑ ${order.orderNumber}`;
        const evidence=(await tx.$queryRaw`
          SELECT st."id"
          FROM "StoreTransaction" st
          WHERE st."companyId"=${req.user.companyId}
            AND st."storeId"=${req.params.storeId}
            AND st."type"=${requestedMethod==="CASH"?"SALE_CASH":"SALE_CARD"}
            AND ABS(st."amount"-${actual})<0.011
            AND st."description" ILIKE ${`%${expectedDescription}%`}
          ORDER BY st."id" DESC
          LIMIT 1`)[0];
        verifiedOnlineSource=Boolean(evidence);
      }
      if(!verifiedOnlineSource){const error=new Error("Η πώληση δεν προέρχεται από την ασφαλή ροή Online → POS.");error.status=409;throw error}

      await tx.$executeRaw`
        UPDATE "OnlineOrder"
        SET "status"='DELIVERED',"saleId"=${saleId},"commercialPostedAt"=COALESCE("commercialPostedAt",NOW()),"deliveredAt"=COALESCE("deliveredAt",NOW()),"paymentStatus"='PAID',"paymentMethod"=${requestedMethod},"assignedEmployeeId"=COALESCE(${req.user.employeeId||null},"assignedEmployeeId"),"updatedAt"=NOW()
        WHERE "id"=${order.id}`;
      const deliveredEvent=(await tx.$queryRaw`SELECT "id" FROM "OnlineOrderStatusEvent" WHERE "orderId"=${order.id} AND "toStatus"='DELIVERED' AND "note" ILIKE ${`%sale ${saleId}%`} LIMIT 1`)[0];
      if(!deliveredEvent)await tx.$executeRaw`
        INSERT INTO "OnlineOrderStatusEvent" ("id","orderId","fromStatus","toStatus","userId","employeeId","note")
        VALUES (${crypto.randomUUID()},${order.id},${order.status},'DELIVERED',${null},${req.user.employeeId||null},${`POS_CHECKOUT_COMPLETED · sale ${saleId} · ${requestedMethod}`})`;
      return{orderNumber:order.orderNumber,saleId,status:"DELIVERED",replay:Boolean(order.saleId)};
    });
    res.json({ok:true,...result});
  }catch(error){next(error)}
});

export default router;
