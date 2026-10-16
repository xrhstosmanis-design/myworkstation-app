import {createHash} from "node:crypto";
import {dailyCashReportReadiness,reportBusinessPeriod,summarizeCashVariances} from "./automatic-report-policy.js";

const error=(status,message)=>Object.assign(new Error(message),{status});
const sourceLimit=1000;

// Internal read-only preview. No mail, DDL, financial posting or delivery claim.
// The caller must authenticate the request; actorId is rechecked against the
// current database, never accepted as a role assertion from the browser.
export async function readAutomaticDailyCashPreview(db,{actorId,companyId,storeId,day,configuration,now=new Date()}){
  if(![actorId,companyId,storeId].every(v=>typeof v==="string"&&v.trim()))throw error(400,"Απαιτείται χρήστης, εταιρεία και επιλεγμένο κατάστημα.");
  if(!configuration||!Array.isArray(configuration.terminals))throw error(400,"Απαιτείται ρητή ρύθμιση τερματικών και βαρδιών.");
  const settings={...configuration,companyId,storeId,day};
  // Validate all settings even when the source is empty or unavailable.
  dailyCashReportReadiness([],settings,now);
  const period=reportBusinessPeriod(day,day,settings);
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{id:true,role:true}});
    if(actor?.role!=="SUPER_ADMIN")throw error(403,"Η προεπισκόπηση αυτόματων αναφορών απαιτεί Super Admin.");
    const store=await tx.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,companyId:true,name:true}});
    if(!store)throw error(404,"Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.");
    const rules=await tx.$queryRaw`
      SELECT "mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled","updatedAt"
      FROM "CashControlStoreRule" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
    // Include unfinished shifts carried in from before the business day. Their
    // ambiguity holds reporting instead of silently hiding a still-open till.
    const rows=await tx.$queryRaw`
      SELECT "id","companyId","storeId","terminalPos","status","openedBy","openedByName",
        "openedAt","closedAt","variance","updatedAt"
      FROM "CashShiftSession"
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "openedAt"<${period.to}
        AND ("openedAt">=${period.from} OR "closedAt">${period.from} OR "closedAt" IS NULL OR "status"<>'CLOSED')
      ORDER BY "openedAt","id" LIMIT ${sourceLimit+1}`;
    const readiness=dailyCashReportReadiness(rows,settings,now),holds=[...readiness.holds];
    const rule=rules[0]||null;
    if(rows.length>sourceLimit)holds.push({code:"SOURCE_LIMIT_EXCEEDED",limit:sourceLimit});
    if(!rule)holds.push({code:"CASH_RULE_NOT_CONFIGURED"});
    else if(!["FULL","DIFFERENCE_ONLY"].includes(rule.mode))holds.push({code:"CASH_MODE_UNSUPPORTED",mode:rule.mode});
    if(rule&&(typeof rule.deliveryTerminalPattern!=="string"||!rule.deliveryTerminalPattern.trim()))holds.push({code:"DELIVERY_PATTERN_NOT_CONFIGURED"});
    const ready=holds.length===0;
    // Unknown or partial data is never a zero shortage. Only a complete ready
    // snapshot has totals; original employee amounts always remain unadjusted.
    const groups=ready?summarizeCashVariances(rows.map(row=>({...row,cashChain:row.terminalPos.toUpperCase().includes(rule.deliveryTerminalPattern.toUpperCase())?"DELIVERY":"STORE"})),settings):null;
    const sourceFingerprint=createHash("sha256").update(JSON.stringify({companyId,storeId,day,configuration,rule,rows})).digest("hex");
    return {kind:"DAILY_CASH_PREVIEW",store,period,ready,holds,sourceCount:rows.length,
      complete:rows.length<=sourceLimit,groups,sourceFingerprint,generatedAt:new Date(now),
      rule:rule?{mode:rule.mode,deliveryTerminalPattern:rule.deliveryTerminalPattern,carryOverEnabled:rule.carryOverEnabled,posEftposEnabled:rule.posEftposEnabled}:null,
      employeeLiabilityAdjusted:false,deliveryStatus:"PREVIEW_ONLY"};
  },{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000});
}
