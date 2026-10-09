import {prisma} from "../prisma.js";
import {requireStoreModule} from "./module-access.js";

// Mounted before every purchase-order handler, including posting/reconciliation.
// A StoreOperator role alone never grants this workspace.
export function createPosPurchaseOrderAccess(db=prisma,entitlement=requireStoreModule("INVENTORY")){
 return async(req,res,next)=>{
  if(req.user?.tokenType!=="STORE_OPERATOR")return next();
  try{
   const user=req.user,storeId=String(user.storeId||""),companyId=user.companyId;
   const profiles=await db.$queryRaw`SELECT p."backofficeMenu",p."permissions",p."posAccess"
    FROM "StoreOperatorCredential" c JOIN "StoreOperatorProfile" p
     ON p."employeeId"=c."employeeId" AND p."storeId"=c."storeId" AND p."companyId"=c."companyId"
    WHERE c."id"=${user.operatorId||user.id} AND c."companyId"=${companyId} AND c."storeId"=${storeId}
     AND c."active"=TRUE LIMIT 1`;
   const profile=profiles[0];
   if(!storeId||!companyId||!profile||profile.posAccess===false||profile.backofficeMenu?.orders!==true)
    return res.status(403).json({error:"Δεν έχεις δικαίωμα «Παραγγελίες» από το BackOffice.",code:"POS_ORDERS_ACCESS_DENIED"});
   for(const requested of [req.query?.storeId,req.body?.storeId])if(requested&&String(requested)!==storeId)
    return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για το κατάστημά σου.",code:"POS_ORDERS_STORE_DENIED"});
   const path=String(req.path||"/").replace(/\/$/,"")||"/",method=req.method;
   const commerce=String(req.baseUrl||"").includes("/commerce/");
   const collection=!commerce&&((path==="/report"&&method==="GET")||(path==="/"&&method==="POST"));
   const match=path.match(/^\/([^/]+)(?:\/(.*))?$/);
   const tail=match?.[2]||"",orderId=match?.[1];
   const orderAction=!commerce&&match&&((!tail&&method==="PATCH")||(tail==="detail"&&method==="GET")||(tail==="reconcile-ocr-total"&&method==="POST")||(tail==="lines"&&method==="POST")||(/^lines\/[^/]+$/.test(tail)&&["PATCH","DELETE"].includes(method)));
   const ocrAction=commerce&&match&&((tail==="ocr-lines"&&method==="GET")||(/^ocr-lines\/[^/]+\/(?:search|options|catalog-matches)$/.test(tail)&&method==="GET")||(/^ocr-lines\/[^/]+\/(?:resolve-existing|create-product)$/.test(tail)&&method==="POST")||(/^invoice-assistant\/(?:source|preview)$/.test(tail)&&["GET","POST"].includes(method)));
   if(!collection&&!orderAction&&!ocrAction)return res.status(403).json({error:"Η ενέργεια δεν ανήκει στην καταχώριση τιμολογίου POS.",code:"POS_ORDERS_ACTION_DENIED"});
   if((req.body?.addBarcode||(/\/create-product$/.test(tail)&&["PROVIDED","GENERATED"].includes(req.body?.barcodeMode)))&&profile.permissions?.addBarcode!==true)
    return res.status(403).json({error:"Δεν έχεις δικαίωμα προσθήκης barcode.",code:"POS_ORDERS_BARCODE_DENIED"});
   if(!collection){
    const rows=await db.$queryRaw`SELECT "id","storeId" FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
    const lineId=tail.match(/^(?:lines|ocr-lines)\/([^/]+)/)?.[1];
    if(lineId){const lines=await db.$queryRaw`SELECT "id" FROM "PurchaseOrderLine" WHERE "id"=${lineId} AND "orderId"=${orderId} LIMIT 1`;
     if(!lines[0])return res.status(404).json({error:"Δεν βρέθηκε η γραμμή παραγγελίας."});}
   }
   // Never let report default to company-wide or select another store.
   req.query.storeId=storeId;req.params.storeId=storeId;
   return entitlement(req,res,error=>{if(error)return next(error);req.posPurchaseOrderAccess={storeId,companyId};next()});
  }catch(error){next(error)}
 };
}
export const posPurchaseOrderAccess=createPosPurchaseOrderAccess();
