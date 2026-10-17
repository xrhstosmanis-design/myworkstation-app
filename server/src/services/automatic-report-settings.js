import {z} from "zod";
import {cashRuleFields,readCashControlRule,sameCashRule} from "./cash-control-rules.js";
import {completedReportPeriod,dailyCashReportReadiness} from "./automatic-report-policy.js";
import {readAutomaticCashPreview} from "./automatic-report-source.js";

const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code})};
const cashRuleSchema=z.object({mode:z.enum(["FULL","DIFFERENCE_ONLY","POS_EFTPOS_ONLY"]),deliveryTerminalPattern:z.string().min(1).max(120),carryOverEnabled:z.boolean(),posEftposEnabled:z.boolean()}).strict();
export const automaticReportConfigurationSchema=z.object({
  dayStartHour:z.number().int().min(5).max(12),secondShiftStartHour:z.number().int().min(6).max(22),thirdShiftStartHour:z.number().int().min(7).max(23),
  terminals:z.array(z.object({terminalPos:z.string().trim().min(1).max(120),requiredSlots:z.array(z.union([z.literal(1),z.literal(2),z.literal(3)])).min(1).max(3)}).strict()).min(1).max(100),
  cashRule:cashRuleSchema
}).strict().superRefine((config,ctx)=>{
  if(!config.terminals.some(t=>t.requiredSlots.includes(3)))ctx.addIssue({code:"custom",path:["terminals"],message:"Απαιτείται τουλάχιστον ένα ταμείο με τρίτη βάρδια."});
  try{dailyCashReportReadiness([],{...config,companyId:"validation",storeId:"validation",day:"2026-01-01"},new Date("2026-01-02T12:00:00Z"))}catch(error){ctx.addIssue({code:"custom",message:error.message})}
});
export const automaticReportSettingsUpdateSchema=z.object({expectedVersion:z.number().int().min(0).max(2147483646),configuration:automaticReportConfigurationSchema}).strict();

export async function ensureAutomaticReportSettingsSchema(db){
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AutomaticReportSettings" ("storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"configurationJson" JSONB NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

export async function automaticReportScope(db,{actorId,companyId,storeId}){
  if(![actorId,companyId,storeId].every(v=>typeof v==="string"&&v.trim()))fail(400,"Απαιτείται συγκεκριμένος χρήστης, εταιρεία και κατάστημα.");
  const actor=await db.user.findUnique({where:{id:actorId},select:{id:true,role:true}});
  if(actor?.role!=="SUPER_ADMIN")fail(403,"Απαιτείται Super Admin.");
  const store=await db.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,companyId:true,name:true}});
  if(!store)fail(404,"Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.");
  return store;
}
async function savedSettings(db,companyId,storeId){
  const rows=await db.$queryRaw`SELECT "configurationJson","version","updatedAt" FROM "AutomaticReportSettings" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
  const row=rows[0];return row?{configuration:automaticReportConfigurationSchema.parse(row.configurationJson),version:row.version,updatedAt:row.updatedAt}:null;
}
export async function getAutomaticReportSettings(db,scope){
  return db.$transaction(async tx=>{
    const store=await automaticReportScope(tx,scope),rule=await readCashControlRule(tx,store),settings=await savedSettings(tx,scope.companyId,store.id);
    const terminals=await tx.$queryRaw`SELECT DISTINCT "terminalPos" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${store.id} ORDER BY "terminalPos" LIMIT 101`;
    return {store,settings,cashRule:cashRuleFields(rule),ruleSource:rule.source,observedTerminals:terminals.slice(0,100).map(t=>t.terminalPos),suggestedDay:completedReportPeriod(new Date(),"DAILY",settings?.configuration).toDay,dispatchEnabled:false};
  },{isolationLevel:"RepeatableRead"});
}
export async function saveAutomaticReportSettings(db,scope,input){
  const body=automaticReportSettingsUpdateSchema.parse(input);
  return db.$transaction(async tx=>{
    const store=await automaticReportScope(tx,scope),rule=await readCashControlRule(tx,store);
    if(!sameCashRule(body.configuration.cashRule,rule))fail(409,"Ο κανόνας ελέγχου ταμείου άλλαξε. Ανανέωσε τις ρυθμίσεις πριν αποθηκεύσεις.","CASH_RULE_CHANGED");
    const json=JSON.stringify(body.configuration);
    const changed=body.expectedVersion===0?await tx.$queryRaw`
      INSERT INTO "AutomaticReportSettings" ("companyId","storeId","configurationJson","updatedBy")
      VALUES (${scope.companyId},${store.id},${json}::jsonb,${scope.actorId}) ON CONFLICT ("storeId") DO NOTHING RETURNING "version"`
      :await tx.$queryRaw`UPDATE "AutomaticReportSettings" SET "configurationJson"=${json}::jsonb,"version"="version"+1,"updatedBy"=${scope.actorId},"updatedAt"=NOW()
        WHERE "companyId"=${scope.companyId} AND "storeId"=${store.id} AND "version"=${body.expectedVersion} RETURNING "version"`;
    if(!changed.length)fail(409,"Οι ρυθμίσεις άλλαξαν σε άλλο παράθυρο. Πάτησε Ανανέωση και έλεγξέ τες ξανά.","REPORT_SETTINGS_CHANGED");
    return {store,settings:await savedSettings(tx,scope.companyId,store.id),dispatchEnabled:false};
  });
}
export async function previewSavedAutomaticCashReport(db,scope,{day,expectedVersion,frequency="DAILY"},now=new Date()){
  await automaticReportScope(db,scope);
  const settings=await savedSettings(db,scope.companyId,scope.storeId);
  if(!settings)fail(409,"Αποθήκευσε πρώτα τις βάρδιες και τα ταμεία του καταστήματος.","REPORT_SETTINGS_REQUIRED");
  if(settings.version!==expectedVersion)fail(409,"Οι ρυθμίσεις άλλαξαν. Πάτησε Ανανέωση πριν την προεπισκόπηση.","REPORT_SETTINGS_CHANGED");
  return readAutomaticCashPreview(db,{...scope,day,frequency,configuration:settings.configuration,settingsVersion:settings.version,now});
}
