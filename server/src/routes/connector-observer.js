import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router(),roles=new Set(["OWNER","ADMIN"]);
router.use((req,res,next)=>roles.has(req.user?.role)&&req.user?.tokenType!=="STORE_OPERATOR"?next():res.status(403).json({error:"Απαιτείται δικαίωμα Owner ή Admin."}));

router.get("/status",async(req,res,next)=>{
  try{const storeId=z.string().optional().parse(req.query.storeId||undefined);if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."})}const devices=await prisma.$queryRaw`SELECT d."id",d."storeId",d."deviceName",d."version",d."status",d."lastSeenAt",d."observerMode",d."healthJson",s."name" AS "storeName",COUNT(e."id")::int AS "eventCount",MAX(e."observedAt") AS "lastObservedAt" FROM "ConnectorDevice" d JOIN "Store" s ON s."id"=d."storeId" LEFT JOIN "ConnectorEvent" e ON e."connectorDeviceId"=d."id" WHERE d."companyId"=${req.user.companyId} AND d."connectorType"='RBS_READONLY_OBSERVER' AND (${storeId||null}::text IS NULL OR d."storeId"=${storeId||null}) GROUP BY d."id",s."name" ORDER BY d."createdAt" DESC`;const now=Date.now();res.json({mode:"READ_ONLY",capabilities:{captureMetadataOnly:true,rawPayloadUpload:false,outboundCommands:false,fiscalIssuance:false,fiscalConfirmation:false},devices:devices.map(row=>({...row,online:Boolean(row.lastSeenAt&&now-new Date(row.lastSeenAt).getTime()<120000)}))})}catch(error){next(error)}
});

router.get("/events",async(req,res,next)=>{
  try{const query=z.object({storeId:z.string().optional(),source:z.enum(["CAPDRIVER","RBS","KIOSK_MANAGER"]).optional(),limit:z.coerce.number().int().min(1).max(1000).default(200)}).parse(req.query);const rows=await prisma.$queryRaw`SELECT e."id",e."eventKey",e."source",e."direction",e."payloadHash",e."byteLength",e."messageType",e."success",e."errorText",e."observedAt",e."createdAt",d."deviceName",d."storeId",s."name" AS "storeName" FROM "ConnectorEvent" e JOIN "ConnectorDevice" d ON d."id"=e."connectorDeviceId" JOIN "Store" s ON s."id"=d."storeId" WHERE d."companyId"=${req.user.companyId} AND d."connectorType"='RBS_READONLY_OBSERVER' AND (${query.storeId||null}::text IS NULL OR d."storeId"=${query.storeId||null}) AND (${query.source||null}::text IS NULL OR e."source"=${query.source||null}) ORDER BY e."observedAt" DESC LIMIT ${query.limit}`;res.json(rows)}catch(error){next(error)}
});

export default router;
