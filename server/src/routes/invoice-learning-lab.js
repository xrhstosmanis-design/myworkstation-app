import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const n=value=>value===undefined||value===null||value===""?null:Number(value);
const text=value=>value===undefined||value===null?null:String(value).trim()||null;
const supplierKeyOf=body=>text(body.supplierTaxId)||text(body.supplierKey)||text(body.supplierName)?.toLocaleUpperCase("el-GR")||"UNKNOWN";

router.get("/documents",async(req,res,next)=>{try{
  const rows=await prisma.$queryRaw`SELECT "id","supplierName","supplierTaxId","invoiceNumber","invoiceDate","filename","ocrConfidence","status","createdAt","updatedAt" FROM "InvoiceLearningDocument" ORDER BY "createdAt" DESC LIMIT 100`;
  res.json(rows);
}catch(error){next(error)}});

router.get("/documents/:id",async(req,res,next)=>{try{
  const docs=await prisma.$queryRaw`SELECT * FROM "InvoiceLearningDocument" WHERE "id"=${req.params.id} LIMIT 1`;
  if(!docs[0])return res.status(404).json({error:"Δεν βρέθηκε το εκπαιδευτικό τιμολόγιο."});
  const lines=await prisma.$queryRaw`SELECT * FROM "InvoiceLearningLine" WHERE "documentId"=${req.params.id} ORDER BY "lineNo"`;
  res.json({...docs[0],lines});
}catch(error){next(error)}});

router.post("/documents",async(req,res,next)=>{try{
  const body=z.object({supplierKey:z.string().optional().nullable(),supplierName:z.string().optional().nullable(),supplierTaxId:z.string().optional().nullable(),invoiceNumber:z.string().optional().nullable(),invoiceDate:z.string().optional().nullable(),filename:z.string().optional().nullable(),mimeType:z.string().optional().nullable(),ocrConfidence:z.coerce.number().min(0).max(100).optional().nullable(),rawText:z.string().optional().nullable(),lines:z.array(z.object({rawText:z.string().optional().nullable(),supplierItemCode:z.string().optional().nullable(),description:z.string().optional().nullable(),quantity:z.any().optional().nullable(),unit:z.string().optional().nullable(),unitsPerPackage:z.any().optional().nullable(),unitPrice:z.any().optional().nullable(),discount1:z.any().optional().nullable(),discount2:z.any().optional().nullable(),discount3:z.any().optional().nullable(),netValue:z.any().optional().nullable(),vatRate:z.any().optional().nullable(),fieldConfidence:z.record(z.any()).optional().default({})})).max(1000).default([])}).parse(req.body||{});
  const id=crypto.randomUUID(),supplierKey=supplierKeyOf(body);
  await prisma.$executeRaw`INSERT INTO "InvoiceLearningDocument" ("id","createdByUserId","supplierKey","supplierName","supplierTaxId","invoiceNumber","invoiceDate","filename","mimeType","ocrConfidence","rawText") VALUES (${id},${req.user.id},${supplierKey},${text(body.supplierName)},${text(body.supplierTaxId)},${text(body.invoiceNumber)},${body.invoiceDate?new Date(body.invoiceDate):null},${text(body.filename)},${text(body.mimeType)},${n(body.ocrConfidence)},${body.rawText||null})`;
  let lineNo=0;
  for(const line of body.lines){lineNo+=1;const unitPrice=n(line.unitPrice),d1=n(line.discount1)||0,d2=n(line.discount2)||0,d3=n(line.discount3)||0;const netUnitCost=unitPrice===null?null:unitPrice*(1-d1/100)*(1-d2/100)*(1-d3/100);await prisma.$executeRaw`INSERT INTO "InvoiceLearningLine" ("id","documentId","lineNo","rawText","supplierItemCode","description","quantity","unit","unitsPerPackage","unitPrice","discount1","discount2","discount3","netUnitCost","netValue","vatRate","fieldConfidence") VALUES (${crypto.randomUUID()},${id},${lineNo},${text(line.rawText)},${text(line.supplierItemCode)},${text(line.description)},${n(line.quantity)},${text(line.unit)},${n(line.unitsPerPackage)},${unitPrice},${n(line.discount1)},${n(line.discount2)},${n(line.discount3)},${netUnitCost},${n(line.netValue)},${n(line.vatRate)},${JSON.stringify(line.fieldConfidence)}::jsonb)`}
  res.status(201).json({id,supplierKey,lineCount:lineNo,status:"DRAFT"});
}catch(error){next(error)}});

router.put("/lines/:id",async(req,res,next)=>{try{
  const body=z.object({supplierItemCode:z.string().optional().nullable(),description:z.string().optional().nullable(),quantity:z.any().optional().nullable(),unit:z.string().optional().nullable(),unitsPerPackage:z.any().optional().nullable(),unitPrice:z.any().optional().nullable(),discount1:z.any().optional().nullable(),discount2:z.any().optional().nullable(),discount3:z.any().optional().nullable(),netValue:z.any().optional().nullable(),vatRate:z.any().optional().nullable(),masterProductId:z.string().optional().nullable(),masterProductName:z.string().optional().nullable(),barcode:z.string().optional().nullable(),barcodeSource:z.string().optional().nullable(),barcodeReference:z.string().optional().nullable(),matchConfidence:z.any().optional().nullable(),status:z.enum(["NEW","REVIEW","CONFIRMED","REJECTED"]).optional()}).parse(req.body||{});
  const current=await prisma.$queryRaw`SELECT * FROM "InvoiceLearningLine" WHERE "id"=${req.params.id} LIMIT 1`;if(!current[0])return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});const c=current[0];
  const unitPrice=body.unitPrice!==undefined?n(body.unitPrice):Number(c.unitPrice??0),d1=body.discount1!==undefined?(n(body.discount1)||0):Number(c.discount1??0),d2=body.discount2!==undefined?(n(body.discount2)||0):Number(c.discount2??0),d3=body.discount3!==undefined?(n(body.discount3)||0):Number(c.discount3??0),netUnitCost=unitPrice===null?null:unitPrice*(1-d1/100)*(1-d2/100)*(1-d3/100);
  await prisma.$executeRaw`UPDATE "InvoiceLearningLine" SET "supplierItemCode"=${body.supplierItemCode!==undefined?text(body.supplierItemCode):c.supplierItemCode},"description"=${body.description!==undefined?text(body.description):c.description},"quantity"=${body.quantity!==undefined?n(body.quantity):c.quantity},"unit"=${body.unit!==undefined?text(body.unit):c.unit},"unitsPerPackage"=${body.unitsPerPackage!==undefined?n(body.unitsPerPackage):c.unitsPerPackage},"unitPrice"=${body.unitPrice!==undefined?n(body.unitPrice):c.unitPrice},"discount1"=${body.discount1!==undefined?n(body.discount1):c.discount1},"discount2"=${body.discount2!==undefined?n(body.discount2):c.discount2},"discount3"=${body.discount3!==undefined?n(body.discount3):c.discount3},"netUnitCost"=${netUnitCost},"netValue"=${body.netValue!==undefined?n(body.netValue):c.netValue},"vatRate"=${body.vatRate!==undefined?n(body.vatRate):c.vatRate},"masterProductId"=${body.masterProductId!==undefined?text(body.masterProductId):c.masterProductId},"masterProductName"=${body.masterProductName!==undefined?text(body.masterProductName):c.masterProductName},"barcode"=${body.barcode!==undefined?text(body.barcode):c.barcode},"barcodeSource"=${body.barcodeSource!==undefined?text(body.barcodeSource):c.barcodeSource},"barcodeReference"=${body.barcodeReference!==undefined?text(body.barcodeReference):c.barcodeReference},"matchConfidence"=${body.matchConfidence!==undefined?n(body.matchConfidence):c.matchConfidence},"status"=${body.status||c.status},"confirmedByUserId"=${body.status==="CONFIRMED"?req.user.id:c.confirmedByUserId},"confirmedAt"=${body.status==="CONFIRMED"?new Date():c.confirmedAt},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id}`;
  res.json({ok:true,netUnitCost});
}catch(error){next(error)}});

router.get("/master-search",async(req,res,next)=>{try{
  const q=String(req.query.q||"").trim();if(q.length<2)return res.json([]);const like=`%${q}%`;
  const rows=await prisma.$queryRaw`SELECT p."id",p."sourceCode",p."name",p."brandName",p."categoryName",p."subcategoryName",p."vatRate",b."barcode" FROM "MasterProduct" p LEFT JOIN LATERAL (SELECT "barcode" FROM "MasterProductBarcode" b WHERE b."masterProductId"=p."id" ORDER BY b."scanEnabled" DESC,b."createdAt" LIMIT 1) b ON true WHERE p."active"=true AND (p."name" ILIKE ${like} OR p."sourceCode" ILIKE ${like} OR COALESCE(p."brandName",'') ILIKE ${like} OR COALESCE(b."barcode",'') ILIKE ${like}) ORDER BY CASE WHEN p."name" ILIKE ${q+'%'} THEN 0 ELSE 1 END,p."name" LIMIT 30`;
  res.json(rows);
}catch(error){next(error)}});

router.post("/barcode-candidates",async(req,res,next)=>{try{
  const body=z.object({lineId:z.string(),barcode:z.string().trim().min(4).max(32),source:z.string().trim().min(2).max(80),reference:z.string().optional().nullable(),confidence:z.coerce.number().min(0).max(100).optional().nullable()}).parse(req.body||{});
  const id=crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "InvoiceLearningBarcodeCandidate" ("id","lineId","barcode","source","reference","confidence") VALUES (${id},${body.lineId},${body.barcode},${body.source},${text(body.reference)},${n(body.confidence)})`;res.status(201).json({id});
}catch(error){next(error)}});

router.post("/documents/:id/learn",async(req,res,next)=>{try{
  const docs=await prisma.$queryRaw`SELECT * FROM "InvoiceLearningDocument" WHERE "id"=${req.params.id} LIMIT 1`;if(!docs[0])return res.status(404).json({error:"Δεν βρέθηκε το τιμολόγιο."});const doc=docs[0];
  const lines=await prisma.$queryRaw`SELECT * FROM "InvoiceLearningLine" WHERE "documentId"=${req.params.id}`;const confirmed=lines.filter(line=>line.status==="CONFIRMED");if(!confirmed.length)return res.status(400).json({error:"Χρειάζεται τουλάχιστον μία επιβεβαιωμένη γραμμή."});
  const profileId=crypto.createHash("sha1").update(String(doc.supplierKey)).digest("hex");const patterns={supplierItemCodes:confirmed.filter(x=>x.supplierItemCode&&x.masterProductId).map(x=>({code:x.supplierItemCode,masterProductId:x.masterProductId,barcode:x.barcode||null,unitsPerPackage:x.unitsPerPackage?Number(x.unitsPerPackage):null,lastDescription:x.description||null})),discountUsage:{discount1:confirmed.some(x=>Number(x.discount1||0)!==0),discount2:confirmed.some(x=>Number(x.discount2||0)!==0),discount3:confirmed.some(x=>Number(x.discount3||0)!==0)}};
  await prisma.$executeRaw`INSERT INTO "SupplierInvoiceLearningProfile" ("id","supplierKey","supplierName","supplierTaxId","patterns","confirmedDocuments","confirmedLines","lastConfirmedAt") VALUES (${profileId},${doc.supplierKey},${doc.supplierName},${doc.supplierTaxId},${JSON.stringify(patterns)}::jsonb,1,${confirmed.length},CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierName"=EXCLUDED."supplierName","supplierTaxId"=EXCLUDED."supplierTaxId","patterns"=COALESCE("SupplierInvoiceLearningProfile"."patterns",'{}'::jsonb)||EXCLUDED."patterns","confirmedDocuments"="SupplierInvoiceLearningProfile"."confirmedDocuments"+1,"confirmedLines"="SupplierInvoiceLearningProfile"."confirmedLines"+EXCLUDED."confirmedLines","version"="SupplierInvoiceLearningProfile"."version"+1,"lastConfirmedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP`;
  await prisma.$executeRaw`UPDATE "InvoiceLearningDocument" SET "status"='LEARNED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id}`;res.json({ok:true,confirmedLines:confirmed.length,supplierKey:doc.supplierKey});
}catch(error){next(error)}});

router.get("/profiles",async(req,res,next)=>{try{const rows=await prisma.$queryRaw`SELECT * FROM "SupplierInvoiceLearningProfile" ORDER BY "lastConfirmedAt" DESC NULLS LAST,"supplierName"`;res.json(rows)}catch(error){next(error)}});

export default router;
