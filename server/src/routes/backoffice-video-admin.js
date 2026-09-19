import {Router} from "express";
import crypto from "node:crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {companyModuleState} from "../middleware/module-access.js";
import {ensureVideoEventsSchema} from "../video-events-bootstrap.js";
import {videoConnectorStatus} from "../services/video-connector-commands.js";

const router=Router();
let ready;
const hash=code=>crypto.createHash("sha256").update(String(code).replace(/[^A-Z0-9]/gi,"").toUpperCase()).digest("hex");
const makeCode=()=>{const v=crypto.randomInt(0,100000000).toString().padStart(8,"0");return `${v.slice(0,4)}-${v.slice(4)}`};
async function context(req,res,next){
 try{
  ready||=ensureVideoEventsSchema();await ready;
  if(!["OWNER","ADMIN"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται ιδιοκτήτης ή διαχειριστής."});
  const state=await companyModuleState(req.user.companyId);if(!state?.licenseAllowed||!state.activeModules.includes("VIDEO_EVENTS"))return res.status(403).json({error:"Το Video Events δεν είναι ενεργό."});
  const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.user.companyId,active:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});
  req.videoStore=store;next();
 }catch(e){next(e)}
}
router.use("/stores/:storeId",context);

router.get("/stores/:storeId",async(req,res,next)=>{try{
 const rows=await prisma.$queryRaw`SELECT "provider","protocol","endpoint","username","active","timeOffsetSeconds","retentionDays",("privacyNoticeAcknowledgedAt" IS NOT NULL) AS "privacyNoticeAcknowledged","connectionStatus","timeSyncStatus",("passwordEnc" IS NOT NULL) AS "passwordConfigured" FROM "StoreVideoConnection" WHERE "companyId"=${req.user.companyId} AND "storeId"=${req.videoStore.id} LIMIT 1`;
 const cameras=await prisma.$queryRaw`SELECT "cameraKey","displayName","zone","streamReference","active","sortOrder" FROM "StoreVideoCamera" WHERE "companyId"=${req.user.companyId} AND "storeId"=${req.videoStore.id} AND "active"=true ORDER BY "sortOrder"`;
 res.json({store:{id:req.videoStore.id,name:req.videoStore.name},connection:rows[0]||{provider:"DAHUA",protocol:"ONVIF",endpoint:"",username:"",active:false,timeOffsetSeconds:0,retentionDays:30,privacyNoticeAcknowledged:false,connectionStatus:"NOT_TESTED",timeSyncStatus:"NOT_CHECKED",passwordConfigured:false},cameras,connector:await videoConnectorStatus(req.user.companyId,req.videoStore.id)});
}catch(e){next(e)}});

router.post("/stores/:storeId/pairing-code",async(req,res,next)=>{try{
 const minutes=z.coerce.number().int().min(5).max(120).default(15).parse(req.body?.minutes??15);
 await prisma.$executeRaw`UPDATE "CloudPairingCode" SET "expiresAt"=NOW() WHERE "storeId"=${req.videoStore.id} AND "usedAt" IS NULL`;
 const code=makeCode(),id=crypto.randomUUID();
 await prisma.$executeRaw`INSERT INTO "CloudPairingCode" ("id","companyId","storeId","codeHash","expiresAt","createdBy") VALUES (${id},${req.user.companyId},${req.videoStore.id},${hash(code)},NOW()+(${minutes}::integer*INTERVAL '1 minute'),${req.user.id})`;
 const row=(await prisma.$queryRaw`SELECT "expiresAt" FROM "CloudPairingCode" WHERE "id"=${id}`)[0];
 res.status(201).json({code,expiresAt:row.expiresAt,store:{id:req.videoStore.id,name:req.videoStore.name}});
}catch(e){next(e)}});

router.put("/stores/:storeId/cameras",async(req,res,next)=>{try{
 const body=z.object({cameras:z.array(z.object({cameraKey:z.string().trim().min(1).max(80),displayName:z.string().trim().min(1).max(120),zone:z.enum(["POS_1","POS_2","WAREHOUSE","ENTRANCE","DELIVERY","OTHER"]),streamReference:z.string().trim().max(500).optional().or(z.literal("")),active:z.boolean().default(true),sortOrder:z.coerce.number().int().min(0).max(999)})).max(64)}).parse(req.body||{});
 const connection=(await prisma.$queryRaw`SELECT "id" FROM "StoreVideoConnection" WHERE "companyId"=${req.user.companyId} AND "storeId"=${req.videoStore.id} LIMIT 1`)[0];if(!connection)return res.status(409).json({error:"Αποθήκευσε πρώτα τη σύνδεση καταγραφικού."});
 await prisma.$transaction(async tx=>{await tx.$executeRaw`UPDATE "StoreVideoCamera" SET "active"=false,"updatedAt"=NOW() WHERE "companyId"=${req.user.companyId} AND "storeId"=${req.videoStore.id}`;for(const c of body.cameras)await tx.$executeRaw`INSERT INTO "StoreVideoCamera" ("id","companyId","storeId","connectionId","cameraKey","displayName","zone","streamReference","active","sortOrder") VALUES (${crypto.randomUUID()},${req.user.companyId},${req.videoStore.id},${connection.id},${c.cameraKey},${c.displayName},${c.zone},${c.streamReference||null},${c.active},${c.sortOrder}) ON CONFLICT ("storeId","cameraKey") DO UPDATE SET "displayName"=EXCLUDED."displayName","zone"=EXCLUDED."zone","streamReference"=EXCLUDED."streamReference","active"=EXCLUDED."active","sortOrder"=EXCLUDED."sortOrder","updatedAt"=NOW()`;});
 res.json({ok:true,cameras:body.cameras});
}catch(e){next(e)}});

router.use((e,req,res,next)=>{if(res.headersSent)return next(e);if(e?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρα στοιχεία Video Audit.",details:e.issues});console.error("Backoffice video admin:",e);res.status(500).json({error:"Αποτυχία διαχείρισης Video Audit."})});
export default router;
