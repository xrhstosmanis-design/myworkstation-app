import crypto from "node:crypto";
import {z} from "zod";
import {requireStaffAction,staffError} from "./backoffice-staff-access.js";

export const staffStoreProductPriceCapability="products.price-edit";
export const staffStoreProductPricePath=/^\/([^/]+)\/store-price$/;
const amount=z.number().finite().min(0).max(9999999999);
const priceInput=z.object({
  storeId:z.string().min(1).max(200),
  expectedPrice:amount,
  salePrice:amount.refine(value=>Math.abs(Math.round(value*100)-value*100)<0.0001)
}).strict();

export async function saveStaffStoreProductPrice(db,req,productId){
  const input=priceInput.parse(req.body);
  const {companyId,storeId,id:actorId}=req.user;
  if(req.user.staffAccess!==true||input.storeId!==storeId||!productId||productId.length>200)throw staffError();
  return db.$transaction(async tx=>{
    await requireStaffAction(tx,req,storeId,staffStoreProductPriceCapability);
    const [product]=await tx.$queryRaw`
      SELECT COALESCE(sp."salePrice",p."salePrice") AS "salePrice"
      FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id"
      JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=p."companyId"
      WHERE p."id"=${productId} AND p."companyId"=${companyId} AND sp."storeId"=${storeId}
        AND p."active"=true AND s."active"=true AND sp."active"=true
      FOR UPDATE OF sp FOR SHARE OF p`;
    if(!product)throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Το είδος δεν είναι ενεργό στο επιλεγμένο κατάστημα.");
    const oldPrice=Number(product.salePrice);
    if(oldPrice===input.salePrice)return {productId,storeId,salePrice:oldPrice,updated:false};
    if(oldPrice!==input.expectedPrice)throw staffError(409,"STAFF_PRICE_CHANGED","Η τιμή άλλαξε. Ανανέωσε το είδος και δοκίμασε ξανά.");
    await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${input.salePrice},"updatedAt"=NOW()
      WHERE "productId"=${productId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`INSERT INTO "ProductPriceHistory"
      ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId")
      VALUES (${crypto.randomUUID()},${companyId},${productId},${storeId},${oldPrice},${input.salePrice},'STORE_PRICE',${actorId})`;
    return {productId,storeId,salePrice:input.salePrice,updated:true};
  });
}
