import {N40_FIXTURE} from "../../../shared/n40-backoffice-fixture.mjs";

export const N40_SUPPORT_HISTORY = Object.freeze({
  start:"2026-10-10T12:00:00.000Z",end:"2026-10-10T12:30:00.000Z",
  deviceLabel:"MYWORKSTATION LAB · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ",limit:200
});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const events=["SUPER_ADMIN_SUPPORT_ACCESS","SUPER_ADMIN_SUPPORT_EXIT"];
// Read-only, actor-bound historical observation. Names were stored by the old
// audit writer; these records cannot prove a destination, token or store ID.
export function createN40SupportHistoryHandler({prisma}){
  return async(req,res,next)=>{try{
    if(req.user?.tokenType!=="BACKOFFICE_USER"||req.user?.isSuperAdmin!==true||!req.user?.id||req.user?.supportContext)throw fail(403,"Απαιτείται κανονική ενεργή σύνδεση Platform Super Admin.");
    if(Object.keys(req.query||{}).length||Object.keys(req.body||{}).length)throw fail(400,"Η ιστορική ανάγνωση έχει σταθερό πεδίο και χρονικό παράθυρο.");
    const store=await prisma.store.findUnique({where:{id:N40_FIXTURE.storeId},select:{name:true,active:true,companyId:true,company:{select:{name:true,active:true}}}});
    if(!store?.active||store.companyId!==N40_FIXTURE.companyId||!store.company?.active||store.name!=="ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"||store.company.name!=="MYWORKSTATION LAB")throw fail(409,"Το ακριβές ενεργό LAB δεν επιβεβαιώθηκε.");
    const rows=await prisma.authAudit.findMany({
      where:{userId:req.user.id,event:{in:events},success:true,deviceName:N40_SUPPORT_HISTORY.deviceLabel,createdAt:{gte:new Date(N40_SUPPORT_HISTORY.start),lt:new Date(N40_SUPPORT_HISTORY.end)}},
      select:{event:true,createdAt:true,success:true},orderBy:{createdAt:"asc"},take:N40_SUPPORT_HISTORY.limit+1
    });
    const records=rows.slice(0,N40_SUPPORT_HISTORY.limit).map(row=>({event:row.event,time:new Date(row.createdAt).toISOString(),success:row.success===true}));
    res.set("Cache-Control","no-store");
    res.json({window:{start:N40_SUPPORT_HISTORY.start,end:N40_SUPPORT_HISTORY.end},label:N40_SUPPORT_HISTORY.deviceLabel,records,truncated:rows.length>N40_SUPPORT_HISTORY.limit,attribution:"Historical label and own actor only; no destination, store ID or session correlation was stored. No automatic PASS."});
  }catch(error){next(error)}};
}
