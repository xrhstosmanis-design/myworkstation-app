import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const money=v=>Number(v||0);
function assertStore(req,storeId){if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){const e=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");e.status=403;throw e}}
async function storeFor(req,id){const store=await prisma.store.findFirst({where:{id,companyId:req.user.companyId,active:true},select:{id:true,companyId:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}

router.get("/stores/:storeId/modifiers",async(req,res,next)=>{try{assertStore(req,req.params.storeId);await storeFor(req,req.params.storeId);const productId=String(req.query.productId||"").trim();let groups=[];if(productId){groups=await prisma.$queryRaw`
 SELECT g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
 COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
 FROM "PreparationProductModifierGroup" pg
 JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=true
 LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
 WHERE pg."companyId"=${req.user.companyId} AND pg."productId"=${productId}
 GROUP BY g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence"
 ORDER BY pg."sequence",g."description"`;}else{groups=await prisma.$queryRaw`
 SELECT g."id",g."description",false AS "required",0 AS "minSelections",1 AS "maxSelections",0 AS "sequence",
 COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
 FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
 WHERE g."companyId"=${req.user.companyId} AND g."active"=true GROUP BY g."id",g."description" ORDER BY g."description"`;}
 const settings=productId?(await prisma.$queryRaw`SELECT "preparationEnabled","environmentalFee","productionStation","autoPrint" FROM "PreparationProductSettings" WHERE "companyId"=${req.user.companyId} AND "productId"=${productId} LIMIT 1`)[0]:null;
 res.json({productId:productId||null,settings:settings?{...settings,environmentalFee:money(settings.environmentalFee)}:null,groups:groups.map(g=>({...g,minSelections:Number(g.minSelections||0),maxSelections:Number(g.maxSelections||1),sequence:Number(g.sequence||0),items:(g.items||[]).map(x=>({...x,price:money(x.price)}))}))});
 }catch(e){next(e)}});

export default router;
