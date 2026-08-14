import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const adminRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN"]);

async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId||"")!==String(store.id)){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error;
  }
  return store;
}

router.get("/stores/:storeId",async(req,res,next)=>{
  try{
    const store=await storeFor(req,req.params.storeId);
    const rows=await prisma.$queryRaw`SELECT c."storeId",c."saleProductId",c."active",c."notes",p."name" AS "saleProductName",p."sku" AS "saleProductSku",p."vatRate" AS "saleProductVatRate" FROM "NetlinkStoreConfig" c LEFT JOIN "Product" p ON p."id"=c."saleProductId" AND p."companyId"=c."companyId" WHERE c."storeId"=${store.id} AND c."companyId"=${req.user.companyId} LIMIT 1`;
    const config=rows[0]||null;
    res.json({store,moduleKey:"NETLINK_PREPAID",configured:Boolean(config?.active&&config?.saleProductId),config:config?{...config,saleProductVatRate:config.saleProductVatRate===null?null:Number(config.saleProductVatRate)}:null});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/products",async(req,res,next)=>{
  try{
    const store=await storeFor(req,req.params.storeId);
    if(!adminRoles.has(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχείρισης για τη ρύθμιση Netlink."});
    const q=String(req.query.q||"").trim(),like=`%${q}%`;
    const rows=await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId} WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."active"=true AND (${q}='' OR p."name" ILIKE ${like} OR COALESCE(p."sku",'') ILIKE ${like}) ORDER BY p."name" LIMIT 50`;
    res.json({items:rows.map(row=>({...row,vatRate:Number(row.vatRate||0),salePrice:Number(row.salePrice||0)}))});
  }catch(error){next(error)}
});

router.put("/stores/:storeId",async(req,res,next)=>{
  try{
    if(!adminRoles.has(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα διαχείρισης για τη ρύθμιση Netlink."});
    const store=await storeFor(req,req.params.storeId);
    const body=z.object({saleProductId:z.string().min(1),active:z.boolean().default(true),notes:z.string().max(500).optional().nullable()}).parse(req.body||{});
    const productRows=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} AND sp."active"=true WHERE p."id"=${body.saleProductId} AND p."companyId"=${req.user.companyId} AND p."active"=true LIMIT 1`;
    const product=productRows[0];
    if(!product)return res.status(400).json({error:"Το προϊόν Netlink πρέπει να είναι ενεργό προϊόν του συγκεκριμένου καταστήματος."});
    await prisma.$executeRaw`INSERT INTO "NetlinkStoreConfig" ("storeId","companyId","saleProductId","active","notes") VALUES (${store.id},${req.user.companyId},${body.saleProductId},${body.active},${body.notes||null}) ON CONFLICT ("storeId") DO UPDATE SET "companyId"=EXCLUDED."companyId","saleProductId"=EXCLUDED."saleProductId","active"=EXCLUDED."active","notes"=EXCLUDED."notes","updatedAt"=NOW()`;
    res.json({ok:true,storeId:store.id,active:body.active,product:{...product,vatRate:Number(product.vatRate||0)}});
  }catch(error){next(error)}
});

export default router;
