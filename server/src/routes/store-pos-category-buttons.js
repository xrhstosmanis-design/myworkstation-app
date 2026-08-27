import {Router} from "express";
import crypto from "crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const bodySchema=z.object({
  categoryName:z.string().trim().min(1).max(120).nullable(),
  label:z.string().trim().min(1).max(80).optional(),
  color:color.optional(),
  textColor:color.optional()
});

const canManage=req=>req.user?.tokenType!=="STORE_OPERATOR"||req.user?.role==="MANAGER"||Boolean(req.user?.permissions?.includes("POS_QUICK_KEYS"));
async function storeFor(req,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}

router.put("/stores/:storeId/layout/categories/:buttonId",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==req.params.storeId)return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα."});
    if(!canManage(req))return res.status(403).json({error:"Δεν έχεις δικαίωμα διαχείρισης κατηγοριών POS."});
    const store=await storeFor(req,req.params.storeId),body=bodySchema.parse(req.body||{});
    const rows=await prisma.$queryRawUnsafe(`SELECT "layoutJson","version" FROM "StorePosLayout" WHERE "storeId"=$1 LIMIT 1`,store.id);
    if(!rows[0])return res.status(404).json({error:"Δεν υπάρχει δημοσιευμένη διάταξη POS για το κατάστημα."});
    const layout=structuredClone(rows[0].layoutJson||{}),button=(layout.categories||[]).find(row=>String(row?.id)===String(req.params.buttonId));
    if(!button)return res.status(404).json({error:"Το πλήκτρο κατηγορίας δεν βρέθηκε."});
    if(!body.categoryName){Object.assign(button,{label:"ΚΕΝΟ",categoryName:"",categoryId:null,children:[],productCodes:[],visible:true});}
    else{
      const category=(await prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND "active"=true AND LOWER("name")=LOWER(${body.categoryName}) LIMIT 1`)[0];
      if(!category)return res.status(404).json({error:"Η κατηγορία δεν υπάρχει ή δεν είναι ενεργή στο BackOffice."});
      const [subcategories,productRows]=await Promise.all([
        prisma.$queryRaw`SELECT "id","name" FROM "ProductSubcategory" WHERE "categoryId"=${category.id} AND "active"=true ORDER BY "name"`,
        prisma.$queryRaw`SELECT p."id",p."subcategoryId" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${req.user.companyId} AND p."active"=true WHERE sp."storeId"=${store.id} AND sp."active"=true AND p."categoryId"=${category.id}`
      ]);
      const idsBySubcategory=new Map(subcategories.map(sub=>[sub.id,[]]));
      for(const product of productRows){if(product.subcategoryId&&idsBySubcategory.has(product.subcategoryId))idsBySubcategory.get(product.subcategoryId).push(product.id)}
      const children=subcategories.map(sub=>({id:`category-${category.id}-${sub.id}`,label:sub.name,categoryId:category.id,subcategoryId:sub.id,productCodes:idsBySubcategory.get(sub.id)||[]}));
      Object.assign(button,{label:body.label||category.name,categoryName:category.name,categoryId:category.id,productCodes:children.length?[]:productRows.map(row=>row.id),children,visible:true});
    }
    if(body.color)button.color=body.color;
    if(body.textColor)button.textColor=body.textColor;
    const updated=await prisma.$queryRawUnsafe(`UPDATE "StorePosLayout" SET "layoutJson"=$2::jsonb,"version"="version"+1,"publishedAt"=NOW() WHERE "storeId"=$1 RETURNING "version"`,store.id,JSON.stringify(layout));
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},'POS_CATEGORY_BUTTON_UPDATED',${JSON.stringify({buttonId:button.id,categoryId:button.categoryId||null,categoryName:button.categoryName||null})}::jsonb)`;
    res.json({ok:true,layout,version:Number(updated[0]?.version||0)});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Τα στοιχεία της κατηγορίας δεν είναι έγκυρα."});next(error)}
});

export default router;
