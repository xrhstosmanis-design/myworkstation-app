import {createHash} from 'node:crypto';
import {z} from 'zod';

export const CASH_PAPER_ENTITY='CASH_PAPER_READING';
export const paperError=(code,status=409)=>Object.assign(new Error(code),{code,status});
export const paperRequest=z.object({messageId:z.string().min(1).max(180),checksum:z.string().regex(/^[a-f0-9]{64}$/),generation:z.string().regex(/^(0|[1-9][0-9]{0,18})$/)}).strict();
export const paperKinds=['OPENING_CASH','CLOSING_CASH','CASHBOX','REFILL','BANK_DEPOSIT','EXPENSE','POS','EFTPOS','PREPAID','OTHER'];
const nullableText=max=>z.string().max(max).nullable();
export const rawPaperSchema=z.object({dateText:nullableText(100),documentDate:nullableText(10),operatorText:nullableText(180),shiftText:nullableText(180),
  lines:z.array(z.object({kind:z.enum(paperKinds),label:z.string().min(1).max(180),amountText:nullableText(60),quantityText:nullableText(60),timeText:nullableText(60),uncertain:z.boolean()}).strict()).max(60),
  notes:z.array(z.string().max(300)).max(12)}).strict();

// Do not interpret a lone 1.234, expressions, empty values or illegible marks as money.
export function paperCents(value){
  if(typeof value!=='string')return null;
  let s=value.trim().replace(/−/g,'-').replace(/^€\s*|\s*€$/g,'');
  if(/^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s))s=s.replaceAll('.','');
  else if(/^-?\d{1,3}(?: \d{3})+,\d{1,2}$/.test(s))s=s.replaceAll(' ','');
  if(!/^-?\d{1,9}(?:[,.]\d{1,2})?$/.test(s))return null;
  const negative=s.startsWith('-'),[whole,part='']=s.replace('-','').replace(',','.').split('.');
  const n=Number(whole)*100+Number(part.padEnd(2,'0'));
  return Number.isSafeInteger(n)&&n<=99999999900?(negative?-n:n):null;
}
function printedDate(text){
  if(typeof text!=='string')return null;
  const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/),local=text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if(!iso&&!local)return null;
  const [year,month,day]=iso?iso.slice(1):[local[3],local[2].padStart(2,'0'),local[1].padStart(2,'0')];
  const s=`${year}-${month}-${day}`,d=new Date(`${s}T12:00:00Z`);
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null;
}
export function normalizePaper(raw){
  if(JSON.stringify(raw).length>25000)throw paperError('CASH_PAPER_INVALID_RESULT',502);
  const data=rawPaperSchema.parse(raw),date=printedDate(data.dateText);
  const documentDate=date&&date===data.documentDate?date:null;
  return {...data,documentDate,lines:data.lines.map(line=>({...line,amountCents:paperCents(line.amountText),requiresReview:line.uncertain||(line.kind!=='OTHER'||line.amountText!==null)&&paperCents(line.amountText)===null})),
    associationVerified:false,employeeLiabilityAdjusted:false,readingOnly:true};
}
export function paperKey({companyId,storeId,generation},checksum){
  if(!companyId||!storeId||! /^(0|[1-9][0-9]{0,18})$/.test(generation||'')||BigInt(generation)>9223372036854775807n||!/^[a-f0-9]{64}$/.test(checksum||''))throw paperError('CASH_PAPER_SCOPE_INVALID',400);
  return createHash('sha256').update(JSON.stringify(['CASH_PAPER_V1',companyId,storeId,generation,checksum])).digest('hex');
}
export const intentId=key=>`cash-paper-intent:${key}`;
export const completionId=key=>`cash-paper-result:${key}`;
export function validatePaperSource(row,scope,checksum){
  if(!row||row.companyId!==scope.companyId||row.storeId!==scope.storeId)throw paperError('CASH_PAPER_NOT_FOUND',404);
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(row.attachmentMimeType))throw paperError('CASH_PAPER_UNSUPPORTED',400);
  const encoded=row.attachmentData;
  if(typeof encoded!=='string'||encoded.length>10_000_000||! /^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw paperError('CASH_PAPER_UNSUPPORTED',400);
  const bytes=Buffer.from(encoded,'base64');
  if(!bytes.length||bytes.length>7*1024*1024||Number(row.attachmentSize)!==bytes.length)throw paperError('CASH_PAPER_UNSUPPORTED',400);
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==checksum||actual!==String(row.attachmentChecksum||'').toLowerCase())throw paperError('CASH_PAPER_SOURCE_CHANGED');
  const mime=row.attachmentMimeType;
  const valid=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)throw paperError('CASH_PAPER_UNSUPPORTED',400);
  return {messageId:row.id,checksum,mimeType:mime,filename:String(row.attachmentName||'paper').slice(0,180),bytes};
}

export const paperJsonSchema={type:'object',additionalProperties:false,required:['dateText','documentDate','operatorText','shiftText','lines','notes'],properties:{
  dateText:{type:['string','null']},documentDate:{type:['string','null']},operatorText:{type:['string','null']},shiftText:{type:['string','null']},notes:{type:'array',items:{type:'string'}},
  lines:{type:'array',items:{type:'object',additionalProperties:false,required:['kind','label','amountText','quantityText','timeText','uncertain'],properties:{kind:{type:'string',enum:paperKinds},label:{type:'string'},amountText:{type:['string','null']},quantityText:{type:['string','null']},timeText:{type:['string','null']},uncertain:{type:'boolean'}}}}}};
