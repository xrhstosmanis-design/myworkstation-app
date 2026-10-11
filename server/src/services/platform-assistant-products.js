import {prisma} from "../prisma.js";
import {cashTool,readCanonicalPlatformCash} from "./assistant-cash-tools.js";
import {assistantProductTools,runProductAssistant,salesToolArguments,productSalesEvidence} from "./owner-sales-tools.js";
import {stockToolArguments,productStockEvidence} from "./owner-stock-tools.js";
import {salesReportCalendar} from "./sales-report-calendar.js";
import {readSalesAnalysisReport} from "../routes/kiosk-reports-sales-v4.js";
import {readStockAnalysisReport} from "../routes/kiosk-reports-stock-v3.js";
import {salesStoresTool,readAssistantSalesStores} from "./assistant-sales-stores.js";
import {authorizePlatformSalesStores,salesAccessKey} from "./assistant-sales-access.js";

const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code})};
export async function authorizePlatformAssistant(req,selection,{db=prisma,now=new Date()}={}){
  const user=req.user||{};
  if(!["OWNER","SUPER_ADMIN"].includes(user.role)||!(user.isSuperAdmin===true||user.platformRole==="SUPER_ADMIN")||user.supportContext)fail(403,"Απαιτείται κεντρική πρόσβαση Super Admin.","PLATFORM_ASSISTANT_ROLE_DENIED");
  if(!user.id||!user.sessionId)fail(401,"Απαιτείται ενεργή ασφαλής σύνδεση.","PLATFORM_ASSISTANT_SESSION_REQUIRED");
  const session=await db.userSession.findUnique({where:{id:user.sessionId},include:{user:{select:{id:true,role:true,sessionVersion:true,mustChangePassword:true}}}});
  const expires=Number(new Date(session?.expiresAt));
  if(!session||session.userId!==user.id||session.revokedAt||!Number.isFinite(expires)||expires<=now.getTime()||session.user?.id!==user.id||session.user.role!=="SUPER_ADMIN"||session.user.sessionVersion!==user.sessionVersion||session.user.mustChangePassword)fail(401,"Η πρόσβαση Super Admin δεν είναι πλέον ενεργή.","PLATFORM_ASSISTANT_SESSION_REVOKED");
  if(!selection)return null;
  const store=await db.store.findFirst({where:{id:selection.storeId,companyId:selection.companyId,active:true,company:{active:true}},select:{id:true,name:true,companyId:true,company:{select:{name:true}}}});
  if(!store)fail(404,"Δεν βρέθηκε ενεργό κατάστημα στη συγκεκριμένη εταιρεία.","PLATFORM_ASSISTANT_STORE_DENIED");
  return {companyId:store.companyId,companyName:store.company.name,storeId:store.id,storeName:store.name};
}

// The model gets no scope argument. Only an explicit UI pair, reauthorized at
// every boundary, can reach the shared, parameterized canonical calculation.
export async function createPlatformAssistantSession(req,selection,{authorize=authorizePlatformAssistant,readSalesReport=readSalesAnalysisReport,readStockReport=readStockAnalysisReport,readCash=readCanonicalPlatformCash,readSalesCatalog,authorizeSalesStores=authorizePlatformSalesStores,allStores=false,signal}={}){
  const scope=await authorize(req,selection);
  let salesAccess=null;
  const verify=async()=>{
    signal?.throwIfAborted();
    const current=await authorize(req,selection);
    if((scope===null)!==(current===null)||scope&&(current.companyId!==scope.companyId||current.storeId!==scope.storeId))fail(403,"Η επιλογή εταιρείας ή καταστήματος άλλαξε. Η απάντηση απορρίφθηκε.","PLATFORM_ASSISTANT_CONTEXT_CHANGED");
    if(salesAccess){const fresh=await authorizeSalesStores(req,selection,allStores,{authorize});if(salesAccessKey(fresh)!==salesAccessKey(salesAccess))fail(403,"Το εύρος καταστημάτων άλλαξε. Ζήτησε νέα αναφορά.","PLATFORM_ASSISTANT_CONTEXT_CHANGED")}
    return current;
  };
  const evidence=report=>({...report,scope:"PLATFORM_SELECTED_STORE"});
  const tools=[cashTool,...(scope?assistantProductTools:[]),...(scope||allStores?[salesStoresTool]:[])];
  return {scope,tools,async run({prompt,requestProvider}){
    const out=await runProductAssistant({prompt,cashTool,tools,requestProvider:async settings=>{await verify();return requestProvider(settings)},
      readSalesStores:async args=>{salesAccess=await authorizeSalesStores(req,selection,allStores,{authorize});return readAssistantSalesStores(args,salesAccess,{readReport:readSalesReport,...(readSalesCatalog?{readCatalog:readSalesCatalog}:{}),verify,signal})},
      readCash:async date=>{await verify();const report=await readCash(req,date,{signal});await verify();return report},
      readSales:async value=>{
        const args=salesToolArguments.parse(value),calendar=salesReportCalendar(args.from,args.to);await verify();
        const report=await readSalesReport({companyId:scope.companyId,storeId:scope.storeId,from:calendar.from,to:calendar.to,q:args.product,calendar});await verify();
        return evidence(productSalesEvidence(report,args,scope));
      },
      readStock:async value=>{
        const args=stockToolArguments.parse(value);await verify();
        const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),calendar=salesReportCalendar(today,today);
        const report=await readStockReport({companyId:scope.companyId,storeId:scope.storeId,from:calendar.from,to:calendar.to,q:args.product});await verify();
        return evidence(productStockEvidence(report,args,scope));
      }});
    await verify();return {...out,scope};
  }};
}
