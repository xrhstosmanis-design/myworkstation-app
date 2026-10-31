import {createHash} from 'node:crypto';
import {z} from 'zod';
import {verifyFtextOriginalUnknownFiles} from './ftext-late-cash-receipt.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=()=>{throw Object.assign(new Error('Δεν επαληθεύτηκε απόρριψη της πρώτης και μοναδικής γραμμής. Απαιτείται έλεγχος· δεν στάλθηκε νέα εντολή.'),{status:409,code:'FTEXT_CASH_FIRST_LINE_REVIEW'})};
const inputSchema=z.object({intentBase64:z.string(),reportBase64:z.string(),rawResultBase64:z.string(),reason:z.string().trim().min(5).max(500),noReceipt:z.literal(true)}).strict();
export function verifyFtextCashFirstLineRejection(row,settings,input){
 const {noReceipt,...files}=inputSchema.parse(input);
 if(row?.status!=='REQUIRES_CHECK'||row.saleId||row.plan?.payment?.method!=='CASH'||row.plan.lines?.length!==1||row.checkoutJson?.ftextLateCashReceipt)fail();
 const candidate={...row,checkoutJson:{...row.checkoutJson}};delete candidate.checkoutJson.ftextOperatorRelease;
 const proof=verifyFtextOriginalUnknownFiles(candidate,settings,files);
 let text;try{text=new TextDecoder('windows-1253',{fatal:true}).decode(proof.raw)}catch{fail();}
 const lines=text.split(/\r?\n/),l=row.plan.lines[0],expected='InputLine: S|'+l.description+'|'+l.quantity+'|'+l.unitPrice+'||'+l.department;
 if(!/[\r\n]$/.test(text)||lines[0]?.trim()!=='2'||lines[1]!=='OVER LIMIT'||lines[2]!==expected||lines.slice(3).some(s=>s.trim()))fail();
 return {...proof.value,noReceipt,rawResultHash:hash(proof.raw),code:2,failedCommand:'S',failedLine:expected};
}
export function ftextCashFirstLineReleased(row){
 const p=row?.checkoutJson?.ftextCashFirstLineRejection,r=row?.checkoutJson?.ftextOperatorRelease;
 return row?.status==='REQUIRES_CHECK'&&!row.saleId&&row.plan?.payment?.method==='CASH'&&row.checkoutJson.paymentMethod==='CASH'&&!row.checkoutJson.ftextVoid&&!row.checkoutJson.ftextLateCashReceipt&&p?.code===2&&p.failedCommand==='S'&&p.noReceipt===true&&p.actorId&&p.at&&p.originalResultHash===row.resultHash&&p.settingsHash===row.settingsHash&&r?.reviewMode==='VERIFIED_FIRST_LINE_REJECTION'&&r.registerReady===true&&r.readinessVerified===false&&r.resultHash===row.resultHash&&r.settingsHash===row.settingsHash&&r.actorId===p.actorId&&r.at===p.at;
}
export async function releaseFtextCashFirstLine(tx,scope,id,actorId,input,{context,clock=()=>new Date()}={}){
 if(!actorId||typeof context!=='function')fail();
 const current=await context(tx,scope,{requireOnline:false});
 await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${['ftext-cash',scope.companyId,scope.storeId,current.settings.serialNumber].join(':')},0))`;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 if(!row||row.claimedByDeviceId!==current.device?.id||row.claimedTokenVersion!==current.device?.tokenVersion)fail();
 const proof=verifyFtextCashFirstLineRejection(row,current.settings,input),saved=row.checkoutJson.ftextCashFirstLineRejection;
 if(saved){if(!ftextCashFirstLineReleased(row)||saved.intentBase64!==proof.intentBase64||saved.reportBase64!==proof.reportBase64||saved.rawResultBase64!==proof.rawResultBase64||saved.rawResultHash!==proof.rawResultHash)fail();return row;}
 if(row.checkoutJson.ftextOperatorRelease)fail();
 if((await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${row.clientTransactionId} LIMIT 1`).length)fail();
 const at=clock().toISOString(),evidence={...proof,originalResultHash:row.resultHash,settingsHash:row.settingsHash,actorId,at};
 // Compatibility flag releases only the app lock. No fiscal command or readiness assertion.
 const release={actorId,at,resultHash:row.resultHash,settingsHash:row.settingsHash,registerReady:true,readinessVerified:false,reviewMode:'VERIFIED_FIRST_LINE_REJECTION'};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextCashFirstLineRejection:evidence,ftextOperatorRelease:release})}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
