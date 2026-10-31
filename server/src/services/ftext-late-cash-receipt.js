import {createHash} from 'node:crypto';
import path from 'node:path';
import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
import {validateFtextCashResult} from './ftext-cash-requests.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=()=>{throw Object.assign(new Error('Δεν επαληθεύτηκε η καθυστερημένη απόδειξη της αρχικής εντολής. Δεν στάλθηκε νέα εντολή.'),{status:409,code:'FTEXT_LATE_CASH_REVIEW'})};
const unknown='The physical receipt could not be verified. Do not resend.';
const inputSchema=z.object({intentBase64:z.string().min(1).max(8192),reportBase64:z.string().min(1).max(8192),rawResultBase64:z.string().min(1).max(87384),reason:z.string().trim().min(5).max(500)}).strict();
const cp1253=new Map(Array.from({length:256},(_,b)=>[new TextDecoder('windows-1253').decode(Uint8Array.of(b)),b]).filter(([c])=>c!=='\uFFFD'));
function bytes(value,limit){const b=Buffer.from(value,'base64');if(!b.length||b.length>limit||b.toString('base64')!==value||b.includes(0))fail();return b;}
function cash(row){return row?.plan?.payment?.method==='CASH'&&row.checkoutJson?.paymentMethod==='CASH'&&!row.checkoutJson?.ftextVoid&&!row.checkoutJson?.ftextOperatorRelease&&!row.checkoutJson?.ftextCardDecision;}

export function verifyLateCashFiles(row,settings,input){
 const value=inputSchema.parse(input);
 if(!cash(row)||row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration||row.serialNumber!==settings.serialNumber||!row.resultHash||row.result?.description!==unknown||row.result?.outcome!=='REQUIRES_CHECK')fail();
 const intentBytes=bytes(value.intentBase64,4096),reportBytes=bytes(value.reportBase64,4096),raw=bytes(value.rawResultBase64,65536);
 let intent,report;try{intent=JSON.parse(intentBytes.toString('utf8'));report=JSON.parse(reportBytes.toString('utf8'));}catch{fail();}
 if(Object.keys(intent).sort().join(',')!=='commandHash,requestId,settingsHash'||Object.keys(report).sort().join(',')!=='description,outcome,requestId,settingsHash'||intent.requestId!==row.id||intent.settingsHash!==row.settingsHash||report.requestId!==row.id||report.settingsHash!==row.settingsHash||report.outcome!=='REQUIRES_CHECK'||report.description!==unknown||hash(reportBytes)!==row.resultHash||Object.keys(row.result).sort().join(',')!=='description,outcome,requestId,settingsHash'||Object.entries(report).some(([k,v])=>row.result[k]!==v))fail();
 const command=['RESULT_FILENAME|'+path.win32.join(settings.workFolder,'mws-cash-'+row.id+'.res'),...row.plan.lines.map(l=>'S|'+l.description+'|'+l.quantity+'|'+l.unitPrice+'||'+l.department),'PAY||1'].join('\r\n')+'\r\n';
 const commandBytes=Buffer.from(Array.from(command,c=>{if(!cp1253.has(c))fail();return cp1253.get(c);}));
 if(hash(commandBytes)!==intent.commandHash||row.plan.payment.code!==1||Number(row.plan.total)!==Number(row.total)||Number(row.plan.payment.amount)!==Number(row.total))fail();
 const text=raw.toString('ascii'),lines=text.split(/\r?\n/),date=lines[4]?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
 if(!/[\r\n]$/.test(text)||lines[0]?.trim()!=='0'||!date||lines[3]!==row.serialNumber||lines[7]?.trim()||lines.slice(8).some(l=>l.trim()&&!/^\d+$/.test(l)))fail();
 let url;try{url=new URL(lines[6]);}catch{fail();}
 const sig=url.searchParams.get('SIG'),stamp=date[3].slice(2)+date[2]+date[1]+date[4]+date[5];
 if(url.hostname!=='www1.aade.gr'||url.pathname!=='/tameiakes/myweb/q1.php'||!sig?.startsWith(row.serialNumber)||!sig.endsWith(stamp+Number(row.total).toFixed(2)))fail();
 const result=validateFtextCashResult({requestId:row.id,settingsHash:row.settingsHash,outcome:'CONFIRMED',code:0,serialNumber:lines[3],dayId:lines[1],dayCounter:lines[2],deviceTime:lines[4],qr:lines[6],rawResultHash:hash(raw)},row);
 return {value,result,resultHash:hash(JSON.stringify(result))};
}

export function effectiveFtextCashReceipt(row,settings){
 const saved=row?.checkoutJson?.ftextLateCashReceipt;if(!saved)return row?.result;
 if(!saved.actorId||!saved.at||saved.originalResultHash!==row.resultHash||saved.settingsHash!==row.settingsHash)fail();
 const proof=verifyLateCashFiles(row,settings,{intentBase64:saved.intentBase64,reportBase64:saved.reportBase64,rawResultBase64:saved.rawResultBase64,reason:saved.reason});
 if(saved.resultHash!==proof.resultHash||JSON.stringify(saved.result)!==JSON.stringify(proof.result)){
  // PostgreSQL JSONB does not preserve object key order.
  if(saved.resultHash!==proof.resultHash||Object.keys(saved.result||{}).length!==Object.keys(proof.result).length||Object.entries(proof.result).some(([k,v])=>saved.result?.[k]!==v))fail();
 }
 return proof.result;
}

export async function recordLateCashReceipt(tx,scope,id,actorId,input,{context,clock=()=>new Date()}={}){
 if(!actorId||typeof context!=='function')fail();
 const current=await context(tx,scope,{requireOnline:false});
 await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${['ftext-cash',scope.companyId,scope.storeId,current.settings.serialNumber].join(':')},0))`;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 if(!row||row.claimedByDeviceId!==current.device?.id||row.claimedTokenVersion!==current.device?.tokenVersion)fail();
 const proof=verifyLateCashFiles(row,current.settings,input),saved=row.checkoutJson.ftextLateCashReceipt;
 if(saved){effectiveFtextCashReceipt(row,current.settings);if(saved.resultHash!==proof.resultHash||saved.intentBase64!==proof.value.intentBase64||saved.reportBase64!==proof.value.reportBase64||saved.rawResultBase64!==proof.value.rawResultBase64)fail();return row;}
 if(row.status!=='REQUIRES_CHECK'||row.saleId)fail();
 const reused=(await tx.$queryRaw`SELECT "id" FROM "FtextCashRequest" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "serialNumber"=${row.serialNumber} AND "id"<>${row.id} AND "status" IN ('CONFIRMED','SALE_COMMITTED') AND COALESCE("checkoutJson"->'ftextLateCashReceipt'->'result'->>'dayId',"result"->>'dayId')=${proof.result.dayId} AND COALESCE("checkoutJson"->'ftextLateCashReceipt'->'result'->>'dayCounter',"result"->>'dayCounter')=${proof.result.dayCounter} LIMIT 1`)[0];
 if(reused)fail();
 const evidence={...proof.value,result:proof.result,resultHash:proof.resultHash,originalResultHash:row.resultHash,settingsHash:row.settingsHash,actorId,at:clock().toISOString()};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextLateCashReceipt:evidence})}::jsonb,"status"='CONFIRMED',"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
