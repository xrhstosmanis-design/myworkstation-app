import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");

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

async function findDuplicateInvoice(tx,{companyId,supplierId,documentNumber}){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!supplierId||!normalized)return null;
  const docs=await tx.$queryRaw`
    SELECT d."id",d."status",d."documentNumber",d."documentDate",st."name" AS "storeName"
    FROM "PurchaseDocument" d
    LEFT JOIN "Store" st ON st."id"=d."storeId"
    WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId}
      AND d."status" IN ('DRAFT','APPROVED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY d."documentDate" DESC LIMIT 1`;
  if(docs[0])return {source:"PURCHASE_DOCUMENT",...docs[0]};
  const orders=await tx.$queryRaw`
    SELECT o."id",o."status",o."invoiceNumber" AS "documentNumber",o."createdAt" AS "documentDate",st."name" AS "storeName"
    FROM "PurchaseOrder" o
    LEFT JOIN "Store" st ON st."id"=o."storeId"
    WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId}
      AND o."status" IN ('NEW','FINAL','INVOICED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY o."updatedAt" DESC LIMIT 1`;
  if(orders[0])return {source:"PURCHASE_ORDER",...orders[0]};
  return null;
}

// Runs before commerce-v1 /documents/inbox. Exact same file cannot be stored twice.
router.post("/documents/inbox",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string(),supplierId:z.string().optional().nullable(),file:z.object({dataUrl:z.string(),filename:z.string().optional()})}).passthrough().parse(req.body||{});
    const match=/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.file.dataUrl||"");
    if(!match)return next();
    const bytes=Buffer.from(match[2],"base64");
    const checksum=crypto.createHash("sha256").update(bytes).digest("hex");
    const duplicate=await prisma.$queryRaw`
      SELECT i."id",i."status",i."receivedAt",s."name" AS "storeName",sp."name" AS "supplierName",a."filename"
      FROM "DocumentInbox" i
      JOIN "DocumentAttachment" a ON a."id"=i."attachmentId"
      LEFT JOIN "Store" s ON s."id"=i."storeId"
      LEFT JOIN "Supplier" sp ON sp."id"=i."supplierId"
      WHERE i."companyId"=${req.user.companyId}
        AND i."storeId"=${body.storeId}
        AND a."checksum"=${checksum}
      ORDER BY i."receivedAt" DESC LIMIT 1`;
    if(duplicate[0])return res.status(409).json({
      error:`Το ίδιο αρχείο τιμολογίου έχει ήδη σταλεί${duplicate[0].storeName?` στο ${duplicate[0].storeName}`:""}. Δεν δημιουργήθηκε δεύτερη εγγραφή.`,
      duplicate:true,
      existing:{id:duplicate[0].id,status:duplicate[0].status,receivedAt:duplicate[0].receivedAt,filename:duplicate[0].filename,supplierName:duplicate[0].supplierName||null}
    });
    next();
  }catch(error){next(error)}
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
      const duplicate=await findDuplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate){
        const error=new Error(`Το τιμολόγιο ${body.documentNumber} έχει ήδη καταχωρηθεί${duplicate.storeName?` στο ${duplicate.storeName}`:""} (${duplicate.status}). Δεν δημιουργήθηκε δεύτερο πρόχειρο παραστατικό.`);
        error.status=409;
        throw error;
      }
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
