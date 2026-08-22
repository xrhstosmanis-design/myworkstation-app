import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const SCOPE="PLATFORM_GLOBAL";
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";

router.use((req,res,next)=>{
  if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

export async function ensureInvoiceLearningWorkspaceSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceLearningWorkspaceState" (
    "scopeKey" TEXT PRIMARY KEY,
    "state" JSONB NOT NULL DEFAULT '{"documents":[],"profiles":{},"master":[]}'::jsonb,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("Invoice Learning central workspace schema ready.");
}

router.get("/invoice-learning/workspace",async(req,res,next)=>{try{
  const rows=await prisma.$queryRawUnsafe(
    `SELECT "state","updatedAt" FROM "InvoiceLearningWorkspaceState" WHERE "scopeKey"=$1 LIMIT 1`,SCOPE
  );
  const row=rows?.[0];
  res.json({ok:true,state:row?.state||{documents:[],profiles:{},master:[]},updatedAt:row?.updatedAt||null});
}catch(error){next(error)}});

router.put("/invoice-learning/workspace",async(req,res,next)=>{try{
  const state=req.body?.state;
  if(!state||typeof state!=="object"||Array.isArray(state))return res.status(400).json({error:"Μη έγκυρη κατάσταση Invoice Learning Lab."});
  const normalized={
    documents:Array.isArray(state.documents)?state.documents:[],
    profiles:state.profiles&&typeof state.profiles==="object"&&!Array.isArray(state.profiles)?state.profiles:{},
    master:Array.isArray(state.master)?state.master:[]
  };
  const json=JSON.stringify(normalized);
  if(Buffer.byteLength(json,"utf8")>8*1024*1024)return res.status(413).json({error:"Τα δεδομένα του Learning Lab είναι πολύ μεγάλα για συγχρονισμό."});
  const userId=String(req.user?.id||req.user?.userId||req.user?.sub||"")||null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "InvoiceLearningWorkspaceState" ("scopeKey","state","updatedByUserId","updatedAt")
     VALUES ($1,$2::jsonb,$3,CURRENT_TIMESTAMP)
     ON CONFLICT ("scopeKey") DO UPDATE SET "state"=EXCLUDED."state","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,
    SCOPE,json,userId
  );
  res.json({ok:true,documents:normalized.documents.length,profiles:Object.keys(normalized.profiles).length,updatedAt:new Date().toISOString()});
}catch(error){next(error)}});

export default router;
