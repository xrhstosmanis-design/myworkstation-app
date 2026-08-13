import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();

function canApprove(req){
  return req.user?.tokenType!=="STORE_OPERATOR"&&["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
}

const lineSchema=z.object({
  productId:z.string(),
  description:z.string().trim().min(1).max(250),
  quantity:z.coerce.number().positive(),
  unit:z.enum(["PIECE","PACKAGE"]),
  unitsPerPackage:z.coerce.number().positive().max(100000),
  unitCost:z.coerce.number().min(0),
  vatRate:z.coerce.number().min(0).max(100)
});

router.post("/ai-reader/jobs/:jobId/confirm",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({
      supplierId:z.string(),
      documentNumber:z.string().trim().max(80).optional().nullable(),
      documentDate:z.coerce.date().optional(),
      lines:z.array(lineSchema).min(1).max(500)
    }).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","status" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(["AWAITING_APPROVAL","CONFIRMED"].includes(job.status))return res.status(409).json({error:"Η ανάγνωση έχει ήδη σταλεί για έλεγχο ή εγκριθεί."});
    const supplier=await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const productIds=[...new Set(body.lines.map(item=>item.productId))];
    const products=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"=ANY(${productIds}::text[])`;
    if(products.length!==productIds.length)return res.status(404).json({error:"Ένα ή περισσότερα προϊόντα δεν ανήκουν στην εταιρεία."});
    const docId=id();
    const totals=body.lines.reduce((sum,item)=>{const net=item.quantity*item.unitCost,vat=net*item.vatRate/100;return {net:sum.net+net,vat:sum.vat+vat,gross:sum.gross+net+vat}},{net:0,vat:0,gross:0});
    await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw`SELECT "status" FROM "AiReaderJob" WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      if(["AWAITING_APPROVAL","CONFIRMED"].includes(locked[0]?.status)){const error=new Error("Η ανάγνωση έχει ήδη σταλεί για έλεγχο ή εγκριθεί.");error.status=409;throw error}
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId") VALUES (${docId},${req.user.companyId},${job.storeId},${body.supplierId},'INVOICE',${body.documentNumber||null},${body.documentDate||new Date()},${totals.net},${totals.vat},${totals.gross},'OCR_DRAFT','DRAFT',${req.user.id})`;
      for(const item of body.lines){
        const net=item.quantity*item.unitCost,vat=net*item.vatRate/100;
        await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${id()},${docId},${item.productId},${item.description},${item.quantity},${item.unit},${item.unit==="PACKAGE"?item.unitsPerPackage:null},${item.unitCost},${net},${item.vatRate},${vat},${net+vat})`;
      }
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='AWAITING_APPROVAL',"purchaseDocumentId"=${docId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`;
    });
    res.status(201).json({id:docId,status:"DRAFT",stockUpdated:false,awaitingApproval:true,...totals});
  }catch(error){next(error)}
});

router.post("/purchases/:documentId/approve",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    if(!canApprove(req))return res.status(403).json({error:"Μόνο Ιδιοκτήτης ή Διαχειριστής μπορεί να εγκρίνει παραστατικό για την αποθήκη."});
    const result=await prisma.$transaction(async tx=>{
      const docs=await tx.$queryRaw`SELECT * FROM "PurchaseDocument" WHERE "id"=${req.params.documentId} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      const doc=docs[0];
      if(!doc){const error=new Error("Δεν βρέθηκε το παραστατικό.");error.status=404;throw error}
      if(doc.status==="APPROVED")return {alreadyApproved:true,id:doc.id};
      if(doc.status!=="DRAFT"){const error=new Error("Το παραστατικό δεν είναι σε κατάσταση πρόχειρου ελέγχου.");error.status=409;throw error}
      const lines=await tx.$queryRaw`SELECT l.*,p."trackStock" FROM "PurchaseDocumentLine" l LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${req.user.companyId} WHERE l."purchaseDocumentId"=${doc.id} ORDER BY l."id"`;
      if(!lines.length){const error=new Error("Το παραστατικό δεν έχει γραμμές προϊόντων.");error.status=409;throw error}
      for(const line of lines){
        if(!line.productId||!line.trackStock)continue;
        const quantity=Number(line.quantity||0),unitsPerPackage=Number(line.unitsPerPackage||1),stockQuantity=line.unit==="PACKAGE"?quantity*unitsPerPackage:quantity;
        const perPieceCost=line.unit==="PACKAGE"?Number(line.unitCost||0)/unitsPerPackage:Number(line.unitCost||0);
        await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${id()},${doc.storeId},${line.productId},${stockQuantity}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${stockQuantity},"updatedAt"=CURRENT_TIMESTAMP`;
        await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${id()},${doc.storeId},${line.productId},'PURCHASE',${stockQuantity},${perPieceCost},'PURCHASE_APPROVAL',${doc.id},'Έγκριση πρόχειρου παραστατικού από BackOffice',${req.user.id})`;
      }
      await tx.$executeRaw`UPDATE "PurchaseDocument" SET "status"='APPROVED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${doc.id} AND "companyId"=${req.user.companyId}`;
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='CONFIRMED',"updatedAt"=CURRENT_TIMESTAMP WHERE "purchaseDocumentId"=${doc.id} AND "companyId"=${req.user.companyId}`;
      return {alreadyApproved:false,id:doc.id};
    });
    res.json({ok:true,...result,status:"APPROVED",stockUpdated:true});
  }catch(error){next(error)}
});

export default router;
