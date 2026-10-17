import {randomUUID} from 'node:crypto';
import {z} from 'zod';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
function requirePlatform(actor){if(!actor?.id||!(actor.isSuperAdmin===true||actor.platformRole==='SUPER_ADMIN'))fail('Απαιτείται πρόσβαση Platform Super Admin.',403)}
export const companyIdentitySchema=z.object({name:z.string().trim().min(2).max(160),taxId:z.string().trim().regex(/^(?!0{9}$)[0-9]{9}$/,'Συμπλήρωσε ΑΦΜ με 9 ψηφία.'),expectedName:z.string().max(160),expectedTaxId:z.string().max(30)}).strict();
async function audit(tx,actor,event,details){
 await tx.$executeRaw`INSERT INTO "AuthAudit" ("id","userId","email","event","success","deviceName") VALUES (${randomUUID()},${actor.id},${actor.email||'super-admin'},${event+':'+JSON.stringify(details)},true,'Platform Admin')`;
}
export async function saveCompanyIdentity(db,actor,companyId,input){
 requirePlatform(actor);const body=companyIdentitySchema.parse(input);
 return db.$transaction(async tx=>{
  // Serialize this editor for the same AFM; existing company-creation APIs stay unchanged.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"company-identity:"+body.taxId}))`;
  const before=(await tx.$queryRaw`SELECT "id","name","taxId" FROM "Company" WHERE "id"=${companyId} FOR UPDATE`)[0];
  if(!before)fail('Δεν βρέθηκε η εταιρεία.',404);
  if(before.name!==body.expectedName||String(before.taxId||'')!==body.expectedTaxId)fail('Τα στοιχεία της εταιρείας άλλαξαν. Κλείσε και άνοιξε ξανά τη φόρμα.');
  if(before.taxId&&before.taxId!==body.taxId)fail('Υπάρχει ήδη ΑΦΜ. Η αλλαγή σε διαφορετικό ΑΦΜ χρειάζεται ξεχωριστό έλεγχο της εταιρείας.');
  const duplicate=await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"<>${companyId} AND REGEXP_REPLACE(COALESCE("taxId",''),'[^0-9]','','g')=${body.taxId} LIMIT 1`;
  if(duplicate[0])fail('Το ΑΦΜ ανήκει ήδη σε άλλη εταιρεία. Δεν έγινε καμία αλλαγή.');
  if(before.name===body.name&&before.taxId===body.taxId)return {company:before,unchanged:true};
  const after=(await tx.$queryRaw`UPDATE "Company" SET "name"=${body.name},"taxId"=${body.taxId},"updatedAt"=NOW() WHERE "id"=${companyId} RETURNING "id","name","taxId"`)[0];
  await audit(tx,actor,'COMPANY_IDENTITY_UPDATED',{companyId,before,after});
  return {company:after,unchanged:false};
 });
}
export async function archiveInstallationTerminal(db,actor,{companyId,storeId,terminalId}){
 requirePlatform(actor);
 return db.$transaction(async tx=>{
  const store=(await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} FOR SHARE`)[0];
  if(!store)fail('Δεν βρέθηκε το κατάστημα στη συγκεκριμένη εταιρεία.',404);
  const row=(await tx.$queryRaw`SELECT "id","terminalPos","displayName","active","deletedAt" FROM "StoreInstallationTerminal" WHERE "id"=${terminalId} AND "companyId"=${companyId} AND "storeId"=${storeId} FOR UPDATE`)[0];
  if(!row)fail('Δεν βρέθηκε το τερματικό στο συγκεκριμένο κατάστημα.',404);
  if(row.deletedAt)return {ok:true,terminalId,alreadyDeleted:true};
  if(row.active)fail('Απενεργοποίησε πρώτα το τερματικό πριν το διαγράψεις.');
  const tables=(await tx.$queryRaw`SELECT to_regclass('"CashShiftSession"')::text AS shifts`)[0];
  if(tables?.shifts){
   const shifts=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND COALESCE(NULLIF(UPPER(TRIM("terminalPos")),''),'MAIN') = UPPER(TRIM(${row.terminalPos})) AND "status"='OPEN' LIMIT 1`;
   if(shifts[0])fail('Το τερματικό έχει ανοιχτή βάρδια. Δεν διαγράφηκε.');
  }
  const mappings=await tx.$queryRaw`SELECT "id" FROM "StoreFiscalDevice" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND UPPER(TRIM("terminalPos"))=UPPER(TRIM(${row.terminalPos})) AND "active"=true LIMIT 1`;
  if(mappings[0])fail('Το τερματικό έχει ενεργή αντιστοίχιση ταμειακής. Αφαίρεσε πρώτα την αντιστοίχιση από τις ρυθμίσεις εγκατάστασης.');
  await tx.$executeRaw`UPDATE "StoreInstallationTerminal" SET "deletedAt"=NOW(),"active"=false,"tokenHash"=NULL,"tokenExpiresAt"=NULL,"updatedAt"=NOW() WHERE "id"=${terminalId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await audit(tx,actor,'STORE_TERMINAL_DELETED',{companyId,storeId,terminalId,terminalPos:row.terminalPos,displayName:row.displayName,historyPreserved:true});
  return {ok:true,terminalId,alreadyDeleted:false};
 });
}
export function registerPlatformMaintenanceRoutes(router,db,ensureInstallationTables){
 router.put('/companies/:companyId/identity',async(req,res,next)=>{try{res.json(await saveCompanyIdentity(db,req.user,req.params.companyId,req.body))}catch(error){next(error)}});
 router.delete('/companies/:companyId/stores/:storeId/installation-terminals/:terminalId',async(req,res,next)=>{try{requirePlatform(req.user);await ensureInstallationTables();res.json(await archiveInstallationTerminal(db,req.user,req.params))}catch(error){next(error)}});
}
