import {prisma} from "../prisma.js";
import {companyModuleState,effectiveModuleEnabled} from "../middleware/module-access.js";

const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code})};
const keys=["AI_OWNER_ASSISTANT","CASH_CONTROL"];

// A fresh session/role/company/store/entitlement check runs before every model
// request, around each canonical read and before an answer leaves the server.
export async function authorizeOwnerAssistant(req,{db=prisma,getState=companyModuleState,now=new Date()}={}){
  const user=req.user||{},storeId=req.params?.storeId;
  if(user.tokenType!=="BACKOFFICE_USER"||user.role!=="OWNER")fail(403,"Ο βοηθός είναι διαθέσιμος μόνο στον Ιδιοκτήτη.","OWNER_ASSISTANT_ROLE_DENIED");
  if(typeof storeId!=="string"||!storeId.trim()||storeId.length>160||!user.companyId)fail(400,"Επίλεξε έγκυρο κατάστημα.","OWNER_ASSISTANT_STORE_REQUIRED");
  if(!user.sessionId)fail(401,"Απαιτείται ενεργή σύνδεση.","OWNER_ASSISTANT_SESSION_REQUIRED");
  const session=await db.userSession.findUnique({where:{id:user.sessionId},include:{user:{select:{id:true,role:true,companyId:true,sessionVersion:true,mustChangePassword:true}}}});
  const actor=session?.user;
  if(!session||session.userId!==user.id||session.revokedAt||new Date(session.expiresAt)<=now||!actor||actor.sessionVersion!==user.sessionVersion||actor.mustChangePassword)fail(401,"Η συνεδρία δεν είναι πλέον ενεργή.","OWNER_ASSISTANT_SESSION_REVOKED");
  const support=actor.role==="SUPER_ADMIN"&&user.isSuperAdmin===true&&user.platformRole==="SUPER_ADMIN";
  if(support){
    if(user.supportContext?.companyId!==user.companyId||user.supportContext?.storeId!==storeId)fail(403,"Επίλεξε το κατάστημα μέσα από την κανονική υποστήριξη.","OWNER_ASSISTANT_SUPPORT_SCOPE_REJECTED");
  }else{
    if(actor.role!=="OWNER"||user.isSuperAdmin||user.platformRole==="SUPER_ADMIN")fail(403,"Η πρόσβαση Ιδιοκτήτη δεν είναι πλέον ενεργή.","OWNER_ASSISTANT_ROLE_REVOKED");
    if(actor.companyId!==user.companyId){
      if(user.ownerCompanyId!==user.companyId)fail(403,"Η επιλεγμένη εταιρεία δεν είναι διαθέσιμη.","OWNER_ASSISTANT_COMPANY_DENIED");
      const access=await db.$queryRaw`SELECT 1 FROM "OwnerCompanyAccess" a JOIN "Company" c ON c."id"=a."companyId" WHERE a."ownerId"=${actor.id} AND a."companyId"=${user.companyId} AND c."active"=TRUE LIMIT 1`;
      if(!access.length)fail(403,"Η πρόσβαση στην εταιρεία έχει αφαιρεθεί.","OWNER_ASSISTANT_COMPANY_DENIED");
    }
  }
  const store=await db.store.findFirst({where:{id:storeId,companyId:user.companyId,active:true},select:{id:true,name:true,companyId:true}});
  if(!store)fail(404,"Δεν βρέθηκε ενεργό δικό σου κατάστημα.","OWNER_ASSISTANT_STORE_DENIED");
  const state=await getState(user.companyId);
  if(!state||(!support&&!state.licenseAllowed))fail(403,"Η άδεια της εταιρείας δεν είναι ενεργή.","LICENSE_INACTIVE");
  if(!support)for(const moduleKey of keys){
    const rows=await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${store.id} AND "companyId"=${user.companyId} AND "moduleKey"=${moduleKey} LIMIT 1`;
    const override=rows[0]?{...rows[0],configured:true}:{configured:false};
    if(!effectiveModuleEnabled(state.activeModules.includes(moduleKey),override))fail(403,moduleKey==="AI_OWNER_ASSISTANT"?"Το module AI Βοηθός Ιδιοκτήτη δεν είναι ενεργό για το κατάστημα.":"Ο Έλεγχος Ταμείων δεν είναι ενεργός για το κατάστημα.","MODULE_DISABLED");
  }
  return {companyId:user.companyId,companyName:state.name,storeId:store.id,storeName:store.name,supportPreview:support};
}
