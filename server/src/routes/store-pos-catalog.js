import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const money=value=>Number(value||0);

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}

async function storeFor(req,storeId){
  const row=await prisma.store.findFirst({
    where:{id:storeId,companyId:req.user.companyId,active:true},
    select:{id:true,name:true,companyId:true}
  });
  if(!row){
    const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");
    error.status=404;
    throw error;
  }
  return row;
}

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    assertStore(req,req.params.storeId);
    const store=await storeFor(req,req.params.storeId);
    const layoutRows=await prisma.$queryRawUnsafe(
      `SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,
      store.id
    ).catch(()=>[]);

    const products=await prisma.$queryRaw`
      SELECT
        p."id",
        p."sku",
        p."name",
        p."vatRate",
        p."masterProductId",
        resolved_mp."id" AS "resolvedMasterProductId",
        resolved_mp."sourceCode" AS "masterCode",
        COALESCE(sp."salePrice",p."salePrice") AS "salePrice",
        COALESCE(sp."currentStock",0) AS "currentStock",
        c."name" AS "categoryName",
        COALESCE(
          (SELECT json_agg(pb."barcode" ORDER BY pb."barcode")
           FROM "ProductBarcode" pb
           WHERE pb."productId"=p."id"),
          '[]'
        ) AS "barcodes",
        COALESCE(
          (SELECT json_agg(mpb."barcode" ORDER BY mpb."barcode")
           FROM "MasterProductBarcode" mpb
           WHERE mpb."masterProductId"=resolved_mp."id"),
          '[]'
        ) AS "masterBarcodes"
      FROM "StoreProduct" sp
      JOIN "Product" p
        ON p."id"=sp."productId"
       AND p."companyId"=${req.user.companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN LATERAL (
        SELECT mp."id",mp."sourceCode"
        FROM "MasterProduct" mp
        WHERE mp."active"=true
          AND (
            mp."id"=p."masterProductId"
            OR (p."sku" IS NOT NULL AND mp."sourceCode"=p."sku")
            OR EXISTS (
              SELECT 1
              FROM "MasterProductBarcode" mpb_match
              JOIN "ProductBarcode" pb_match
                ON pb_match."productId"=p."id"
               AND pb_match."barcode"=mpb_match."barcode"
              WHERE mpb_match."masterProductId"=mp."id"
            )
          )
        ORDER BY
          CASE
            WHEN mp."id"=p."masterProductId" THEN 0
            WHEN p."sku" IS NOT NULL AND mp."sourceCode"=p."sku" THEN 1
            ELSE 2
          END,
          mp."id"
        LIMIT 1
      ) resolved_mp ON true
      WHERE sp."storeId"=${store.id}
        AND sp."active"=true
        AND p."active"=true
      ORDER BY c."name" NULLS LAST,p."name"
      LIMIT 5000`;

    res.json({
      store,
      layout:layoutRows[0]?.layoutJson||null,
      layoutVersion:Number(layoutRows[0]?.version||0),
      publishedAt:layoutRows[0]?.publishedAt||null,
      products:products.map(row=>({
        ...row,
        masterProductId:row.resolvedMasterProductId||row.masterProductId||null,
        sourceCode:row.masterCode||row.sku||null,
        masterCode:row.masterCode||null,
        barcodes:[...new Set([...(row.barcodes||[]),...(row.masterBarcodes||[])])],
        salePrice:money(row.salePrice),
        currentStock:money(row.currentStock),
        vatRate:money(row.vatRate)
      }))
    });
  }catch(error){next(error)}
});

export default router;
