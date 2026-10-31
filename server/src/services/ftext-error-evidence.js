import {createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const fail=()=>{throw Object.assign(new Error('Το αρχικό σφάλμα δεν συνδέθηκε με την ίδια εντολή. Η εκκρεμότητα διατηρήθηκε.'),{status:409,code:'FTEXT_ERROR_EVIDENCE_REVIEW'})};
const description='The physical receipt could not be verified. Do not resend.';
export function ftextUnknownCardError(row){
 const r=row?.result,d=row?.checkoutJson?.ftextCardDecision;
 return Boolean(row?.status==='REQUIRES_CHECK'&&!row.saleId&&row.plan?.payment?.method==='CARD'&&row.checkoutJson?.paymentMethod==='CARD'&&row.checkoutJson?.ftextCardMode==='OPERATOR_CONFIRMATION'&&d?.outcome==='NO'&&d.actorId===row.checkoutJson.actorId&&d.resultHash===row.resultHash&&d.settingsHash===row.settingsHash&&hex.safeParse(row.resultHash).success&&r?.outcome==='REQUIRES_CHECK'&&r.requestId===row.id&&r.settingsHash===row.settingsHash&&r.description===description&&Object.keys(r).sort().join(',')==='description,outcome,requestId,settingsHash');
}
function binding(row,device,settings){
 if(!ftextUnknownCardError(row)||row.claimedByDeviceId!==device.id||row.claimedTokenVersion!==device.tokenVersion||row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration||row.serialNumber!==settings.serialNumber||settings.cardEnabled!==true||settings.cardPayment?.resultFormat!=='OPERATOR_CONFIRMATION'||row.plan.payment.code!==settings.cardPayment.code)fail();
}
const cp1253=new Map(Array.from({length:256},(_,b)=>[new TextDecoder('windows-1253').decode(Uint8Array.of(b)),b]).filter(([c])=>c!=='\uFFFD'));
export function ftextOriginalCommandHash(row,settings){
 const lines=['RESULT_FILENAME|'+path.win32.join(settings.workFolder,'mws-cash-'+row.id+'.res'),...row.plan.lines.map(l=>'S|'+l.description+'|'+l.quantity+'|'+l.unitPrice+'||'+l.department),'PAY||'+row.plan.payment.code];
 return digest(Buffer.from(Array.from(lines.join('\r\n')+'\r\n',c=>{if(!cp1253.has(c))fail();return cp1253.get(c)})));
}
export function parseFtextErrorEvidence(rawResultBase64,paymentCode){
 if(typeof rawResultBase64!=='string'||rawResultBase64.length>87384)fail();
 const raw=Buffer.from(rawResultBase64,'base64');
 if(!raw.length||raw.length>65536||raw.toString('base64')!==rawResultBase64||raw.includes(0))fail();
 const text=raw.toString('latin1'),lines=text.split(/\r?\n/),match=lines[0].match(/^[ \t]*(\d{1,3})[ \t]*$/);
 if(!/[\r\n]$/.test(text)||!match||![44,48].includes(Number(match[1]))||lines.length<4||!lines[1].trim()||lines[1].length>300||/[\x00-\x1f\x7f]/.test(lines[1])||!lines.slice(3).every(s=>/^[ \t]*$/.test(s)))fail();
 const failedCommand=lines[2].startsWith('InputLine: ')?lines[2].slice(11):lines[2];
 if(failedCommand!=='PAY||'+paymentCode)fail();
 return {code:Number(match[1]),failedCommand,rawResultHash:digest(raw)};
}
function core(row,value){return {requestId:row.id,originalResultHash:row.resultHash,settingsHash:row.settingsHash,planHash:row.plan.planHash,deviceId:row.claimedByDeviceId,tokenVersion:row.claimedTokenVersion,commandHash:value.commandHash,rawResultBase64:value.rawResultBase64,...parseFtextErrorEvidence(value.rawResultBase64,row.plan.payment.code)}}
export function ftextPaymentError(row){
 const r=row?.result;
 if(r?.outcome==='REQUIRES_CHECK'&&[44,48].includes(r.code)&&r.failedCommand==='PAY||'+row.plan?.payment?.code&&hex.safeParse(r.rawResultHash).success)return r;
 const saved=row?.checkoutJson?.ftextLateError;
 if(!saved||!ftextUnknownCardError(row))return null;
 try{
  const expected=core(row,saved);
  if(!hex.safeParse(saved.commandHash).success||!hex.safeParse(expected.planHash).success||Object.entries(expected).some(([k,v])=>saved[k]!==v)||saved.evidenceHash!==digest(JSON.stringify(expected)))return null;
  return {...expected,evidenceHash:saved.evidenceHash};
 }catch{return null}
}
export async function pollFtextErrorEvidence(tx,device,settings){
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} AND "status"='REQUIRES_CHECK' AND "checkoutJson"->'ftextCardDecision'->>'outcome'='NO' AND COALESCE("checkoutJson"->'ftextOperatorRelease'->>'registerReady','')<>'true' AND NOT ("checkoutJson" ? 'ftextVoid') AND NOT ("checkoutJson" ? 'ftextLateError') ORDER BY "createdAt" LIMIT 1`)[0];
 if(!row)return null;
 try{binding(row,device,settings)}catch{return null}
 return {id:row.id,kind:'FTEXT_ERROR_RECHECK',originalResultHash:row.resultHash,settingsHash:row.settingsHash,scope:row.plan.scope,serialNumber:row.serialNumber,plan:row.plan};
}
const inputSchema=z.object({requestId:z.string().uuid(),settingsHash:hex,originalResultHash:hex,commandHash:hex,rawResultBase64:z.string().min(1).max(87384)}).strict();
export async function recordFtextErrorEvidence(tx,device,settings,input){
 const value=inputSchema.parse(input);
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${value.requestId} AND "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} FOR UPDATE`)[0];
 binding(row,device,settings);
 if(value.settingsHash!==row.settingsHash||value.originalResultHash!==row.resultHash||value.commandHash!==ftextOriginalCommandHash(row,settings))fail();
 const evidence=core(row,value),evidenceHash=digest(JSON.stringify(evidence));
 const old=row.checkoutJson.ftextLateError;
 if(old){if(!ftextPaymentError(row)||old.evidenceHash!==evidenceHash)fail();return row}
 if(row.checkoutJson.ftextVoid||!hex.safeParse(evidence.planHash).success)fail();
 const checkout={...row.checkoutJson,ftextLateError:{...evidence,evidenceHash,receivedAt:new Date().toISOString()}};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify(checkout)}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
