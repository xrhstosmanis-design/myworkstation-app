import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]+/g," ").replace(/\s+/g," ").trim();
const tokens=v=>norm(v).split(" ").filter(x=>x.length>=3&&!/^\d+$/.test(x)).slice(0,8);
const validGtin=value=>{
  const s=String(value||"").replace(/\D/g,"");
  if(![8,12,13,14].includes(s.length))return false;
  const digits=[...s].map(Number),check=digits.pop();let sum=0,weight=3;
  for(let i=digits.length-1;i>=0;i--){sum+=digits[i]*weight;weight=weight===3?1:3}
  return (10-(sum%10))%10===check;
};
const extractGtins=text=>[...new Set((String(text||"").match(/(?<!\d)\d{8,14}(?!\d)/g)||[]).map(x=>x.replace(/\D/g,"")).filter(validGtin))];
const localRows=async(supplierItemCode,description)=>{
  const code=String(supplierItemCode||"").trim(),desc=String(description||"").trim();
  if(code){
    const exact=await prisma.$queryRaw`
      SELECT mp."id",mp."sourceCode",mp."name",mp."brandName",mp."categoryName",mp."subcategoryName",
        COALESCE((SELECT json_agg(mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes"
      FROM "MasterProduct" mp
      WHERE mp."active"=true AND mp."sourceCode"=${code}
      LIMIT 10`;
    if(exact.length)return exact;
  }
  if(desc.length>=4){
    const like=`%${desc.replace(/\s+/g,"%")}%`;
    const byName=await prisma.$queryRaw`
      SELECT mp."id",mp."sourceCode",mp."name",mp."brandName",mp."categoryName",mp."subcategoryName",
        COALESCE((SELECT json_agg(mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes"
      FROM "MasterProduct" mp
      WHERE mp."active"=true AND mp."name" ILIKE ${like}
      LIMIT 10`;
    if(byName.length)return byName;
    const ts=tokens(desc).slice(0,3);
    if(ts.length){
      const pattern=`%${ts.join("%")}%`;
      return prisma.$queryRaw`
        SELECT mp."id",mp."sourceCode",mp."name",mp."brandName",mp."categoryName",mp."subcategoryName",
          COALESCE((SELECT json_agg(mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes"
        FROM "MasterProduct" mp
        WHERE mp."active"=true AND mp."name" ILIKE ${pattern}
        LIMIT 10`;
    }
  }
  return [];
};
function scoreLocal(row,code,description){
  let score=0;const rn=norm(row.name),dt=tokens(description);
  if(code&&String(row.sourceCode||"").trim()===String(code).trim())score+=70;
  if(dt.length){const hits=dt.filter(t=>rn.includes(t)).length;score+=Math.round(30*hits/dt.length)}
  const barcodes=(Array.isArray(row.barcodes)?row.barcodes:[]).map(String).filter(validGtin);
  return {row,barcodes,score};
}
async function webSearch(query,signal){
  const serper=String(process.env.SERPER_API_KEY||"").trim();
  if(serper){
    const r=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":serper,"Content-Type":"application/json"},body:JSON.stringify({q:query,gl:"gr",hl:"el",num:10}),signal});
    if(!r.ok)throw new Error(`SERPER_${r.status}`);const d=await r.json();
    return {provider:"SERPER_GOOGLE",items:(d.organic||[]).map(x=>({title:x.title||"",snippet:x.snippet||"",link:x.link||""}))};
  }
  const key=String(process.env.GOOGLE_CSE_API_KEY||"").trim(),cx=String(process.env.GOOGLE_CSE_CX||"").trim();
  if(key&&cx){
    const u=new URL("https://www.googleapis.com/customsearch/v1");u.searchParams.set("key",key);u.searchParams.set("cx",cx);u.searchParams.set("q",query);u.searchParams.set("gl","gr");u.searchParams.set("hl","el");u.searchParams.set("num","10");
    const r=await fetch(u,{signal});if(!r.ok)throw new Error(`GOOGLE_CSE_${r.status}`);const d=await r.json();
    return {provider:"GOOGLE_CSE",items:(d.items||[]).map(x=>({title:x.title||"",snippet:x.snippet||"",link:x.link||""}))};
  }
  return null;
}
function scoreWeb(items,code,description){
  const dt=tokens(description),counts=new Map();
  items.forEach((item,index)=>{
    const text=[item.title,item.snippet,item.link].join(" "),ntext=norm(text),codeHit=code&&ntext.includes(norm(code)),nameHits=dt.filter(t=>ntext.includes(t)).length;
    for(const barcode of extractGtins(text)){
      const prev=counts.get(barcode)||{barcode,mentions:0,score:0,evidence:[]};prev.mentions++;
      prev.score+=35+(codeHit?25:0)+(dt.length?Math.round(30*nameHits/dt.length):0)+(index===0?5:0);
      prev.evidence.push({title:item.title,link:item.link});counts.set(barcode,prev);
    }
  });
  return [...counts.values()].sort((a,b)=>(b.mentions-a.mentions)||(b.score-a.score)).slice(0,5);
}
router.post("/invoice-learning/barcode-resolve",async(req,res,next)=>{try{
  const {supplierItemCode="",description=""}=req.body||{};
  const local=await localRows(supplierItemCode,description);const ranked=local.map(r=>scoreLocal(r,supplierItemCode,description)).filter(x=>x.barcodes.length).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&ranked[0].score>=70){
    const best=ranked[0];return res.json({ok:true,found:true,accepted:best.barcodes.length===1,barcode:best.barcodes.length===1?best.barcodes[0]:"",source:"MASTER_CATALOG",confidence:Math.min(100,best.score),masterProduct:{id:best.row.id,name:best.row.name,sourceCode:best.row.sourceCode},candidates:best.barcodes.map(b=>({barcode:b,source:"MASTER_CATALOG",confidence:Math.min(100,best.score)}))});
  }
  const query=[supplierItemCode&&`"${String(supplierItemCode).trim()}"`,String(description||"").trim(),"barcode EAN GTIN"].filter(Boolean).join(" ");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
    const result=await webSearch(query,controller.signal);if(!result)return res.json({ok:true,found:false,accepted:false,source:"NONE",reason:"ONLINE_PROVIDER_NOT_CONFIGURED",candidates:[]});
    const candidates=scoreWeb(result.items,supplierItemCode,description).map(x=>({...x,source:"GOOGLE_SEARCH",provider:result.provider,confidence:Math.min(99,Math.round(x.score/Math.max(1,x.mentions)))}));
    const best=candidates[0],second=candidates[1];const accepted=Boolean(best&&(best.mentions>=2||best.confidence>=85)&&(!second||best.barcode!==second.barcode||best.score>=second.score+20));
    return res.json({ok:true,found:Boolean(best),accepted,barcode:accepted?best.barcode:"",source:best?"GOOGLE_SEARCH":"NONE",provider:result.provider,confidence:best?.confidence||0,candidates});
  }finally{clearTimeout(timer)}
}catch(error){next(error)}});

export default router;
