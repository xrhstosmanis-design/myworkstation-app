import {prisma} from "../prisma.js";
import {authorizeOwnerAssistant} from "./owner-assistant-access.js";
import {authorizePlatformAssistant} from "./platform-assistant-products.js";
import {companyModuleState,effectiveModuleEnabled} from "../middleware/module-access.js";

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export const salesAccessKey=access=>JSON.stringify([access.scope,access.truncated,access.stores.map(s=>[s.companyId,s.storeId,s.companyName,s.storeName]),access.excluded.map(s=>[s.companyId,s.storeId,s.reason])]);
export async function authorizePlatformSalesStores(req,selection,allStores,{db=prisma,authorize=authorizePlatformAssistant}={}){
  const selected=await authorize(req,selection,{db});
  if(!allStores)return {scope:"PLATFORM_SELECTED_STORE",stores:selected?[selected]:[],excluded:[],truncated:false};
  const stores=await db.store.findMany({where:{active:true,company:{active:true}},select:{id:true,name:true,companyId:true,company:{select:{name:true}}},orderBy:[{companyId:"asc"},{id:"asc"}],take:101});
  return {scope:"PLATFORM_AUTHORIZED_STORES",stores:stores.map(s=>({companyId:s.companyId,companyName:s.company.name,storeId:s.id,storeName:s.name})),excluded:[],truncated:stores.length>100};
}
export async function authorizeOwnerSalesStores(req,allStores,{db=prisma,authorize=authorizeOwnerAssistant,getState=companyModuleState,now=new Date()}={}){
  const anchor=await authorize(req,{db,getState,now,requiredModules:["INVENTORY"]});
  if(!allStores)return {scope:"OWNER_SELECTED_STORE",stores:[anchor],excluded:[],truncated:false};
  if(anchor.supportPreview)fail(403,"Για συγκεντρωτικές αναφορές χρησιμοποίησε τον κεντρικό βοηθό Super Admin.");
  // Resolve membership from the real current database actor, never a cloned
  // request, model-supplied company or a fabricated Owner session.
  const session=await db.userSession.findUnique({where:{id:req.user.sessionId},include:{user:{select:{id:true,role:true,companyId:true,sessionVersion:true,mustChangePassword:true}}}});
  const actor=session?.user,expires=Number(new Date(session?.expiresAt));
  if(!actor||actor.id!==req.user.id||session.userId!==actor.id||session.revokedAt||!Number.isFinite(expires)||expires<=now.getTime()||actor.role!=="OWNER"||actor.sessionVersion!==req.user.sessionVersion||actor.mustChangePassword)fail(401,"Η πρόσβαση Ιδιοκτήτη δεν είναι πλέον ενεργή.");
  const all=await db.$queryRaw`SELECT s."id" AS "storeId",s."name" AS "storeName",c."id" AS "companyId",c."name" AS "companyName"
    FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" AND c."active"=TRUE
    WHERE s."active"=TRUE AND (c."id"=${actor.companyId} OR EXISTS(SELECT 1 FROM "OwnerCompanyAccess" a WHERE a."ownerId"=${actor.id} AND a."companyId"=c."id"))
    ORDER BY c."id",s."id" LIMIT 101`;
  if(all.length>100)return {scope:"OWNER_OWN_STORES",stores:[],excluded:[],truncated:true};
  const stores=[],excluded=[];
  for(const companyId of new Set(all.map(s=>s.companyId))){
    const state=await getState(companyId),members=all.filter(s=>s.companyId===companyId);
    if(!state?.licenseAllowed){excluded.push(...members.map(s=>({...s,reason:"Η άδεια της εταιρείας δεν είναι ενεργή."})));continue}
    const overrides=await db.$queryRaw`SELECT "storeId","moduleKey","active","startsAt","endsAt" FROM "StorePaidModule"
      WHERE "companyId"=${companyId} AND "storeId"=ANY(${members.map(s=>s.storeId)}::text[]) AND "moduleKey"=ANY(${["AI_OWNER_ASSISTANT","INVENTORY"]}::text[])`;
    for(const s of members){
      const eligible=["AI_OWNER_ASSISTANT","INVENTORY"].every(key=>{const row=overrides.find(r=>r.storeId===s.storeId&&r.moduleKey===key);return effectiveModuleEnabled(state.activeModules.includes(key),row?{...row,configured:true}:{configured:false})});
      (eligible?stores:excluded).push(eligible?s:{...s,reason:"Δεν είναι ενεργά τα απαιτούμενα modules βοηθού / αναφορών."});
    }
  }
  return {scope:"OWNER_OWN_STORES",stores,excluded,truncated:false};
}
