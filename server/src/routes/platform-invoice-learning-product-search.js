import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const escLike=v=>String(v||"").replace(/[\\%_]/g,m=>`\\${m}`);
const barcodesFrom=text=>[...new Set((String(text||"").match(/(?:^|\D)(\d{8,14})(?=\D|$)/g)||[]).map(x=>(x.match(/\d{8,14}/)||[])[0]).filter(Boolean))];

router.get("/invoice-learning/product-search",async(req,res,next)=>{try{
  const q=String(req.query.q||"").trim();
  if(q.length<2)return res.status(400).json({error:"Γράψε τουλάχιστον 2 χαρακτήρες."});
  const like=`%${escLike(q)}%`;
  const master=await prisma.$queryRawUnsafe(`
    SELECT mp."id",mp."sourceCode",mp."name",mp."brandName",mp."categoryName",mp."subcategoryName",
      COALESCE((SELECT json_agg(mb."barcode") FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id"),'[]') AS "barcodes"
    FROM "MasterProduct" mp
    WHERE mp."active"=true AND (mp."name" ILIKE $1 ESCAPE '\\' OR COALESCE(mp."sourceCode",'') ILIKE $1 ESCAPE '\\' OR COALESCE(mp."brandName",'') ILIKE $1 ESCAPE '\\')
    ORDER BY CASE WHEN UPPER(mp."name")=UPPER($2) THEN 0 WHEN UPPER(mp."name") LIKE UPPER($3) THEN 1 ELSE 2 END, mp."name"
    LIMIT 15`,like,q,`${q}%`).catch(()=>[]);
  let google=[];
  const key=String(process.env.SERPER_API_KEY||"").trim();
  if(key){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500);
    try{
      const response=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:`${q} barcode EAN`,gl:"gr",hl:"el",num:10}),signal:controller.signal});
      if(response.ok){
        const data=await response.json(),seen=new Set();
        for(const x of data.organic||[]){
          const text=[x.title,x.snippet,x.link].filter(Boolean).join(" ");
          for(const barcode of barcodesFrom(text)){
            if(seen.has(barcode))continue;seen.add(barcode);
            google.push({name:String(x.title||q).replace(/\s+/g," ").trim().slice(0,180),barcode,provider:"SERPER_GOOGLE",sourceUrl:x.link||null,snippet:String(x.snippet||"").trim().slice(0,300)});
            if(google.length>=10)break;
          }
          if(google.length>=10)break;
        }
      }
    }catch{}finally{clearTimeout(timer)}
  }
  res.json({query:q,master:master.map(x=>({...x,barcodes:Array.isArray(x.barcodes)?x.barcodes:[]})),google,googleConfigured:Boolean(key)});
}catch(error){next(error)}});

export default router;
