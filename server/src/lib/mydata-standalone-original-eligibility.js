import {standaloneZeroDelivery} from './invoice-payment-observation.js';

const sources=['inbound','inbox','jobs','documents','orders','aliases','paymentAllocations','attachments','transactions'];
const pointers=['originalJobId','mydataDraftOrderId','mydataDraftDocumentId','mydataPosReceipt','commonDraft'];
const observedLinks={inbound:['inboxId','mark'],inbox:['attachmentId'],jobs:['attachmentId','inboxId','inboundId'],documents:['inboxId'],orders:['inboxId'],aliases:['inboxId','mark'],paymentAllocations:['documentId'],transactions:['attachmentFilename']};
const object=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=160&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const zero=value=>(typeof value==='string'||typeof value==='number')&&/^[+]?0+(?:[.,]0+)?$/.test(String(value));
const denied=reason=>({eligible:false,mode:null,replay:false,reason});

/**
 * Preparatory pure policy, deliberately not wired into original acquisition.
 * A future authorized reader must provide complete, uncapped scoped metadata
 * under the existing acquisition lock and reread it after network work.
 * Flags assert that reader contract; this function cannot prove SQL coverage.
 * Attachment metadata is not proof of original PDF identity. Fresh downloads
 * still require the unchanged provider/content/MARK/VAT/number verification.
 * No source object, identifier, money or original content is returned on refusal.
 */
export function evaluateStandaloneDeliveryAttachment(snapshot,scope){
 if(!object(scope)||!['companyId','storeId','inboxId'].every(key=>identifier(scope[key])))return denied('INVALID_SCOPE');
 if(!object(snapshot)||snapshot.complete!==true||!object(snapshot.available)||!object(snapshot.facts))return denied('INCOMPLETE_SNAPSHOT');
 const rows={...snapshot.facts,transactions:snapshot.transactions};
 for(const name of sources){
  if(snapshot.available[name]!==true||!Array.isArray(rows[name])||rows[name].length>20000)return denied('INCOMPLETE_SOURCE');
  const ids=new Set();
  for(const row of rows[name]){
   if(!object(row)||!identifier(row.id)||ids.has(row.id))return denied('AMBIGUOUS_SOURCE');
   if(row.companyId!==scope.companyId||row.storeId!==scope.storeId)return denied('SCOPE_CONFLICT');
   ids.add(row.id);
  }
 }
 for(const [name,fields] of Object.entries(observedLinks))for(const row of rows[name]){
  if(fields.some(key=>!Object.hasOwn(row,key)||(row[key]!==null&&!identifier(row[key]))))return denied('INCOMPLETE_LINK_METADATA');
  if(name==='inbound'&&(!identifier(row.inboxId)||!identifier(row.mark)))return denied('INCOMPLETE_LINK_METADATA');
  if(name==='inbox'&&(!Object.hasOwn(row,'status')||!identifier(row.status)))return denied('INCOMPLETE_LINK_METADATA');
 }
 const inbound=rows.inbound.filter(row=>row.inboxId===scope.inboxId),inboxes=rows.inbox.filter(row=>row.id===scope.inboxId);
 if(inbound.length!==1||inboxes.length!==1)return denied('AMBIGUOUS_IDENTITY');
 const row=inbound[0],inbox=inboxes[0];
 if(row.invoiceType!=='9.3'||!['totalGross','totalNet','totalVat'].every(key=>zero(row[key])))return denied('NOT_ZERO_DELIVERY_NOTE');
 if(row.currency!=='EUR'||![row.issuerVat,row.counterpartVat].every(vat=>typeof vat==='string'&&/^\d{9}$/.test(vat))||!identifier(row.mark)||!/^\d+$/.test(row.mark)||!identifier(row.documentNumber))return denied('INVALID_IDENTITY');
 if(!object(row.rawPayload)||pointers.some(key=>Object.hasOwn(row.rawPayload,key)))return denied('IDENTITY_POINTER_PRESENT');
 if(inbox.status!=='RECEIVED')return denied('INBOX_NOT_RECEIVED');
 if(inbox.attachmentId!==null&&!identifier(inbox.attachmentId))return denied('INVALID_ATTACHMENT');
 const replay=inbox.attachmentId!==null;
 if(replay){
  const attachments=rows.attachments.filter(attachment=>attachment.id===inbox.attachmentId);
  if(attachments.length!==1||attachments[0].mimeType!=='application/pdf'||attachments[0].hasContent!==true||!(/^[a-f0-9]{64}$/i.test(attachments[0].checksum||'')))return denied('INVALID_ATTACHMENT');
  if(rows.inbox.some(other=>other.id!==inbox.id&&other.attachmentId===inbox.attachmentId))return denied('SHARED_ATTACHMENT');
 }
 // Supplement the existing ordinary proof with direct metadata edges that a
 // future reader may expose even before an attachment has been acquired.
 if(rows.jobs.some(job=>job.inboxId===inbox.id||job.inboundId===row.id))return denied('LINK_PRESENT');
 const facts={...snapshot.facts,inbound:rows.inbound.map(source=>source===row?{...source,deliveryNoteMetadataVerified:true}:source)};
 const item={sources:[{kind:'MYDATA',id:row.id}],totalCents:0,documentType:null};
 if(!standaloneZeroDelivery(item,facts,rows.transactions))return denied('LINK_OR_IDENTITY_CONFLICT');
 return {eligible:true,mode:'ATTACHMENT_ONLY',replay,reason:'STANDALONE_ZERO_MYDATA_9_3_V1'};
}
