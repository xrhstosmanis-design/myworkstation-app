import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]+/g," ").replace(/\s+/g," ").trim();
const greekToLatin={Α:"A",Β:"B",Γ:"G",Δ:"D",Ε:"E",Ζ:"Z",Η:"H",Θ:"TH",Ι:"I",Κ:"K",Λ:"L",Μ:"M",Ν:"N",Ξ:"X",Ο:"O",Π:"P",Ρ:"P",Σ:"S",Τ:"T",Υ:"Y",Φ:"F",Χ:"X",Ψ:"PS",Ω:"O"};
const canonical=v=>norm(v).split("").map(ch=>greekToLatin[ch]||ch).join("").replace(/\s+/g," ").trim();
const tokens=v=>norm(v).split(" ").filter(x=>x.length>=2&&!/^\d+$/.test(x)).slice(0,14);
const canonicalTokens=v=>canonical(v).split(" ").filter(x=>x.length>=2&&!/^\d+$/.test(x)).slice(0,14);
const stop=new Set(["PET","X12","X6","X24","TEM","TMX","PCS","ML","LT","LIT","GR","500","330","250"]);
const meaningful=v=>canonicalTokens(v).filter(t=>!stop.has(t));
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
    const rawTokens=tokens(desc).filter(t=>t.length>=3&&!stop.has(canonical(t))).slice(0,7);
    for(const t of rawTokens){
      add(await prisma.$queryRawUnsafe(`${selectSql} WHERE mp."active"=true AND (mp."name" ILIKE $1 OR COALESCE(mp."brandName",'') ILIKE $1) LIMIT 40`,`%${t}%`));
    }
    const brandish=rawTokens.find(t=>/[A-Z]/.test(t)&&t.length>=5);
    if(brandish)add(await prisma.$queryRawUnsafe(`${selectSql} WHERE mp."active"=true AND (mp."name" ILIKE $1 OR COALESCE(mp."brandName",'') ILIKE $1) LIMIT 60`,`%${brandish}%`));
  }
  return [...found.values()];
}

function scoreLocal(row,code,description){
  let score=0;
  const rn=canonical(row.name),rb=canonical(row.brandName),dn=canonical(description),dt=meaningful(description);
  if(code&&String(row.sourceCode||"").trim()===String(code).trim())score+=85;
  if(dn&&rn===dn)score+=95;
  else if(dn&&(rn.includes(dn)||dn.includes(rn)))score+=60;
  if(dt.length){
    const hits=dt.filter(t=>rn.includes(t)||rb.includes(t)).length;
    const ratio=hits/dt.length;
    score+=Math.round(65*ratio);
    if(hits>=2)score+=8;
    if(hits>=3)score+=8;
  }
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
    const text=[item.title,item.snippet,item.link].join(" "),ntext=canonical(text),codeHit=code&&ntext.includes(canonical(code)),nameHits=dt.filter(t=>ntext.includes(t)).length;
    for(const barcode of extractGtins(text)){
      const prev=counts.get(barcode)||{barcode,mentions:0,score:0,evidence:[]};prev.mentions++;
      prev.score+=35+(codeHit?25:0)+(dt.length?Math.round(35*nameHits/dt.length):0)+(index===0?5:0);
      prev.evidence.push({title:item.title,link:item.link});counts.set(barcode,prev);
    }
  });
  return [...counts.values()].sort((a,b)=>(b.mentions-a.mentions)||(b.score-a.score)).slice(0,5);
}

router.post("/invoice-learning/barcode-resolve",async(req,res,next)=>{try{
  const {supplierItemCode="",description=""}=req.body||{};
  const local=await localRows(supplierItemCode,description);
  const ranked=local.map(r=>scoreLocal(r,supplierItemCode,description)).filter(x=>x.barcodes.length).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&ranked[0].score>=45){
    const best=ranked[0],second=ranked[1];
    const safe=best.score>=75&&best.barcodes.length===1&&(!second||best.score>=second.score+12);
    const candidates=ranked.slice(0,5).flatMap(x=>x.barcodes.map(b=>({barcode:b,source:"MASTER_CATALOG",confidence:x.score,masterProductName:x.row.name,masterProductId:x.row.id}))).slice(0,8);
    return res.json({ok:true,found:true,accepted:safe,barcode:safe?best.barcodes[0]:"",source:"MASTER_CATALOG",confidence:best.score,masterProduct:{id:best.row.id,name:best.row.name,sourceCode:best.row.sourceCode,brandName:best.row.brandName},candidates});
  }

  const queries=[
    [supplierItemCode&&`"${String(supplierItemCode).trim()}"`,String(description||"").trim(),"barcode EAN GTIN"].filter(Boolean).join(" "),
    [String(description||"").trim(),"barcode EAN GTIN"].filter(Boolean).join(" ")
  ].filter((q,i,a)=>q&&a.indexOf(q)===i);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    let provider=null,items=[];
    for(const query of queries){
      const result=await webSearch(query,controller.signal);
      if(!result)break;
      provider=result.provider;items.push(...result.items);
      if(scoreWeb(items,supplierItemCode,description).length)break;
    }
    if(!provider)return res.json({ok:true,found:false,accepted:false,source:"NONE",reason:"ONLINE_PROVIDER_NOT_CONFIGURED",candidates:[]});
    const candidates=scoreWeb(items,supplierItemCode,description).map(x=>({...x,source:"GOOGLE_SEARCH",provider,confidence:Math.min(99,Math.round(x.score/Math.max(1,x.mentions)))}));
    const best=candidates[0],second=candidates[1];const accepted=Boolean(best&&(best.mentions>=2||best.confidence>=85)&&(!second||best.barcode!==second.barcode||best.score>=second.score+20));
    return res.json({ok:true,found:Boolean(best),accepted,barcode:accepted?best.barcode:"",source:best?"GOOGLE_SEARCH":"NONE",provider,confidence:best?.confidence||0,candidates});
  }finally{clearTimeout(timer)}
}catch(error){next(error)}});

export default router;
