import {prisma} from "../prisma.js";
import {ensureKioskReportAuditSchema,insertKioskAuditEvent} from "../kiosk-report-audit.js";

function requestedChange(req){
  if(req.method!=="PATCH"||req.body?.active===undefined)return null;
  if(req.path==="/bulk-card"&&Array.isArray(req.body?.productIds))return {ids:[...new Set(req.body.productIds.map(String))],nextActive:req.body.active===true,sourceType:"BULK_PRODUCT_CARD"};
  let match=req.path.match(/^\/([^/]+)\/card$/);
  if(match)return {ids:[decodeURIComponent(match[1])],nextActive:req.body.active===true,sourceType:"PRODUCT_CARD"};
  match=req.path.match(/^\/products\/([^/]+)$/);
  if(match)return {ids:[decodeURIComponent(match[1])],nextActive:req.body.active===true,sourceType:"COMMERCE_PRODUCT"};
  return null;
}

export async function productAuditCapture(req,res,next){
  try{
    const change=requestedChange(req);
    if(!change||!req.user?.companyId)return next();
    await ensureKioskReportAuditSchema();
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."name",p."sku",p."active"
      FROM "Product" p
      WHERE p."companyId"=${req.user.companyId} AND p."id"=ANY(${change.ids}::text[])
    `;
    const before=rows.filter(row=>Boolean(row.active)!==change.nextActive);
    if(!before.length)return next();
    const actorId=req.user.operatorId||req.user.id||null,actorName=req.user.fullName||req.user.name||req.user.email||"Χρήστης";
    res.once("finish",()=>{
      if(res.statusCode<200||res.statusCode>=300)return;
      Promise.resolve().then(async()=>{
        for(const row of before)await insertKioskAuditEvent({
          companyId:req.user.companyId,eventType:"PRODUCT_ACTIVE_CHANGE",productId:row.id,productName:row.name,sku:row.sku,
          oldActive:Boolean(row.active),newActive:change.nextActive,sourceType:change.sourceType,sourceId:row.id,actorId,actorName,
          reason:change.nextActive?"Ενεργοποίηση είδους":"Απενεργοποίηση είδους",details:{requestPath:req.originalUrl||req.path}
        });
      }).catch(error=>console.error("Product audit capture failed.",error));
    });
    next();
  }catch(error){next(error)}
}
