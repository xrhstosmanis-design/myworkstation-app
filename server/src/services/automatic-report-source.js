import {createHash} from "node:crypto";
import {dailyCashReportReadiness,reportBusinessPeriod,reportDayOffset,cashPreviewPeriod,summarizeCashVariances,summarizeOpeningOperators} from "./automatic-report-policy.js";
import {legacyCashControlRule,sameCashRule} from "./cash-control-rules.js";
import {readReviewedAutomaticCash} from "./cash-reviewed-automatic-source.js";

const error=(status,message)=>Object.assign(new Error(message),{status});
const sourceLimit=1000;

// Internal read-only preview. No mail, DDL, financial posting or delivery claim.
// The caller must authenticate the request; actorId is rechecked against the
// current database, never accepted as a role assertion from the browser.
export function readAutomaticDailyCashPreview(db,input){
  return readAutomaticCashPreview(db,{...input,frequency:"DAILY"});
}
function previewContext({actorId,companyId,storeId,day,frequency="DAILY",configuration,now=new Date()}){
  if(![actorId,companyId,storeId].every(v=>typeof v==="string"&&v.trim()))throw error(400,"Απαιτείται χρήστης, εταιρεία και επιλεγμένο κατάστημα.");
  if(!configuration||!Array.isArray(configuration.terminals))throw error(400,"Απαιτείται ρητή ρύθμιση τερματικών και βαρδιών.");
  const settings={...configuration,companyId,storeId,day};
  // Validate all settings even when the source is empty or unavailable.
  dailyCashReportReadiness([],settings,now);
  const period=cashPreviewPeriod(day,frequency,settings);
  return {settings,period};
}
export async function readAutomaticCashPreview(db,input){
  // Preserve validation before opening a transaction and capture one clock value.
  const args={...input,now:input?.now===undefined?new Date():input.now};
  previewContext(args);
  return db.$transaction(tx=>readAutomaticCashPreviewInTransaction(tx,args),{isolationLevel:"RepeatableRead",maxWait:5000,timeout:15000});
}
// Internal caller owns the transaction, isolation and read-only mode. This is
// still a Super Admin preview reader, never a service-principal authorization.
export async function readAutomaticCashPreviewInTransaction(tx,{actorId,companyId,storeId,day,frequency="DAILY",configuration,settingsVersion,now=new Date()}){
  const {settings,period}=previewContext({actorId,companyId,storeId,day,frequency,configuration,now});
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
    const dayReadiness=[];
    const periodDays=Math.round((Date.parse(period.toDay+"T12:00:00Z")-Date.parse(period.fromDay+"T12:00:00Z"))/86400000)+1;
    for(let offset=0;offset<periodDays;offset++){
      const businessDay=reportDayOffset(period.fromDay,offset),bounds=reportBusinessPeriod(businessDay,businessDay,settings);
      // Preserve the daily reader's carry-in ambiguity guard on every day.
      const dailyRows=frequency==="DAILY"?rows:rows.filter(row=>{
        const opened=new Date(row.openedAt),closed=row.closedAt?new Date(row.closedAt):null;
        return !Number.isFinite(opened.getTime())||(opened<bounds.to&&(opened>=bounds.from||!closed||closed>bounds.from||row.status!=="CLOSED"));
      });
      dayReadiness.push({day:businessDay,...dailyCashReportReadiness(dailyRows,{...settings,day:businessDay},now)});
    }
    const holds=dayReadiness.flatMap(result=>result.holds.map(hold=>frequency!=="DAILY"?{...hold,day:result.day}:hold));
    if(frequency!=="DAILY"){
      const ids=new Set();
      for(const row of rows){
        if(!row.id||ids.has(row.id)||row.companyId!==companyId||row.storeId!==storeId||new Date(row.openedAt)>=period.to)holds.push({code:"SOURCE_SCOPE_OR_ID_INVALID"});
        ids.add(row.id);
      }
    }
    // Legacy fallback is usable only after explicit confirmation in saved
    // reporting settings. An unconfigured internal caller still holds.
    const rule=rules[0]||(configuration.cashRule?legacyCashControlRule(store):null);
    if(configuration.cashRule&&!sameCashRule(configuration.cashRule,rule))holds.push({code:"CASH_RULE_CHANGED"});
    if(settingsVersion!==undefined){
      const saved=await tx.$queryRaw`SELECT "version" FROM "AutomaticReportSettings" WHERE "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`;
      if(saved[0]?.version!==settingsVersion)holds.push({code:"REPORT_SETTINGS_CHANGED"});
    }
    if(rows.length>sourceLimit)holds.push({code:"SOURCE_LIMIT_EXCEEDED",limit:sourceLimit});
    if(!rule)holds.push({code:"CASH_RULE_NOT_CONFIGURED"});
    else if(!["FULL","DIFFERENCE_ONLY"].includes(rule.mode))holds.push({code:"CASH_MODE_UNSUPPORTED",mode:rule.mode});
    if(rule&&(typeof rule.deliveryTerminalPattern!=="string"||!rule.deliveryTerminalPattern.trim()))holds.push({code:"DELIVERY_PATTERN_NOT_CONFIGURED"});
    const ready=holds.length===0;
    // Unknown or partial data is never a zero shortage. Only a complete ready
    // snapshot has totals; original employee amounts always remain unadjusted.
    const groups=ready?summarizeCashVariances(rows.map(row=>({...row,cashChain:row.terminalPos.toUpperCase().includes(rule.deliveryTerminalPattern.toUpperCase())?"DELIVERY":"STORE"})),settings):null;
    const sourceFingerprint=createHash("sha256").update(JSON.stringify({companyId,storeId,day,frequency,period,configuration,rule,rows})).digest("hex");
    const reviewedCash=configuration.reviewedReconciliation===true?await readReviewedAutomaticCash(tx,{actorId,companyId,storeId,period,rows,groups,rule,sourceFingerprint,ready}):null;
    return {kind:`${frequency}_CASH_PREVIEW`,frequency,store,period,ready,holds,dayReadiness,sourceCount:rows.length,
      ...(configuration.reviewedReconciliation===true?{reviewedReconciliation:true,reviewedCash}:{}),
      complete:rows.length<=sourceLimit,groups,...(frequency==="MONTHLY"?{openingOperatorSummary:ready?summarizeOpeningOperators(groups):null}:{}),sourceFingerprint,generatedAt:new Date(now),
      rule:rule?{mode:rule.mode,deliveryTerminalPattern:rule.deliveryTerminalPattern,carryOverEnabled:rule.carryOverEnabled,posEftposEnabled:rule.posEftposEnabled}:null,
      settingsVersion:settingsVersion??null,employeeLiabilityAdjusted:false,deliveryStatus:"PREVIEW_ONLY",
      // Closure readiness certifies only this shift snapshot, not settlement,
      // reviewer explanations or physical cash and control balances.
      sourceReadiness:ready?"READY":"HOLD",financialFinality:"PROVISIONAL",financialReconciliationComplete:false,
      financialLimitations:["DOCUMENT_PAYMENT_RECONCILIATION_NOT_VERIFIED","CASH_REVIEW_EXPLANATIONS_NOT_VERIFIED","PHYSICAL_CASH_AND_CONTROL_BALANCES_NOT_VERIFIED"]};
}
