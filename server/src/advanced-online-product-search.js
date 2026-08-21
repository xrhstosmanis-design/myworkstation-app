import crypto from "crypto";
import {prisma} from "./prisma.js";

export const ADVANCED_ONLINE_SEARCH_MODULE="ADVANCED_ONLINE_PRODUCT_SEARCH";
let usageReady;

const nowActive=row=>Boolean(row?.active)&&(!row.startsAt||new Date(row.startsAt)<=new Date())&&(!row.endsAt||new Date(row.endsAt)>=new Date());

export async function advancedOnlineSearchEntitlement(companyId){
  const rows=await prisma.companyModule.findMany({where:{companyId,moduleKey:ADVANCED_ONLINE_SEARCH_MODULE},select:{active:true,startsAt:true,endsAt:true}}).catch(()=>[]);
  return rows.some(nowActive);
}

async function ensureUsageTable(){
  if(usageReady)return usageReady;
  usageReady=prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AdvancedOnlineSearchUsage" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "actorId" TEXT,
      "query" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "resultCount" INTEGER NOT NULL DEFAULT 0,
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "estimatedCostUsd" NUMERIC(12,6) NOT NULL DEFAULT 0,
      "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "AdvancedOnlineSearchUsage_company_created_idx" ON "AdvancedOnlineSearchUsage" ("companyId","createdAt" DESC);
    CREATE INDEX IF NOT EXISTS "AdvancedOnlineSearchUsage_store_created_idx" ON "AdvancedOnlineSearchUsage" ("storeId","createdAt" DESC);
  `).catch(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AdvancedOnlineSearchUsage" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"actorId" TEXT,"query" TEXT NOT NULL,"provider" TEXT NOT NULL,"status" TEXT NOT NULL,"resultCount" INTEGER NOT NULL DEFAULT 0,"durationMs" INTEGER NOT NULL DEFAULT 0,"estimatedCostUsd" NUMERIC(12,6) NOT NULL DEFAULT 0,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdvancedOnlineSearchUsage_company_created_idx" ON "AdvancedOnlineSearchUsage" ("companyId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AdvancedOnlineSearchUsage_store_created_idx" ON "AdvancedOnlineSearchUsage" ("storeId","createdAt" DESC)`);
  });
  return usageReady;
}

const monthlyLimit=()=>Math.max(1,Number(process.env.ADVANCED_ONLINE_SEARCH_MONTHLY_LIMIT||1500));
const dailyLimit=()=>Math.max(1,Number(process.env.ADVANCED_ONLINE_SEARCH_DAILY_LIMIT||150));

async function usageCount(companyId,storeId){
  await ensureUsageTable();
  const rows=await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "createdAt">=date_trunc('month',CURRENT_TIMESTAMP))::int AS month_count,
      COUNT(*) FILTER (WHERE "createdAt">=date_trunc('day',CURRENT_TIMESTAMP) AND "storeId"=${storeId})::int AS day_store_count
    FROM "AdvancedOnlineSearchUsage"
    WHERE "companyId"=${companyId} AND "status" IN ('FOUND','NOT_FOUND','PROVIDER_ERROR')`;
  return {month:Number(rows[0]?.month_count||0),dayStore:Number(rows[0]?.day_store_count||0)};
}

async function logUsage({companyId,storeId,actorId,query,provider,status,resultCount=0,durationMs=0,estimatedCostUsd=0,details={}}){
  await ensureUsageTable();
  await prisma.$executeRaw`INSERT INTO "AdvancedOnlineSearchUsage" ("id","companyId","storeId","actorId","query","provider","status","resultCount","durationMs","estimatedCostUsd","details") VALUES (${crypto.randomUUID()},${companyId},${storeId},${actorId||null},${query},${provider},${status},${resultCount},${durationMs},${estimatedCostUsd},${JSON.stringify(details)}::jsonb)`;
}

function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,"")}catch{return ""}}
function cleanTitle(value=""){
  return String(value).replace(/\s+[|\-–—]\s+[^|\-–—]{2,50}$/u,"").replace(/\s+/g," ").trim().slice(0,240);
}
function exactBarcodeMatch(item,barcode){
  const hay=[item.title,item.snippet,item.link].filter(Boolean).join(" ");
  return hay.includes(barcode);
}
function normalizeSearchItems(items,barcode,provider){
  return (items||[]).filter(item=>exactBarcodeMatch(item,barcode)).slice(0,5).map((item,index)=>({
    id:`advanced:${provider.toLowerCase()}:${barcode}:${index}`,
    name:cleanTitle(item.title)||`Barcode ${barcode}`,
    sourceCode:barcode,
    vatRate:null,
    barcodes:[barcode],
    brandName:"",
    categoryName:"",
    subcategoryName:"",
    online:true,
    advancedOnline:true,
    source:"GOOGLE_SEARCH",
    provider,
    sourceDomain:domainOf(item.link),
    sourceUrl:item.link||null,
    snippet:String(item.snippet||"").trim().slice(0,500),
    confidence:"EXACT_BARCODE"
  }));
}

async function searchSerper(barcode,signal){
  const key=String(process.env.SERPER_API_KEY||"").trim();
  if(!key)return null;
  const response=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:`\"${barcode}\"`,gl:"gr",hl:"el",num:10}),signal});
  if(!response.ok)throw new Error(`SERPER_${response.status}`);
  const data=await response.json();
  return {provider:"SERPER_GOOGLE",items:(data.organic||[]).map(x=>({title:x.title,snippet:x.snippet,link:x.link})),estimatedCostUsd:Number(process.env.SERPER_ESTIMATED_COST_PER_QUERY_USD||0.001)};
}

async function searchGoogleCse(barcode,signal){
  const key=String(process.env.GOOGLE_CSE_API_KEY||"").trim(),cx=String(process.env.GOOGLE_CSE_CX||"").trim();
  if(!key||!cx)return null;
  const url=new URL("https://www.googleapis.com/customsearch/v1");url.searchParams.set("key",key);url.searchParams.set("cx",cx);url.searchParams.set("q",`\"${barcode}\"`);url.searchParams.set("gl","gr");url.searchParams.set("hl","el");url.searchParams.set("num","10");
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(`GOOGLE_CSE_${response.status}`);
  const data=await response.json();
  return {provider:"GOOGLE_CSE",items:(data.items||[]).map(x=>({title:x.title,snippet:x.snippet,link:x.link})),estimatedCostUsd:Number(process.env.GOOGLE_CSE_ESTIMATED_COST_PER_QUERY_USD||0.005)};
}

export function advancedProviderConfigured(){
  return Boolean(String(process.env.SERPER_API_KEY||"").trim()||(String(process.env.GOOGLE_CSE_API_KEY||"").trim()&&String(process.env.GOOGLE_CSE_CX||"").trim()));
}

export async function advancedOnlineProductSearch({companyId,storeId,actorId,barcode,bypassEntitlement=false,usageContext=null}){
  const entitled=bypassEntitlement?true:await advancedOnlineSearchEntitlement(companyId);
  if(!entitled)return {enabled:false,configured:advancedProviderConfigured(),reason:"MODULE_DISABLED",rows:[]};
  if(!advancedProviderConfigured())return {enabled:true,configured:false,reason:"PROVIDER_NOT_CONFIGURED",rows:[]};
  const usage=await usageCount(companyId,storeId);
  if(usage.month>=monthlyLimit()||usage.dayStore>=dailyLimit()){
    await logUsage({companyId,storeId,actorId,query:barcode,provider:"NONE",status:"LIMIT_REACHED",details:{usage,monthlyLimit:monthlyLimit(),dailyLimit:dailyLimit(),usageContext,bypassEntitlement}});
    return {enabled:true,configured:true,reason:"LIMIT_REACHED",usage,limits:{monthly:monthlyLimit(),dailyStore:dailyLimit()},rows:[]};
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500),started=Date.now();
  let provider="NONE";
  try{
    let result=await searchSerper(barcode,controller.signal);
    if(!result)result=await searchGoogleCse(barcode,controller.signal);
    if(!result)return {enabled:true,configured:false,reason:"PROVIDER_NOT_CONFIGURED",rows:[]};
    provider=result.provider;
    const rows=normalizeSearchItems(result.items,barcode,result.provider),durationMs=Date.now()-started;
    await logUsage({companyId,storeId,actorId,query:barcode,provider,status:rows.length?"FOUND":"NOT_FOUND",resultCount:rows.length,durationMs,estimatedCostUsd:result.estimatedCostUsd,details:{exactBarcodeOnly:true,usageContext,bypassEntitlement}});
    return {enabled:true,configured:true,reason:rows.length?"FOUND":"NOT_FOUND",provider,rows,usage:{month:usage.month+1,dayStore:usage.dayStore+1},limits:{monthly:monthlyLimit(),dailyStore:dailyLimit()}};
  }catch(error){
    const durationMs=Date.now()-started;
    await logUsage({companyId,storeId,actorId,query:barcode,provider,status:"PROVIDER_ERROR",durationMs,details:{message:String(error?.message||error).slice(0,180),usageContext,bypassEntitlement}}).catch(()=>{});
    return {enabled:true,configured:true,reason:error?.name==="AbortError"?"TIMEOUT":"PROVIDER_ERROR",provider,rows:[]};
  }finally{clearTimeout(timer)}
}
