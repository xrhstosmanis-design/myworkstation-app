import {z} from "zod";
import {prisma} from "../prisma.js";
import {salesReportCalendar} from "./sales-report-calendar.js";
import {readSalesAnalysisReport} from "../routes/kiosk-reports-sales-v4.js";

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const salesStoresArguments=z.object({mode:z.enum(["names","family","category","offers"]),names:z.array(z.string().trim().min(1).max(120)).max(20),from:day,to:day}).strict().superRefine((a,c)=>{
  if(["names","family"].includes(a.mode)&&!a.names.length||a.mode==="category"&&a.names.length!==1||a.mode==="offers"&&a.names.length)c.addIssue({code:z.ZodIssueCode.custom,message:"Δώσε ονομασίες ειδών, μία κατηγορία ή όλες τις εφαρμοσμένες προσφορές."});
  try{salesReportCalendar(a.from,a.to)}catch(e){c.addIssue({code:z.ZodIssueCode.custom,message:e.message})}
});
export const salesStoresTool={type:"function",name:"sales_by_store",strict:true,description:"Κανονικές πωλήσεις ανά εξουσιοδοτημένο κατάστημα και είδος: πολλές ονομασίες, μία κατηγορία ή πραγματικά εφαρμοσμένες προσφορές. family: όλες οι πραγματικές ονομασίες/συσκευασίες που ταιριάζουν στη μάρκα ή γενική ονομασία, π.χ. κόκα κόλα· επιστρέφονται χωριστές γραμμές ανά είδος. Δεν απαιτεί SKU. Ασαφείς συγκεκριμένες ονομασίες επιστρέφουν ονομαστικές επιλογές. Το εύρος καταστημάτων ορίζεται από τον χρήστη στην οθόνη, ποτέ από το μοντέλο. Μόνο ανάγνωση.",parameters:{type:"object",additionalProperties:false,properties:{mode:{type:"string",enum:["names","family","category","offers"]},names:{type:"array",items:{type:"string"},description:"names: συγκεκριμένες ονομασίες. family: γενικές ονομασίες/μάρκες του χρήστη για όλες τις καταγεγραμμένες συσκευασίες. category: μία ονομασία κατηγορίας. offers: κενή λίστα."},from:{type:"string"},to:{type:"string"}},required:["mode","names","from","to"]}};
export const salesName=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").replace(/\bfix\b/g,"φιξ").replace(/(\d)([a-zα-ω])/g,"$1 $2").replace(/([a-zα-ω])(\d)/g,"$1 $2").replace(/[^a-zα-ω0-9]+/g," ").trim().replace(/\s+/g," ").replace(/(^| )(?:κοκα ?κολα|coca ?cola)(?= |$)/g,"$1coca cola");
const categoryName=value=>salesName(value).replace(/(^| )(?:μπυρες|μπιρες|μπυρα|μπιρα)(?= |$)/g,"$1μπυρα");
const nameMatches=(name,query,normalize=salesName)=>{const tokens=normalize(name).split(" ");return normalize(query).split(" ").every(t=>tokens.includes(t))};
const fail=message=>{throw Object.assign(new Error(message),{status:502})};
export async function readSalesNamesCatalog(companyId,{db=prisma}={}){
  return db.$queryRaw`SELECT p."id" AS "productId",p."name",p."unit",c."name" AS "categoryName",mp."subcategoryName"
    FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" AND c."companyId"=p."companyId"
    LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId" WHERE p."companyId"=${companyId} ORDER BY p."id" LIMIT 30001`;
}
const numbers=["salesQuantity","grossSales","netSales","vatValue","reversalCount","returnGrossValue"];
export async function readAssistantSalesStores(value,access,{readReport=readSalesAnalysisReport,readCatalog=readSalesNamesCatalog,verify=async()=>{},signal,now=new Date()}={}){
  const args=salesStoresArguments.parse(value),calendar=salesReportCalendar(args.from,args.to);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const base={kind:"sales_by_store",source:"Στατιστικά πωλήσεων",scope:access.scope,mode:args.mode,names:args.names,from:args.from,to:args.to,timeZone:"Europe/Athens",observedAt:now.toISOString(),incompletePeriod:args.to>=today,asOf:today,rows:[],stores:[],candidates:[],unavailable:access.excluded||[],totals:null,truncated:false,reversalAware:true,nonFiscal:true};
  const scopes=access.stores||[];
  if(scopes.length>100||access.truncated)return {...base,result:"source_limited",truncated:true};
  if(!scopes.length)return {...base,result:"no_match"};
  const catalogs=new Map(),ids=new Map();
  if(args.mode!=="offers"){
    for(const companyId of new Set(scopes.map(s=>s.companyId))){
      signal?.throwIfAborted();await verify();
      const rows=await readCatalog(companyId);await verify();
      if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.productId!=="string"||!r.productId||typeof r.name!=="string"))fail("Μη έγκυρος κατάλογος ονομασιών.");
      if(rows.length>30000)return {...base,result:"source_limited",truncated:true};
      catalogs.set(companyId,rows);ids.set(companyId,new Set());
    }
    for(const query of args.names){
      const normalize=args.mode==="category"?categoryName:salesName;
      const candidates=[...catalogs.entries()].flatMap(([companyId,rows])=>rows.map(r=>({...r,companyId})));
      const labels=r=>args.mode==="category"?[r.categoryName,r.subcategoryName].filter(Boolean):[r.name];
      const exact=args.mode==="family"?[]:candidates.filter(r=>labels(r).some(n=>normalize(n)===normalize(query)));
      const matches=exact.length?exact:candidates.filter(r=>labels(r).some(n=>nameMatches(n,query,normalize)));
      const distinct=new Map();
      for(const r of matches)for(const label of labels(r))if(normalize(label)===normalize(query)||!exact.length&&nameMatches(label,query,normalize))distinct.set(normalize(label),label);
      if(!matches.length)return {...base,result:"no_match",unresolvedName:query};
      if(args.mode!=="family"&&distinct.size!==1)return {...base,result:"ambiguous",unresolvedName:query,candidates:[...distinct.values()].slice(0,20),truncated:distinct.size>20};
      for(const r of matches)ids.get(r.companyId).add(r.productId);
    }
  }
  const rows=[],stores=[];
  for(const scope of scopes){
    signal?.throwIfAborted();await verify();
    const productIds=args.mode==="offers"?null:[...(ids.get(scope.companyId)||[])];
    if(productIds?.length===0){stores.push({...scope,result:"no_matching_catalog",grossSales:null,quantities:[]});continue}
    const report=await readReport({companyId:scope.companyId,storeId:scope.storeId,from:calendar.from,to:calendar.to,calendar,q:null,productIds,promotionsOnly:args.mode==="offers",observedThrough:now});await verify();
    if(args.mode==="offers"&&report?.unattributedPromotionReversal)return {...base,result:"source_limited",truncated:true,reason:"Υπάρχουν επιστροφές χωρίς καταγεγραμμένη σύνδεση στην αρχική προσφορά. Δεν επιβεβαιώνεται πλήρες σύνολο."};
    if(report?.companyId!==scope.companyId||report.storeId!==scope.storeId||report.period?.calendarFrom!==args.from||report.period?.calendarTo!==args.to||report.period?.timeZone!=="Europe/Athens"||report.period?.from!==calendar.from.toISOString()||report.period?.toExclusive!==calendar.to.toISOString()||report.reversalAware!==true||!Array.isArray(report.items)||report.count!==report.items.length)fail("Η πηγή πωλήσεων δεν αντιστοιχεί στο εξουσιοδοτημένο κατάστημα και περίοδο.");
    if(report.items.length>=10000)return {...base,result:"source_limited",truncated:true};
    if(report.items.some(r=>r.storeId!==scope.storeId||typeof r.name!=="string"||numbers.some(k=>typeof r[k]!=="number"||!Number.isFinite(r[k]))||productIds&&!productIds.includes(r.productId)||args.mode==="offers"&&(!r.promotionId||typeof r.promotionId!=="string")))fail("Η πηγή πωλήσεων επέστρεψε μη έγκυρα ή ξένα στοιχεία.");
    const projected=report.items.map(r=>({...scope,...Object.fromEntries(["productId","sku","name","unit","salesQuantity","grossSales","netSales","vatValue","reversalCount","returnGrossValue",...(args.mode==="offers"?["promotionId","promotionName","promotionType"]:[])].map(k=>[k,r[k]]))}));
    rows.push(...projected);if(rows.length>2000)return {...base,result:"source_limited",truncated:true};
    const quantities=new Map();for(const r of projected){const unit=r.unit||"UNKNOWN";quantities.set(unit,unit==="UNKNOWN"?null:(quantities.get(unit)||0)+r.salesQuantity)}
    stores.push({...scope,result:"complete",grossSales:projected.reduce((n,r)=>n+r.grossSales,0),quantities:[...quantities].map(([unit,quantity])=>({unit,quantity}))});
  }
  await verify();
  const complete=!base.unavailable.length&&stores.every(s=>s.result==="complete"),quantities=new Map();
  for(const s of stores)for(const q of s.quantities)quantities.set(q.unit,q.unit==="UNKNOWN"?null:(quantities.get(q.unit)||0)+q.quantity);
  return {...base,result:rows.length?"matched":"no_sales",rows,stores,totals:complete?{grossSales:stores.reduce((n,s)=>n+s.grossSales,0),quantities:[...quantities].map(([unit,quantity])=>({unit,quantity}))}:null,complete};
}
