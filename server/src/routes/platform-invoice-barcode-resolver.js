import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]+/g," ").replace(/\s+/g," ").trim();
const tokens=v=>norm(v).split(" ").filter(x=>x.length>=2&&!/^\d+$/.test(x)).slice(0,12);
const stop=new Set(["PET","X12","X6","X24","ΤΕΜ","ΤΜΧ","PCS","ML","LT","LIT","GR"]);
const meaningful=v=>tokens(v).filter(t=>!stop.has(t));
const validGtin=value=>{
  const s=String(value||"").replace(/\D/g,"");
  if(![8,12,13,14].includes(s.length))return false;
  const digits=[...s].map(Number),check=digits.pop();let sum=0,weight=3;
  for(let i=digits.length-1;i>=0;i--){sum+=digits[i]*weight;weight=weight===3?1:3}
  return (10-(sum%10))%10===check;
};
const extractGtins=text=>[...new Set((String(text||"").match(/(?<!\d)\d{8,14}(?!\d)/g)||[]).map(x=>x.replace(/\D/g,"")).filter(validGtin))];
const selectSql=`SELECT mp."id",mp."sourceCode",mp."name",mp."brandName",mp."categoryName",mp."subcategoryName", COALESCE((SELECT json_agg(mpb."barcode") FROM "MasterProductBarcode" mpb WHERE mpb."masterProductId"=mp."id"),'[]') AS "barcodes" FROM "MasterProduct" mp`;

async function localRows(supplierItemCode,description){
  const code=String(supplierItemCode||"").trim(),desc=String(description||"").trim();
  const found=new Map();
  const add=rows=>(rows||[]).forEach(r=>found.set(r.id,r));
  if(code){
    add(await prisma.$queryRawUnsafe(`${selectSql} WHERE mp."active"=true AND mp."sourceCode"=$1 LIMIT 20`,code));
  }
  if(desc.length>=3){
    const exact=norm(desc);
    add(await prisma.$queryRawUnsafe(`${selectSql} WHERE mp."active"=true AND upper(regexp_replace(mp."name",'[^A-Za-zΑ-Ωα-ω0-9]+',' ','g')) LIKE $1 LIMIT 30`,`%${exact}%`));
    const ts=meaningful(desc);
    for(const t of ts.slice(0,5)){
      add(await prisma.$queryRawUnsafe(`${selectSql} WHERE mp."active"=true AND (mp."name" ILIKE $1 OR COALESCE(mp."brandName",'') ILIKE $1) LIMIT 30`,`%${t}%`));
    }
  }
  return [...found.values()];
}
function scoreLocal(row,code,description){
  let score=0;const rn=norm(row.name),rb=norm(row.brandName),dt=meaningful(description),dn=norm(description);
  if(code&&String(row.sourceCode||"").trim()===String(code).trim())score+=80;
  if(dn&&rn===dn)score+=90;
  else if(dn&&(rn.includes(dn)||dn.includes(rn)))score+=55;
  if(dt.length){const hits=dt.filter(t=>rn.includes(t)||rb.includes(t)).length;score+=Math.round(55*hits/dt.length);if(hits>=Math.min(3,dt.length))score+=10}
  const barcodes=(Array.isArray(row.barcodes)?row.barcodes:[]).map(String).filter(validGtin);
  return {row,barcodes,score:Math.min(100,score)};
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
  const dt=meaningful(description),counts=new Map();
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
  const local=await localRows(supplierItemCode,description);
  const ranked=local.map(r=>scoreLocal(r,supplierItemCode,description)).filter(x=>x.barcodes.length).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&ranked[0].score>=70){
    const best=ranked[0],second=ranked[1];
    const safe=best.barcodes.length===1&&(!second||best.score>=second.score+12);
    return res.json({ok:true,found:true,accepted:safe,barcode:safe?best.barcodes[0]:"",source:"MASTER_CATALOG",confidence:best.score,masterProduct:{id:best.row.id,name:best.row.name,sourceCode:best.row.sourceCode,brandName:best.row.brandName},candidates:ranked.slice(0,5).flatMap(x=>x.barcodes.map(b=>({barcode:b,source:"MASTER_CATALOG",confidence:x.score,masterProductName:x.row.name}))) });
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
