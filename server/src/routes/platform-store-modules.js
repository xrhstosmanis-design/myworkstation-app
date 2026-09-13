import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {moduleCatalog,moduleKeys} from "../services/module-catalog.js";
import {companyModuleState} from "../middleware/module-access.js";
import {buildModuleAccessMatrix} from "../services/module-access-matrix.js";
import platformWorkforceV2Routes from "./platform-workforce-v2.js";
import {
  AI_STAFF_SCHEDULER,
  PERSONNEL_PACKAGE_DEFINITIONS,
  PERSONNEL_WRITABLE_MODULE_KEYS,
  ensureStorePaidModulesSchema,
  isSuperAdmin,
  storePaidModuleState,
  storePaidModuleStates,
  storePaidModuleCatalogStates
} from "../store-paid-modules.js";

const router=Router();
router.use(auth);

// Workforce v2 is also available to OWNER / ADMIN / MANAGER when the selected
// store has an active personnel package. The child router performs the tenant,
// role and package checks. Package activation below remains Super Admin only.
router.use("/companies/:companyId/stores/:storeId/workforce-v2",platformWorkforceV2Routes);
router.use((req,res,next)=>isSuperAdmin(req.user)?next():res.status(403).json({error:"Απαιτείται Platform Super Admin."}));

async function ownedStore(companyId,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true,companyId:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  return store;
}

async function moduleResponse(store){
  const resolved=await storePaidModuleStates(store.id);
  const [storeModules,companyModules]=await Promise.all([
    storePaidModuleCatalogStates(store.id),
    prisma.companyModule.findMany({where:{companyId:store.companyId},select:{moduleKey:true,active:true,startsAt:true,endsAt:true}})
  ]);
  const now=new Date();
  const companyActive=new Set(companyModules.filter(row=>row.active&&(!row.startsAt||row.startsAt<=now)&&(!row.endsAt||row.endsAt>=now)).map(row=>row.moduleKey));
  return {
    store,
    catalog:moduleCatalog,
    modules:storeModules.map(module=>({
      ...module,
      companyActive:companyActive.has(module.key),
      effectiveActive:module.configured?module.active:companyActive.has(module.key),
      inheritedFromCompany:!module.configured&&companyActive.has(module.key)
    })),
    packages:PERSONNEL_PACKAGE_DEFINITIONS,
    states:resolved.states,
    legacyState:resolved.legacy,
    state:await storePaidModuleState(store.id),
    superAdminAlwaysEnabled:true
  };
}

router.get("/companies/:companyId/stores/:storeId",async(req,res,next)=>{
  try{
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    res.json(await moduleResponse(store));
  }catch(error){next(error)}
});

router.get("/companies/:companyId/stores/:storeId/access-matrix",async(req,res,next)=>{
  try{
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    const [license,storeModules]=await Promise.all([
      companyModuleState(store.companyId),
      storePaidModuleCatalogStates(store.id)
    ]);
    if(!license)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
    res.json({
      company:{id:license.id,name:license.name},
      store,
      checkedAt:new Date().toISOString(),
      ...buildModuleAccessMatrix({
        catalog:moduleCatalog,
        licenseAllowed:license.licenseAllowed,
        companyActiveModules:license.activeModules,
        storeModules
      })
    });
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId",async(req,res,next)=>{
  try{
    await ensureStorePaidModulesSchema();
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    const body=z.object({
      moduleKey:z.enum([...new Set([...PERSONNEL_WRITABLE_MODULE_KEYS,...moduleKeys])]).optional().default(AI_STAFF_SCHEDULER),
      active:z.boolean(),
      monthlyPrice:z.coerce.number().min(0).max(100000),
      startsAt:z.string().datetime().nullable().optional(),
      endsAt:z.string().datetime().nullable().optional(),
      notes:z.string().trim().max(500).optional().default("")
    }).superRefine((value,ctx)=>{
      if(value.startsAt&&value.endsAt&&new Date(value.endsAt)<new Date(value.startsAt))ctx.addIssue({code:z.ZodIssueCode.custom,path:["endsAt"],message:"Η λήξη δεν μπορεί να είναι πριν από την έναρξη."});
    }).parse(req.body||{});

    if(body.moduleKey==="CORE"&&!body.active)return res.status(400).json({error:"Το MyWorkStation Core δεν μπορεί να απενεργοποιηθεί για κατάστημα."});
    const catalogModule=moduleCatalog.find(module=>module.key===body.moduleKey);
    if(body.active&&catalogModule&&!catalogModule.commercialReady){
      const companyModule=await prisma.companyModule.findUnique({where:{companyId_moduleKey:{companyId:store.companyId,moduleKey:body.moduleKey}},select:{active:true}});
      if(!companyModule?.active)return res.status(400).json({error:`Το module «${catalogModule.name}» δεν είναι ακόμη διαθέσιμο για εμπορική ενεργοποίηση.`});
    }

    await prisma.$executeRaw`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","startsAt","endsAt","notes","updatedBy") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${body.moduleKey},${body.active},${body.monthlyPrice},${body.startsAt?new Date(body.startsAt):null},${body.endsAt?new Date(body.endsAt):null},${body.notes||null},${req.user.id}) ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=EXCLUDED."active","monthlyPrice"=EXCLUDED."monthlyPrice","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","notes"=EXCLUDED."notes","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;

    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:`STORE_MODULE_${body.moduleKey}_${body.active?"ENABLED":"DISABLED"}`,
      success:true,
      deviceName:store.name,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});

    res.json(await moduleResponse(store));
  }catch(error){next(error)}
});

router.get("/online-radio/stations",async(req,res,next)=>{try{const rows=await prisma.$queryRaw`SELECT "id","name","streamUrl","active","sortOrder","createdAt","updatedAt" FROM "OnlineRadioStation" ORDER BY "sortOrder","name"`;res.json({rows})}catch(error){next(error)}});

router.post("/online-radio/stations",async(req,res,next)=>{
  try{const body=z.object({name:z.string().trim().min(2).max(120),streamUrl:z.string().url().refine(value=>value.startsWith("https://"),"Το stream πρέπει να χρησιμοποιεί HTTPS."),active:z.boolean().default(true),sortOrder:z.coerce.number().int().min(0).max(10000).default(0)}).parse(req.body||{}),id=crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "OnlineRadioStation" ("id","name","streamUrl","active","sortOrder","createdBy") VALUES (${id},${body.name},${body.streamUrl},${body.active},${body.sortOrder},${req.user.id})`;res.status(201).json({id,...body})}catch(error){next(error)}
});

router.patch("/online-radio/stations/:stationId",async(req,res,next)=>{
  try{const body=z.object({name:z.string().trim().min(2).max(120),streamUrl:z.string().url().refine(value=>value.startsWith("https://"),"Το stream πρέπει να χρησιμοποιεί HTTPS."),active:z.boolean(),sortOrder:z.coerce.number().int().min(0).max(10000)}).parse(req.body||{}),rows=await prisma.$queryRaw`UPDATE "OnlineRadioStation" SET "name"=${body.name},"streamUrl"=${body.streamUrl},"active"=${body.active},"sortOrder"=${body.sortOrder},"updatedAt"=NOW() WHERE "id"=${req.params.stationId} RETURNING "id"`;if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο σταθμός."});res.json({id:rows[0].id,...body})}catch(error){next(error)}
});

router.delete("/online-radio/stations/:stationId",async(req,res,next)=>{
  try{
    const station=(await prisma.$queryRaw`SELECT "id","name" FROM "OnlineRadioStation" WHERE "id"=${req.params.stationId} LIMIT 1`)[0];
    if(!station)return res.status(404).json({error:"Δεν βρέθηκε ο σταθμός."});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreOnlineRadioConfig" SET "allowedStationIds"="allowedStationIds"-${station.id},"updatedBy"=${req.user.id},"updatedAt"=NOW() WHERE "allowedStationIds" ? ${station.id}`;
      await tx.$executeRaw`UPDATE "PosOnlineRadioState" SET "stationId"=NULL,"updatedAt"=NOW() WHERE "stationId"=${station.id}`;
      await tx.$executeRaw`DELETE FROM "OnlineRadioStation" WHERE "id"=${station.id}`;
    });
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:"ONLINE_RADIO_STATION_DELETED",success:true,deviceName:station.name,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
    res.json({ok:true,id:station.id,name:station.name});
  }catch(error){next(error)}
});

router.get("/companies/:companyId/stores/:storeId/online-radio",async(req,res,next)=>{
  try{const store=await ownedStore(req.params.companyId,req.params.storeId),config=(await prisma.$queryRaw`SELECT "enabled","allowedStationIds","updatedAt" FROM "StoreOnlineRadioConfig" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} LIMIT 1`)[0]||{enabled:false,allowedStationIds:[]},stations=await prisma.$queryRaw`SELECT "id","name","streamUrl","active","sortOrder" FROM "OnlineRadioStation" ORDER BY "sortOrder","name"`;res.json({store,config,stations})}catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId/online-radio",async(req,res,next)=>{
  try{
    const store=await ownedStore(req.params.companyId,req.params.storeId),body=z.object({enabled:z.boolean(),allowedStationIds:z.array(z.string().min(1)).max(100)}).parse(req.body||{}),ids=[...new Set(body.allowedStationIds)];
    const moduleActive=Boolean((await prisma.$queryRaw`SELECT 1 FROM "StorePaidModule" WHERE "companyId"=${store.companyId} AND "storeId"=${store.id} AND "moduleKey"='ONLINE_RADIO' AND "active"=TRUE AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">=NOW()) LIMIT 1`)[0]);
    if(body.enabled&&!moduleActive)return res.status(409).json({error:"Ενεργοποίησε πρώτα το πληρωμένο module Online Ράδιο για το κατάστημα."});
    const valid=ids.length?await prisma.$queryRaw`SELECT "id" FROM "OnlineRadioStation" WHERE "active"=TRUE AND "id"=ANY(${ids}::text[])`:[];
    if(valid.length!==ids.length)return res.status(400).json({error:"Ένας ή περισσότεροι σταθμοί δεν είναι ενεργοί."});
    await prisma.$executeRaw`INSERT INTO "StoreOnlineRadioConfig" ("storeId","companyId","enabled","allowedStationIds","updatedBy") VALUES (${store.id},${store.companyId},${body.enabled},${JSON.stringify(ids)}::jsonb,${req.user.id}) ON CONFLICT ("storeId") DO UPDATE SET "companyId"=EXCLUDED."companyId","enabled"=EXCLUDED."enabled","allowedStationIds"=EXCLUDED."allowedStationIds","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:`STORE_ONLINE_RADIO_${body.enabled?"ENABLED":"DISABLED"}`,success:true,deviceName:store.name,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
    res.json({ok:true,enabled:body.enabled,allowedStationIds:ids});
  }catch(error){next(error)}
});

const CHECK_PACKAGES={
  BASIC_CHECK:{key:"BASIC_CHECK",title:"BASIC Έλεγχος",description:"Ταμεία, βάρδιες, μετρητά, κάρτες, POS–EFTPOS και συμβάντα."},
  COMPLETE_CHECK:{key:"COMPLETE_CHECK",title:"COMPLETE Έλεγχος",description:"BASIC, παραστατικά, αποθήκη, τιμολόγια και προμηθευτές."},
  PREMIUM_CHECK:{key:"PREMIUM_CHECK",title:"PREMIUM Έλεγχος",description:"COMPLETE, κόστος, margin, κερδοφορία και απώλειες."}
};
const CHECK_PACKAGE_KEYS=Object.keys(CHECK_PACKAGES);
const checkPackageStates=rows=>Object.values(CHECK_PACKAGES).map(def=>{
  const row=rows.find(item=>item.moduleKey===def.key),now=Date.now();
  return {...def,active:Boolean(row?.active)&&(!row?.startsAt||new Date(row.startsAt).getTime()<=now)&&(!row?.endsAt||new Date(row.endsAt).getTime()>=now),monthlyPrice:Number(row?.monthlyPrice||0),startsAt:row?.startsAt||null,endsAt:row?.endsAt||null,notes:row?.notes||null};
});

router.get("/companies/:companyId/stores/:storeId/check-packages",async(req,res,next)=>{
  try{
    await ensureStorePaidModulesSchema();
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    const rows=await prisma.$queryRaw`SELECT "moduleKey","active","monthlyPrice","startsAt","endsAt","notes" FROM "StorePaidModule" WHERE "storeId"=${store.id} AND "moduleKey"=ANY(${CHECK_PACKAGE_KEYS}::text[])`;
    res.json({store,packages:checkPackageStates(rows)});
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId/check-packages/:moduleKey",async(req,res,next)=>{
  try{
    await ensureStorePaidModulesSchema();
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    const moduleKey=z.enum(CHECK_PACKAGE_KEYS).parse(req.params.moduleKey);
    const body=z.object({active:z.boolean(),monthlyPrice:z.coerce.number().min(0).max(100000).default(0),startsAt:z.string().datetime().nullable().optional(),endsAt:z.string().datetime().nullable().optional(),notes:z.string().trim().max(500).optional().default("")}).parse(req.body||{});
    if(body.startsAt&&body.endsAt&&new Date(body.endsAt)<new Date(body.startsAt))return res.status(400).json({error:"Η λήξη δεν μπορεί να είναι πριν από την έναρξη."});
    await prisma.$executeRaw`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","startsAt","endsAt","notes","updatedBy") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${moduleKey},${body.active},${body.monthlyPrice},${body.startsAt?new Date(body.startsAt):null},${body.endsAt?new Date(body.endsAt):null},${body.notes||null},${req.user.id}) ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=EXCLUDED."active","monthlyPrice"=EXCLUDED."monthlyPrice","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","notes"=EXCLUDED."notes","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
    await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:`STORE_CHECK_PACKAGE_${moduleKey}_${body.active?"ENABLED":"DISABLED"}`,success:true,deviceName:store.name,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
    const rows=await prisma.$queryRaw`SELECT "moduleKey","active","monthlyPrice","startsAt","endsAt","notes" FROM "StorePaidModule" WHERE "storeId"=${store.id} AND "moduleKey"=ANY(${CHECK_PACKAGE_KEYS}::text[])`;
    res.json({store,packages:checkPackageStates(rows)});
  }catch(error){next(error)}
});

export default router;
