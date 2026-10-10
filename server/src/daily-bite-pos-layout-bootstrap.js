import crypto from "crypto";
import {prisma} from "./prisma.js";
import {DAILY_BITE_PRESET,dailyBiteNameKey} from "./daily-bite-pos-preset.js";

const COMPANY_ID="cmv25lf0w000seegf1cn4bbmx";
const STORE_ID="cmv25lf3h000ueegf0kkii3pb";
const PATCH_KEY="DAILY_BITE_POS_LAYOUT_20261010_V1";
const uid=()=>crypto.randomUUID();
const colors=["#dfeee9","#cfe5dc","#e8f3ef","#d7ebe4","#edf5f2","#c9e1d8"];

async function markerTable(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DataPatchMarker" ("key" TEXT PRIMARY KEY,"appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"detailsJson" JSONB NOT NULL DEFAULT '{}'::jsonb)`);
}
const blankQuick=i=>({id:`quick-fixed-${i+1}`,label:"ΚΕΝΟ",productQuery:"",productCodes:[],color:"#edf5f2",visible:true});
const blankCategory=i=>({id:`category-fixed-${i+1}`,label:`ΚΑΤΗΓΟΡΙΑ ${i+1}`,categoryName:`ΚΑΤΗΓΟΡΙΑ ${i+1}`,productCodes:[],color:"#edf5f2",visible:false});
const fixedButtons=[
  {id:"cancel",label:"ΑΚΥΡΩΣΗ",action:"CLEAR_CART",color:"#ef4444",visible:true},
  {id:"hold",label:"ΑΝΑΜΟΝΗ",action:"HOLD",color:"#edf2f1",visible:true},
  {id:"payments",label:"ΠΛΗΡΩΜΕΣ",action:"PAYMENTS",color:"#edf2f1",visible:true},
  {id:"preparation",label:"ΠΑΡΑΣΚΕΥΗ",action:"PRINT",color:"#edf2f1",visible:true},
  {id:"waste",label:"Κλείσιμο χωρίς Εκτύπωση",action:"WASTE",color:"#edf2f1",visible:true},
  {id:"mixed",label:"ΜΙΚΤΗ",action:"MIXED",color:"#7c3aed",visible:true},
  {id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3378cf",visible:true},
  {id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#0b8f5a",visible:true}
];

export async function ensureDailyBitePosLayout(){
  await markerTable();
  const marked=(await prisma.$queryRaw`SELECT "key" FROM "DataPatchMarker" WHERE "key"=${PATCH_KEY} LIMIT 1`)[0];
  if(marked)return {ok:true,alreadyApplied:true};

  const [company,store]=await Promise.all([
    prisma.company.findUnique({where:{id:COMPANY_ID},select:{id:true,name:true,active:true}}),
    prisma.store.findUnique({where:{id:STORE_ID},select:{id:true,name:true,companyId:true,active:true}})
  ]);
  if(!company?.active||!String(company.name||"").toUpperCase().includes("DAILY BITE"))throw new Error("DAILY BITE POS layout: company mismatch.");
  if(!store?.active||store.companyId!==COMPANY_ID)throw new Error("DAILY BITE POS layout: store mismatch.");

  const existing=(await prisma.$queryRaw`SELECT "version" FROM "StorePosLayout" WHERE "storeId"=${STORE_ID} LIMIT 1`)[0];
  if(existing){
    await prisma.$executeRaw`INSERT INTO "DataPatchMarker" ("key","detailsJson") VALUES (${PATCH_KEY},${JSON.stringify({skipped:"existing-layout",version:Number(existing.version||0)})}::jsonb) ON CONFLICT ("key") DO NOTHING`;
    return {ok:true,skipped:"existing-layout",version:Number(existing.version||0)};
  }

  const products=await prisma.$queryRaw`
    SELECT p."id",p."name",p."sku",c."name" AS "categoryName"
    FROM "Product" p
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${STORE_ID} AND sp."active"=TRUE
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
    WHERE p."companyId"=${COMPANY_ID} AND p."active"=TRUE
    ORDER BY p."name",p."id"`;
  const byName=new Map();
  for(const row of products){const key=dailyBiteNameKey(row.name);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(row)}

  const prepared=await prisma.$queryRaw`
    SELECT p."id",p."name",c."name" AS "categoryName"
    FROM "PreparationProductSettings" ps
    JOIN "Product" p ON p."id"=ps."productId" AND p."companyId"=ps."companyId" AND p."active"=TRUE
    JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${STORE_ID} AND sp."active"=TRUE
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
    WHERE ps."companyId"=${COMPANY_ID} AND ps."preparationEnabled"=TRUE
    ORDER BY p."name"`;
  const cold=prepared.filter(x=>String(x.categoryName||"").includes("ΚΡΥΑ")).map(x=>x.id);
  const hot=prepared.filter(x=>String(x.categoryName||"").includes("ΖΕΣΤΑ")).map(x=>x.id);
  const otherPrepared=prepared.filter(x=>!cold.includes(x.id)&&!hot.includes(x.id)).map(x=>x.id);
  cold.push(...otherPrepared);

  const missing=[],ambiguous=[];
  const screenshotCategories=DAILY_BITE_PRESET.map((group,index)=>{
    const ids=[];
    for(const wanted of group.products){
      const found=byName.get(dailyBiteNameKey(wanted))||[];
      if(found.length===1)ids.push(found[0].id);
      else if(found.length===0)missing.push({category:group.label,name:wanted});
      else ambiguous.push({category:group.label,name:wanted,count:found.length});
    }
    return {id:`category-fixed-${index+3}`,label:group.label,categoryName:group.label,productCodes:[...new Set(ids)].slice(0,40),color:colors[index%colors.length],visible:true};
  });

  const categories=[
    {id:"category-fixed-1",label:"ΚΑΦΕΣ ΚΡΥΑ",categoryName:"ΡΟΦΗΜΑΤΑ ΚΡΥΑ ΠΑΡΑΓΩΓΗΣ",productCodes:[...new Set(cold)].slice(0,40),color:"#cfe5dc",visible:true},
    {id:"category-fixed-2",label:"ΚΑΦΕΣ ΖΕΣΤΑ",categoryName:"ΡΟΦΗΜΑΤΑ ΖΕΣΤΑ ΠΑΡΑΓΩΓΗΣ",productCodes:[...new Set(hot)].slice(0,40),color:"#dfeee9",visible:true},
    ...screenshotCategories
  ];
  while(categories.length<14)categories.push(blankCategory(categories.length));

  const layout={
    catalogCompanyId:COMPANY_ID,
    title:"DAILY BITE POS",
    productColumns:5,
    showSku:false,
    buttonFontScale:1.15,
    theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},
    quickKeys:Array.from({length:20},(_,i)=>blankQuick(i)),
    categories:categories.slice(0,14),
    buttons:fixedButtons
  };
  const admin=(await prisma.$queryRaw`SELECT "id" FROM "User" WHERE "role"='SUPER_ADMIN' ORDER BY "createdAt" LIMIT 1`)[0];
  const details={preparedProducts:prepared.length,cold:cold.length,hot:hot.length,screenshotMatched:screenshotCategories.reduce((s,x)=>s+x.productCodes.length,0),missing,ambiguous};

  const inserted=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw`
      INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt")
      VALUES (${STORE_ID},${COMPANY_ID},${JSON.stringify(layout)}::jsonb,1,${admin?.id||null},NOW())
      ON CONFLICT ("storeId") DO NOTHING
      RETURNING "version"`;
    if(!rows.length)return false;
    await tx.$executeRaw`INSERT INTO "DataPatchMarker" ("key","detailsJson") VALUES (${PATCH_KEY},${JSON.stringify(details)}::jsonb)`;
    return true;
  });
  if(!inserted)return {ok:true,skipped:"concurrent-existing-layout"};
  console.log(`DAILY BITE POS layout published: 12 visible categories, ${prepared.length} prepared coffees, ${details.screenshotMatched} screenshot mappings, ${missing.length} missing, ${ambiguous.length} ambiguous.`);
  return {ok:true,version:1,...details};
}
