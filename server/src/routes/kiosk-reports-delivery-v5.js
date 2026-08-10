import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=v=>Number(v||0);
const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};

router.use((req,res,next)=>req.user?.tokenType!=="STORE_OPERATOR"&&roles.has(req.user?.role)?next():res.status(403).json({error:"Η αναφορά delivery είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."}));

router.get("/delivery",async(req,res,next)=>{try{
  const companyId=req.user.companyId,from=dayStart(req.query.from),to=dayEndExclusive(req.query.to),storeId=String(req.query.storeId||"")||null,q=String(req.query.q||"").trim(),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT d."id",d."documentNumber",d."storeId",d."direction",d."recipientName",d."recipientTaxId",d."destinationAddress",d."purpose",d."status",d."fiscalStatus",d."dispatchedAt",d."finalizedAt",d."cancelledAt",d."cancellationReason",d."createdAt",s."name" AS "storeName",
      COUNT(l."id")::int AS "lineCount",COALESCE(SUM(l."quantity"),0) AS "totalQuantity",
      COALESCE(SUM(COALESCE(l."quantity",0)*COALESCE(p."salePrice",0)),0) AS "retailValue",
      u."fullName" AS "createdByName"
    FROM "DispatchNote" d
    JOIN "Store" s ON s."id"=d."storeId" AND s."companyId"=${companyId}
    LEFT JOIN "DispatchNoteLine" l ON l."dispatchNoteId"=d."id"
    LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=d."companyId"
    LEFT JOIN "User" u ON u."id"=d."createdByUserId"
    WHERE d."companyId"=${companyId} AND d."createdAt">=${from} AND d."createdAt"<${to}
      AND (${storeId}::text IS NULL OR d."storeId"=${storeId})
      AND (${text}::text IS NULL OR COALESCE(d."documentNumber",'') ILIKE ${text} OR COALESCE(d."recipientName",'') ILIKE ${text} OR COALESCE(d."recipientTaxId",'') ILIKE ${text} OR COALESCE(d."destinationAddress",'') ILIKE ${text})
    GROUP BY d."id",s."name",u."fullName"
    ORDER BY COALESCE(d."dispatchedAt",d."createdAt") DESC LIMIT 5000`;
  const items=rows.map(r=>({...r,totalQuantity:n(r.totalQuantity),retailValue:n(r.retailValue)}));
  res.json({items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.totalQuantity,0),totalRetailValue:items.reduce((a,r)=>a+r.retailValue,0),fiscalTransmission:false,note:"Τα δελτία είναι πραγματικές εγγραφές MyWorkStation. Η φορολογική διαβίβαση παραμένει μη διαθέσιμη μέχρι πραγματική σύνδεση πιστοποιημένου παρόχου/connector."});
}catch(error){next(error)}});

router.get("/delivery/:noteId/lines",async(req,res,next)=>{try{
  const companyId=req.user.companyId,noteId=req.params.noteId;
  const note=await prisma.$queryRaw`SELECT d."id",d."documentNumber",d."storeId",s."name" AS "storeName" FROM "DispatchNote" d JOIN "Store" s ON s."id"=d."storeId" WHERE d."id"=${noteId} AND d."companyId"=${companyId} LIMIT 1`;
  if(!note[0])return res.status(404).json({error:"Δεν βρέθηκε το δελτίο delivery."});
  const rows=await prisma.$queryRaw`
    SELECT l."id",l."productId",l."description",l."quantity",l."unit",p."sku",p."salePrice",p."vatRate",c."name" AS "categoryName",mp."subcategoryName"
    FROM "DispatchNoteLine" l
    LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
    LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    WHERE l."dispatchNoteId"=${noteId}
    ORDER BY l."createdAt",l."id"`;
  const items=rows.map(r=>({...r,quantity:n(r.quantity),salePrice:n(r.salePrice),vatRate:n(r.vatRate),retailValue:n(r.quantity)*n(r.salePrice)}));
  res.json({note:note[0],items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.quantity,0),totalRetailValue:items.reduce((a,r)=>a+r.retailValue,0)});
}catch(error){next(error)}});

export default router;
