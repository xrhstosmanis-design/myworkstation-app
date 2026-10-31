import crypto from 'node:crypto';
import {invoiceNumberParts,sameInvoiceIdentityForReview} from '../lib/invoice-common-draft.js';
import {readPendingInvoices,readPendingInvoiceSnapshotRows,readPendingInvoiceSnapshotRowsForAutomationInTransaction} from './pos-pending-invoices.js';
import {requireMonthlyCaptureContext} from './monthly-inventory-capture-authorization.js';
import {companyModuleState,isCurrentlyActive} from '../middleware/module-access.js';

const roles=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
const PAGE_SIZE=50,MAX_SOURCE_ROWS=20000;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400,code='INVOICE_MONTH_AUDIT_INVALID')=>{throw Object.assign(new Error(message),{status,code})};
const safeText=(value,max=160)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const vat=value=>String(value||'').replace(/\D/g,'');
const day=value=>{const s=value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null};
const cents=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Math.round(Number(value)*100):null;
const cancelled=status=>['CANCELLED','DELETED','REJECTED','REVERSED'].includes(status);
const inboundDocumentType=value=>/^5\.\d+$/.test(String(value||''))?'CREDIT_NOTE':/^[123]\.\d+$/.test(String(value||''))?'INVOICE':null;

export function invoiceAuditMonth(month){
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))fail('Επίλεξε έγκυρο μήνα.');
 const first=month+'-01',next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 return {month,fromDay:first,toDayExclusive:next.toISOString().slice(0,10),basis:'DOCUMENT_ISSUE_DATE',timeZone:'Europe/Athens'};
}

// Fixed metadata projections only. No attachment, image or raw OCR content is
// fetched, and no optional intake/bootstrap function is called by this reader.
const domains={
 documents:{table:'PurchaseDocument',columns:['id','companyId','storeId','supplierId','documentType','documentNumber','documentDate','totalGross','status','sourceType','purchaseOrderId','paymentTransactionId','createdAt'],sql:`SELECT d."id",d."supplierId",d."documentType",d."documentNumber",to_char(d."documentDate",'YYYY-MM-DD') AS "issueDay",d."totalGross"::text,d."status",d."sourceType",d."purchaseOrderId",d."paymentTransactionId",d."createdAt",s."name" AS "supplierName",s."taxId" AS "supplierTaxId" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" WHERE d."companyId"=$1 AND d."storeId"=$2`},
 orders:{table:'PurchaseOrder',columns:['id','companyId','storeId','supplierId','status','invoiceNumber','sourceDocumentId','createdAt'],sql:`SELECT o."id",o."supplierId",o."status",o."invoiceNumber",o."sourceDocumentId",o."createdAt" FROM "PurchaseOrder" o WHERE o."companyId"=$1 AND o."storeId"=$2`},
 inbound:{table:'MyDataInboundDocument',columns:['id','companyId','storeId','inboxId','mark','issuerVat','series','documentNumber','issueDate','invoiceType','totalGross','rawPayload','fetchedAt'],sql:`SELECT m."id",m."inboxId",m."mark",m."issuerVat",m."series",m."documentNumber",to_char(m."issueDate",'YYYY-MM-DD') AS "issueDay",m."invoiceType",m."totalGross"::text,m."rawPayload"->>'mydataDraftOrderId' AS "draftOrderId",m."fetchedAt" AS "createdAt" FROM "MyDataInboundDocument" m WHERE m."companyId"=$1 AND m."storeId"=$2`},
 inbox:{table:'DocumentInbox',columns:['id','companyId','storeId','attachmentId','status','receivedAt'],sql:`SELECT i."id",i."attachmentId",i."status",i."receivedAt" AS "createdAt" FROM "DocumentInbox" i WHERE i."companyId"=$1 AND i."storeId"=$2`},
 jobs:{table:'AiReaderJob',columns:['id','companyId','storeId','attachmentId','purchaseDocumentId','status'],sql:`SELECT j."id",j."attachmentId",j."purchaseDocumentId",j."status" FROM "AiReaderJob" j WHERE j."companyId"=$1 AND j."storeId"=$2`},
 attachments:{table:'DocumentAttachment',columns:['id','companyId','storeId','mimeType','checksum','contentData'],sql:`SELECT a."id",a."mimeType",a."checksum",a."contentData" IS NOT NULL AS "hasContent" FROM "DocumentAttachment" a WHERE a."companyId"=$1 AND a."storeId"=$2`},
 aliases:{table:'InvoiceDraftAlias',columns:['aliasOrderId','aliasDocumentId','companyId','storeId','canonicalOrderId','canonicalDocumentId','inboxId','mark','details'],id:'aliasOrderId',sql:`SELECT a."aliasOrderId",a."aliasDocumentId",a."canonicalOrderId",a."canonicalDocumentId",a."inboxId",a."mark",a."details"->'completed' AS "completed",a."details"->>'orderId' AS "auditOrderId",a."details"->>'documentId' AS "auditDocumentId",a."details"->>'inboxId' AS "auditInboxId",a."details"->>'mark' AS "auditMark",a."details"->'aliasOrderIds' AS "auditAliasOrderIds" FROM "InvoiceDraftAlias" a WHERE a."companyId"=$1 AND a."storeId"=$2`},
 postings:{table:'PurchaseOrderPosting',columns:['orderId','companyId','purchaseDocumentId'],id:'orderId',sql:`SELECT p."orderId",p."purchaseDocumentId" FROM "PurchaseOrderPosting" p JOIN "PurchaseOrder" o ON o."id"=p."orderId" AND o."companyId"=p."companyId" WHERE p."companyId"=$1 AND o."storeId"=$2`},
 stockPostings:{table:'InvoiceStockPosting',columns:['companyId','storeId','orderId','sourceDocumentId','postedDocumentId','path'],id:'sourceDocumentId',sql:`SELECT p."orderId",p."sourceDocumentId",p."postedDocumentId",p."path" FROM "InvoiceStockPosting" p WHERE p."companyId"=$1 AND p."storeId"=$2`}
};
const pendingRequired={StoreTransaction:['id','companyId','storeId','supplierId','supplierName','amount','actorId','actorName','occurredAt','invoiceDocumentNumber','attachmentMimeType','attachmentFilename','attachmentChecksum','attachmentData','paymentMethod','subtractFromShift','sessionId','type','reversedAt'],StoreOperatorAudit:['id','companyId','storeId','eventType','actorId','details'],Supplier:['id','companyId','name','taxId']};

async function capabilities(tx){
 const required={...pendingRequired};for(const definition of Object.values(domains))required[definition.table]=definition.columns;
 const rows=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,Object.keys(required));
 const result={};for(const [table,columns] of Object.entries(required))result[table]=columns.every(column=>rows.some(row=>row.table===table&&row.column===column));return result;
}

async function authorize(tx,actor,storeId,now){
 const current=await tx.user.findUnique({where:{id:actor.id},select:{id:true,role:true,companyId:true}});
 if(!current||!roles.has(current.role))fail('Η τρέχουσα σύνδεση δεν επιτρέπει έλεγχο τιμολογίων.',403,'INVOICE_MONTH_AUDIT_DENIED');
 const companyId=actor.companyId;
 if(current.role==='SUPER_ADMIN'){
  if(actor.supportContext&&(actor.supportContext.companyId!==companyId||actor.supportContext.storeId&&actor.supportContext.storeId!==storeId))fail('Η επιλογή δεν ανήκει στην πρόσβαση υποστήριξης.',403);
 }else{
  if(actor.supportContext||actor.isSuperAdmin||actor.platformRole==='SUPER_ADMIN')fail('Η πρόσβαση υποστήριξης δεν είναι πλέον ενεργή.',403);
  if(current.companyId!==companyId){
   if(current.role!=='OWNER'||actor.ownerCompanyId!==companyId)fail('Δεν έχεις πρόσβαση στην εταιρεία.',403);
   const access=await tx.$queryRawUnsafe(`SELECT 1 FROM "OwnerCompanyAccess" a JOIN "Company" c ON c."id"=a."companyId" WHERE a."ownerId"=$1 AND a."companyId"=$2 AND c."active"=TRUE LIMIT 1`,actor.id,companyId);
   if(!access.length)fail('Η πρόσβαση στην εταιρεία έχει αφαιρεθεί.',403);
  }
 }
 const store=await tx.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,companyId:true,name:true}});
 if(!store)fail('Δεν βρέθηκε ενεργό κατάστημα στην επιλεγμένη εταιρεία.',404);
 if(current.role!=='SUPER_ADMIN'){
  const state=await companyModuleState(companyId,{db:tx,now});
  if(!state?.licenseAllowed)fail('Η άδεια της εταιρείας δεν είναι ενεργή.',403);
  const overrides=await tx.$queryRawUnsafe(`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=$1 AND "storeId"=$2 AND "moduleKey"='INVENTORY' LIMIT 1`,companyId,storeId);
  if(!(overrides[0]?isCurrentlyActive(overrides[0],now):state.activeModules.includes('INVENTORY')))fail('Η Αποθήκη δεν είναι ενεργή στο επιλεγμένο κατάστημα.',403);
 }
 return store;
}

// Same personal admission and persisted authorization core, reusable by an
// unmounted storage writer in its OWN fresh transaction. This does not certify
// supplied source facts or bypass the C2 read-only transaction contract.
export async function authorizeMonthlyInvoiceAuditInTransaction(tx,actor,storeId,now){
 if(!actor||!safeText(actor.id)||!safeText(actor.companyId)||actor.tokenType&&actor.tokenType!=='BACKOFFICE_USER'||!roles.has(actor.role)||actor.storeId&&actor.storeId!==storeId)fail('Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.',403);
 if(!safeText(storeId)||!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('Επίλεξε συγκεκριμένο κατάστημα.');
 return authorize(tx,actor,storeId,now);
}

function identity(row){return {documentNumber:row.documentNumber,documentDate:row.issueDay,documentType:row.documentType,totalGross:row.totalGross};}
function sameIdentity(a,b){return sameInvoiceIdentityForReview(identity(a),identity(b))&&(!vat(a.supplierTaxId)||!vat(b.supplierTaxId)||vat(a.supplierTaxId)===vat(b.supplierTaxId));}
function sameIncomingIdentity(a,b){return /^\d{9}$/.test(vat(a.supplierTaxId))&&vat(a.supplierTaxId)===vat(b.supplierTaxId)&&sameIdentity(a,b)}

// All source metadata has been fetched before this function is called. An
// analysis cap never becomes a zero-issues conclusion or a partial summary.
function classifyInvoiceMonthCore(facts,period){
 const docs=new Map(facts.documents.map(d=>[d.id,{...d,key:'doc:'+d.id,issueDay:day(d.issueDay)}]));
 const orders=new Map(facts.orders.map(o=>[o.id,o])),inbound=facts.inbound.map(m=>({...m,key:'inbound:'+m.id,documentNumber:[m.series,m.documentNumber].filter(Boolean).join(' '),documentType:inboundDocumentType(m.invoiceType),supplierTaxId:m.issuerVat,issueDay:day(m.issueDay)}));
 const inboxById=new Map(facts.inbox.map(i=>[i.id,i])),inboundByInbox=new Map(facts.inbound.map(m=>[m.inboxId,m])),postingsByOrder=new Map(facts.postings.map(p=>[p.orderId,p]));
 const stockPostingKeys=new Set(facts.stockPostings.map(p=>JSON.stringify([p.orderId,p.sourceDocumentId,p.postedDocumentId,p.path]))),attachmentsById=new Map(facts.attachments.map(a=>[a.id,a])),jobsByAttachment=new Map(),aliasesByInbox=new Map(),uploadedDocs=new Set();
 for(const j of facts.jobs){const list=jobsByAttachment.get(j.attachmentId)||[];list.push(j);jobsByAttachment.set(j.attachmentId,list);const a=attachmentsById.get(j.attachmentId);if(j.purchaseDocumentId&&!cancelled(j.status)&&a?.hasContent===true&&/^[0-9a-f]{64}$/.test(a.checksum||'')&&['application/pdf','image/jpeg','image/png','image/webp'].includes(a.mimeType))uploadedDocs.add(j.purchaseDocumentId)}
 for(const a of facts.aliases){const list=aliasesByInbox.get(a.inboxId)||[];list.push(a);aliasesByInbox.set(a.inboxId,list)}
 const parent=new Map(),reasons=new Map(),known=new Set(),setReason=(key,reason)=>{const list=reasons.get(key)||[];if(!list.includes(reason))list.push(reason);reasons.set(key,list)};
 for(const d of docs.values())parent.set(d.key,d.key);for(const m of inbound)parent.set(m.key,m.key);for(const o of orders.values())parent.set('order:'+o.id,'order:'+o.id);
 const root=key=>{let p=key;while(parent.get(p)&&parent.get(p)!==p)p=parent.get(p);return p};
 const join=(a,b)=>{const x=root(a),y=root(b);if(x!==y)parent.set(y,x)};
 const validOrders=new Map();
 for(const o of orders.values()){
  if(!o.sourceDocumentId)continue;
  const d=docs.get(o.sourceDocumentId),a=invoiceNumberParts(o.invoiceNumber),b=invoiceNumberParts(d?.documentNumber);
  if(d&&d.purchaseOrderId===o.id&&d.supplierId===o.supplierId&&a.number&&a.number===b.number&&a.series===b.series){validOrders.set(o.id,d);join(d.key,'order:'+o.id)}
  else{setReason('order:'+o.id,'Η σύνδεση αγοράς και αρχικού παραστατικού χρειάζεται έλεγχο.');if(d)setReason(d.key,'Η σύνδεση αγοράς και αρχικού παραστατικού χρειάζεται έλεγχο.')}
 }
 for(const d of docs.values()){
  if(!d.purchaseOrderId)continue;
  const o=orders.get(d.purchaseOrderId),source=validOrders.get(d.purchaseOrderId);
  if(source?.id===d.id)continue;
  const posted=postingsByOrder.get(o?.id)?.purchaseDocumentId===d.id&&stockPostingKeys.has(JSON.stringify([o?.id,source?.id,d.id,'PURCHASE_ORDER']));
  if(o&&source&&d.sourceType==='PURCHASE_ORDER'&&d.status==='APPROVED'&&d.supplierId===source.supplierId&&sameIdentity(d,source)&&posted)join(source.key,d.key);
  else setReason(d.key,'Η προβολή ή καταχώριση της αγοράς δεν επιβεβαιώνεται από τις συνδέσεις της.');
 }
 const validatedPostedOrders=new Set();
 for(const o of orders.values()){
  if(o.status==='MERGED')continue;
  const source=validOrders.get(o.id),posting=postingsByOrder.get(o.id),target=docs.get(posting?.purchaseDocumentId);
  const valid=source&&target&&target.status==='APPROVED'&&target.purchaseOrderId===o.id&&target.supplierId===source.supplierId&&sameIdentity(target,source)&&root(target.key)===root(source.key)&&stockPostingKeys.has(JSON.stringify([o.id,source.id,target.id,'PURCHASE_ORDER']));
  if(valid)validatedPostedOrders.add(o.id);
  else if(posting||source?.status==='APPROVED'||o.status==='INVOICED'){
   const reason='Η καταχώριση αγοράς δεν διαθέτει επιβεβαιωμένο εγκεκριμένο παραστατικό και σύνδεση αποθήκης.';
   setReason('order:'+o.id,reason);if(source)setReason(source.key,reason);if(target)setReason(target.key,reason);
  }
 }
 for(const a of facts.aliases){
  const left=docs.get(a.aliasDocumentId),right=docs.get(a.canonicalDocumentId),lo=orders.get(a.aliasOrderId),ro=orders.get(a.canonicalOrderId);
  const matched=inboundByInbox.get(a.inboxId),original=matched?.mark===a.mark?matched:null,originalIdentity=original?{...original,documentNumber:[original.series,original.documentNumber].filter(Boolean).join(' '),documentType:inboundDocumentType(original.invoiceType),supplierTaxId:original.issuerVat}:null;
  const receipt=a.completed===true&&a.auditOrderId===a.canonicalOrderId&&a.auditDocumentId===a.canonicalDocumentId&&a.auditInboxId===a.inboxId&&a.auditMark===a.mark&&Array.isArray(a.auditAliasOrderIds)&&a.auditAliasOrderIds.includes(a.aliasOrderId);
  if(left&&right&&lo?.sourceDocumentId===left.id&&ro?.sourceDocumentId===right.id&&left.purchaseOrderId===lo.id&&right.purchaseOrderId===ro.id&&lo.status==='MERGED'&&left.status==='MERGED'&&receipt&&originalIdentity&&sameIncomingIdentity(originalIdentity,right)){join(right.key,left.key);join(right.key,'order:'+lo.id)}
  else{if(left)setReason(left.key,'Η αποθηκευμένη ενοποίηση χρειάζεται έλεγχο.');if(right)setReason(right.key,'Η αποθηκευμένη ενοποίηση χρειάζεται έλεγχο.')}
 }
 for(const m of inbound){
  const i=inboxById.get(m.inboxId),candidates=new Set();
  if(!i){setReason(m.key,'Η εγγραφή myDATA δεν συνδέεται με θυρίδα του ίδιου καταστήματος.');continue}
  const explicitOrder=orders.get(m.draftOrderId);if(explicitOrder?.sourceDocumentId)candidates.add(explicitOrder.sourceDocumentId);
  for(const j of jobsByAttachment.get(i.attachmentId)||[])if(j.purchaseDocumentId&&!cancelled(j.status))candidates.add(j.purchaseDocumentId);
  for(const a of aliasesByInbox.get(m.inboxId)||[])if(a.mark===m.mark)candidates.add(a.canonicalDocumentId);
  const linked=[...candidates].map(id=>docs.get(id));
  if(linked.length&&linked.every(d=>d&&sameIncomingIdentity(m,d))&&new Set(linked.map(d=>root(d.key))).size===1){join(linked[0].key,m.key);known.add(i.id)}
  else if(linked.length)setReason(m.key,'Η σύνδεση myDATA με την αγορά δεν συμφωνεί πλήρως.');
 }
 const groups=new Map();
 const add=(key,value)=>{const id=root(key),g=groups.get(id)||{id,sources:[],reasons:[]};g.sources.push(value);for(const r of reasons.get(key)||[])if(!g.reasons.includes(r))g.reasons.push(r);groups.set(id,g)};
 for(const d of docs.values())add(d.key,{...d,kind:'DOCUMENT'});
 for(const m of inbound)add(m.key,{...m,kind:'MYDATA'});
 for(const o of orders.values())add('order:'+o.id,{...o,kind:'ORDER',documentNumber:o.invoiceNumber,issueDay:null});
 const findings=[],primaryAmounts=new Map(),duplicateSuppressed=new Set();let inactive=0,credits=0;
 const selected=g=>{let active=g.sources.filter(s=>s.status!=='MERGED');if(!active.length&&g.reasons.length)active=g.sources;const dates=active.map(s=>s.issueDay).filter(Boolean);return dates.some(d=>d>=period.fromDay&&d<period.toDayExclusive)||!dates.length&&active.some(s=>{const d=day(s.createdAt);return d&&d>=period.fromDay&&d<period.toDayExclusive})};
 for(const g of groups.values()){
  if(!selected(g))continue;
  const primary=g.sources.find(s=>s.kind==='DOCUMENT'&&s.sourceType!=='PURCHASE_ORDER'&&s.status!=='MERGED')||g.sources.find(s=>s.kind!=='ORDER'&&s.status!=='MERGED')||g.sources[0];
  if(g.sources.every(s=>cancelled(s.status))){inactive++;continue}
  if(primary.documentType==='CREDIT_NOTE')credits++;
  const issueDay=primary.issueDay,number=invoiceNumberParts(primary.documentNumber),linkReview=g.reasons.length>0;
  if(!issueDay)g.reasons.push('Δεν υπάρχει επιβεβαιωμένη ημερομηνία έκδοσης· εμφανίζεται με βάση την παραλαβή.');
  if(!['INVOICE','CREDIT_NOTE'].includes(primary.documentType))g.reasons.push('Ο τύπος του παραστατικού χρειάζεται έλεγχο.');
  if(!number.number||!number.series&&String(primary.documentNumber||'').trim()==='')g.reasons.push('Λείπει ή δεν ταυτοποιείται ο αριθμός παραστατικού.');
  if(!primary.supplierId&&!vat(primary.supplierTaxId))g.reasons.push('Λείπει η ταυτότητα προμηθευτή.');
  if(!/^\d{9}$/.test(vat(primary.supplierTaxId)))g.reasons.push('Λείπει έγκυρο ΑΦΜ προμηθευτή.');
  if(cents(primary.totalGross)===null)g.reasons.push('Δεν επιβεβαιώνεται το ποσό του παραστατικού.');
  const posted=g.sources.some(s=>s.kind==='DOCUMENT'&&s.status==='APPROVED')&&g.sources.filter(s=>s.kind==='ORDER'&&s.status!=='MERGED').every(o=>validatedPostedOrders.has(o.id));
  const categories=[];
  if(!posted)categories.push('UNPOSTED_DOCUMENT');
  if(!posted&&g.sources.some(s=>s.kind==='DOCUMENT'&&uploadedDocs.has(s.id)))categories.push('UPLOADED_AWAITING_REVIEW');
  if(g.reasons.length)categories.push('IDENTITY_OR_LINK_REVIEW');
  const value={id:g.id,documentNumber:primary.documentNumber||null,documentType:primary.documentType||null,issueDay:issueDay||null,registeredAt:primary.createdAt?new Date(primary.createdAt).toISOString():null,supplierName:primary.supplierName||null,supplierTaxId:vat(primary.supplierTaxId)||null,totalCents:cents(primary.totalGross),status:posted?'POSTED':'UNPOSTED',sources:g.sources.map(s=>({kind:s.kind,id:s.id,status:s.status||null})),categories,reasons:[...new Set(g.reasons)]};
  primaryAmounts.set(value.id,primary.totalGross);findings.push(value);if(linkReview)duplicateSuppressed.add(value.id);
 }
 // Bucket by corroborated supplier VAT and full series/number/date/type before totals.
 // Distinct logical invoices remain distinct; this is human review, not reuse.
 const buckets=new Map();
 for(const row of findings){const p=invoiceNumberParts(row.documentNumber);if(!/^\d{9}$/.test(row.supplierTaxId||'')||!p.number||!row.issueDay||!row.documentType||row.totalCents===null||row.totalCents<=0||duplicateSuppressed.has(row.id))continue;const k=JSON.stringify([row.supplierTaxId,p.series,p.number,row.issueDay,row.documentType]);const b=buckets.get(k)||[];b.push(row);buckets.set(k,b)}
 for(const bucket of buckets.values()){
  bucket.sort((a,b)=>a.totalCents-b.totalCents||a.id.localeCompare(b.id));
  for(let i=0;i<bucket.length;i++){
   const a=bucket[i],neighbors=[bucket[i-1],bucket[i+1]].filter(b=>b&&Math.abs(a.totalCents-b.totalCents)<=5);
   if(neighbors.length){a.categories.push('POSSIBLE_DUPLICATE');a.reasons.push('Πιθανό διπλό παραστατικό· απαιτείται σύγκριση των πρωτοτύπων.')}
  }
 }
 const linkedInbox=new Set([...known,...facts.inbound.map(m=>m.inboxId)]);
 for(const i of facts.inbox){
  const received=day(i.createdAt);if(linkedInbox.has(i.id)||!received||received<period.fromDay||received>=period.toDayExclusive||cancelled(i.status))continue;
  const job=(jobsByAttachment.get(i.attachmentId)||[]).find(j=>docs.has(j.purchaseDocumentId)&&!cancelled(j.status));if(job)continue;
  findings.push({id:'inbox:'+i.id,documentNumber:null,documentType:null,issueDay:null,registeredAt:new Date(i.createdAt).toISOString(),supplierName:null,supplierTaxId:null,totalCents:null,status:'IDENTITY_UNKNOWN',sources:[{kind:'INBOX',id:i.id,status:i.status}],categories:['IDENTITY_OR_LINK_REVIEW'],reasons:['Παραλαβή θυρίδας προς ταυτοποίηση· δεν επιβεβαιώνεται ακόμη ότι είναι τιμολόγιο.']});
 }
 findings.sort((a,b)=>(a.issueDay||'9999').localeCompare(b.issueDay||'9999')||a.id.localeCompare(b.id));
 const counts={logicalRecords:findings.length,unposted:0,uploadedAwaitingReview:0,possibleDuplicates:0,identityReview:0,credits,inactive};
 for(const r of findings){if(r.categories.includes('UNPOSTED_DOCUMENT'))counts.unposted++;if(r.categories.includes('UPLOADED_AWAITING_REVIEW'))counts.uploadedAwaitingReview++;if(r.categories.includes('POSSIBLE_DUPLICATE'))counts.possibleDuplicates++;if(r.categories.includes('IDENTITY_OR_LINK_REVIEW'))counts.identityReview++}
 return {counts,items:findings,primaryAmounts};
}

export function classifyInvoiceMonth(facts,period){
 const {counts,items}=classifyInvoiceMonthCore(facts,period);return {counts,items};
}

async function readInvoiceSources(tx,actor,input,now,fullPending=false){
 const store=await authorize(tx,actor,input.storeId,now);
 return readInvoiceSourcesCore(tx,actor.companyId,store,input,()=> (fullPending?readPendingInvoiceSnapshotRows:readPendingInvoices)(tx,{companyId:actor.companyId,storeId:store.id,user:actor}));
}

// Private source/classifier composition, reached only through admitted entries.
async function readInvoiceSourcesCore(tx,companyId,store,input,readPending){
 const cap=await capabilities(tx),facts={},sourceCounts={},unavailable=[],limited=[];
 for(const [name,d]of Object.entries(domains)){
  if(!cap[d.table]||name==='documents'&&!cap.Supplier||name==='postings'&&!cap.PurchaseOrder){facts[name]=[];sourceCounts[name]=null;unavailable.push(name);continue}
  const rows=await tx.$queryRawUnsafe(`SELECT source.*,COUNT(*) OVER()::text AS "_sourceCount" FROM (${d.sql}) source ORDER BY source."${d.id||'id'}" LIMIT $3`,companyId,input.storeId,MAX_SOURCE_ROWS+1);
  const total=rows.length?Number(rows[0]._sourceCount):0;
  if(!Number.isSafeInteger(total)||total<rows.length)fail('Δεν επιβεβαιώθηκε η πληρότητα της πηγής.',502);
  sourceCounts[name]=total;if(total>MAX_SOURCE_ROWS)limited.push(name);
  facts[name]=rows.slice(0,MAX_SOURCE_ROWS).map(({_sourceCount,...row})=>row);
 }
 const pendingAvailable=Object.keys(pendingRequired).every(table=>cap[table]);
 const pending=pendingAvailable?await readPending():null;
 return {store,facts,sourceCounts,unavailable,limited,pendingAvailable,pending};
}


export async function readMonthlyInvoiceAudit(db,actor,input,{now=new Date()}={}){
 if(!actor||!safeText(actor.id)||!safeText(actor.companyId)||actor.tokenType&&actor.tokenType!=='BACKOFFICE_USER'||!roles.has(actor.role)||actor.storeId&&actor.storeId!==input?.storeId)fail('Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.',403);
 if(!input||Object.keys(input).some(k=>!['storeId','month','page'].includes(k))||!safeText(input.storeId))fail('Επίλεξε συγκεκριμένο κατάστημα.');
 const period=invoiceAuditMonth(input.month);let cursor=null;
 if(input.page!==undefined){if(!safeText(input.page,1024))fail('Μη έγκυρη σελίδα.');try{cursor=JSON.parse(Buffer.from(input.page,'base64url').toString('utf8'))}catch{fail('Μη έγκυρη σελίδα.')}if(!cursor||Object.keys(cursor).sort().join(',')!=='after,fingerprint,scope'||!safeText(cursor.after,200)||!/^[0-9a-f]{64}$/.test(cursor.fingerprint)||cursor.scope!==hash([actor.companyId,input.storeId,input.month]))fail('Μη έγκυρη σελίδα.');}
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '8000ms'");
  const {store,facts,sourceCounts,unavailable,limited,pendingAvailable,pending}=await readInvoiceSources(tx,actor,input,now);
  const complete=unavailable.length===0&&limited.length===0,analysis=complete?classifyInvoiceMonth(facts,period):{counts:null,items:[]};
  const fingerprint=hash({period,sourceCounts,facts:complete?facts:null,pending:pending?.fingerprint||null,unavailable,limited});
  if(cursor&&cursor.fingerprint!==fingerprint)fail('Τα στοιχεία άλλαξαν. Εκτέλεσε νέο έλεγχο πριν συνεχίσεις.',409,'INVOICE_MONTH_AUDIT_STALE_PAGE');
  const after=cursor?analysis.items.findIndex(item=>item.id===cursor.after):-1;
  if(cursor&&after<0)fail('Η σελίδα δεν ανήκει στο τρέχον αποτέλεσμα.',409);
  const items=analysis.items.slice(after+1,after+1+PAGE_SIZE),hasMore=after+1+items.length<analysis.items.length;
  return {store:{id:store.id,name:store.name},period,asOf:now.toISOString(),fingerprint,coverage:{complete,sourceCounts,sourceCountBasis:'ALL_STORED_METADATA_FOR_LINK_CONTEXT',unavailable,limited,sourceLimit:MAX_SOURCE_ROWS,detailsPageSize:PAGE_SIZE,scope:'STORED_SELECTED_STORE_SOURCES'},summary:analysis.counts,items,nextPage:hasMore?Buffer.from(JSON.stringify({after:items.at(-1).id,fingerprint,scope:hash([actor.companyId,store.id,input.month])})).toString('base64url'):null,pendingOriginals:{period:'ALL_MONTHS',label:'Όλοι οι μήνες',available:pendingAvailable,counts:pending?{total:pending.count,missingOriginal:pending.missingCount,uploadedAwaitingReview:pending.uploadedCount,reviewRequired:pending.reviewCount}:null,items:(pending?.rows||[]).map(row=>({id:row.id,supplierName:row.supplierName,amount:row.amount,documentNumber:row.documentNumber,documentDate:row.documentDate,status:row.status,occurredAt:row.occurredAt})),truncated:pending?.truncated||false,detailLimit:50},allClear:complete&&pendingAvailable&&analysis.counts.unposted===0&&analysis.counts.possibleDuplicates===0&&analysis.counts.identityReview===0&&pending.count===0,immutableSnapshot:false,readOnly:true};
 },{isolationLevel:'RepeatableRead',maxWait:2000,timeout:30000});
}

const snapshotFail=code=>fail(code,422,code);
const snapshotText=(value,max,{optional=false,id=false}={})=>{
 if(optional&&(value===null||value===undefined))return '';
 if(typeof value!=='string'||value.length>max||Buffer.byteLength(value,'utf8')>max||/[\u0000-\u001f\u007f]/.test(value)||id&&(!value||value.trim()!==value))snapshotFail('INVOICE_SNAPSHOT_TEXT_INVALID');
 return value;
};
const snapshotAmount=value=>{
 if(value===null||value===undefined)return null;
 if(typeof value!=='string'||value.length>32)snapshotFail('INVOICE_SNAPSHOT_AMOUNT_INVALID');
 // Unknown bounded monetary facts remain unknown in D1; never reconstruct a
 // decimal from the public rounded totalCents or the legacy pending Number.
 return value;
};
async function snapshotTransactionState(tx){
 const rows=await tx.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation,to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "transactionStartedAt",to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt",(EXTRACT(EPOCH FROM(clock_timestamp()-transaction_timestamp()))*1000)::text AS "ageMs"`);
 const row=rows[0];
 if(row?.readOnly!=='on'||!['repeatable read','serializable'].includes(row.isolation))snapshotFail('INVOICE_SNAPSHOT_TRANSACTION_REQUIRED');
 const stamp=value=>typeof value==='string'&&value.length===24&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
 const age=typeof row.ageMs==='string'&&/^\d+(?:\.\d+)?$/.test(row.ageMs)?Number(row.ageMs):NaN;
 if(!stamp(row.transactionStartedAt)||!stamp(row.readAt)||!Number.isFinite(age)||age<0||age>30000||row.transactionStartedAt>row.readAt||Date.parse(row.readAt)-Date.parse(row.transactionStartedAt)>30000)snapshotFail('INVOICE_SNAPSHOT_TRANSACTION_STALE');
 return row;
}

// Shared actual database admission probe for the internal composed stock reader.
// No injected clock/options and no change to the existing C2 reader contract.
export async function readMonthlyInvoiceSnapshotTransactionState(tx){
 if(arguments.length!==1)snapshotFail('INVOICE_SNAPSHOT_INPUT_INVALID');
 return snapshotTransactionState(tx);
}

// Internal, unmounted source metadata for a future same-transaction stock
// coordinator. It neither captures nor stores inventory and does not claim
// live authorization beyond the caller's bounded held MVCC snapshot.
export async function readMonthlyInvoiceSnapshotProjectionInTransaction(tx,actor,input){
 if(arguments.length!==3||!input||Object.keys(input).some(k=>!['storeId','month'].includes(k))||!safeText(input.storeId))snapshotFail('INVOICE_SNAPSHOT_INPUT_INVALID');
 if(!actor||!safeText(actor.id)||!safeText(actor.companyId)||actor.tokenType&&actor.tokenType!=='BACKOFFICE_USER'||!roles.has(actor.role)||actor.storeId&&actor.storeId!==input.storeId)fail('Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.',403);
 const period=invoiceAuditMonth(input.month),entry=await snapshotTransactionState(tx);
 const source=await readInvoiceSources(tx,actor,input,new Date(entry.readAt),true);
 return buildMonthlyInvoiceSnapshotProjection(tx,actor.companyId,period,entry,source);
}

export async function readMonthlyInvoiceSnapshotProjectionForAutomationInTransaction(tx,context){
 if(arguments.length!==2)snapshotFail('INVOICE_SNAPSHOT_INPUT_INVALID');
 const authority=await requireMonthlyCaptureContext(tx,context,'SOURCE');
 const input={storeId:authority.storeId,month:authority.month};
 const period=invoiceAuditMonth(input.month),entry=await snapshotTransactionState(tx);
 const source=await readInvoiceSourcesCore(tx,authority.companyId,authority.store,input,()=>readPendingInvoiceSnapshotRowsForAutomationInTransaction(tx,context));
 return buildMonthlyInvoiceSnapshotProjection(tx,authority.companyId,period,entry,source);
}

async function buildMonthlyInvoiceSnapshotProjection(tx,admittedCompanyId,period,entry,source){
 const {store,facts,sourceCounts,unavailable,limited,pendingAvailable,pending}=source;
 for(const [name,count]of Object.entries(sourceCounts))if(count!==null&&!limited.includes(name)&&count!==facts[name].length)snapshotFail('INVOICE_SNAPSHOT_SOURCE_COUNT_MISMATCH');
 const reasons=[...unavailable.map(name=>'SOURCE_UNAVAILABLE:'+name),...limited.map(name=>'SOURCE_LIMIT:'+name)];
 const complete=unavailable.length===0&&limited.length===0;
 const analysis=complete?classifyInvoiceMonthCore(facts,period):{counts:null,items:[],primaryAmounts:new Map()};
 if(analysis.items.length>MAX_SOURCE_ROWS)snapshotFail('INVOICE_SNAPSHOT_ROW_LIMIT');
 if(!pendingAvailable||!pending?.coverage.complete)reasons.push('PENDING_SOURCE_UNAVAILABLE');
 let bytes=1024;
 const account=row=>{bytes+=Buffer.byteLength(JSON.stringify(row),'utf8')+1;if(bytes>4*1024*1024)snapshotFail('INVOICE_SNAPSHOT_PAYLOAD_LIMIT');return row};
 const categories=new Set(['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW','POSSIBLE_DUPLICATE','IDENTITY_OR_LINK_REVIEW','MISSING_ORIGINAL']);
 const companyId=snapshotText(admittedCompanyId,160,{id:true}),storeId=snapshotText(store.id,160,{id:true});
 const invoices={period:period.month,items:analysis.items.map(row=>{
  const issueDay=row.issueDay;
  if(!issueDay)reasons.push('INVOICE_ISSUE_DATE_UNKNOWN');else if(issueDay<period.fromDay||issueDay>=period.toDayExclusive)reasons.push('INVOICE_PRIMARY_OUTSIDE_PERIOD');
  if(!Array.isArray(row.categories)||row.categories.some(c=>!categories.has(c)))snapshotFail('INVOICE_SNAPSHOT_CATEGORY_INVALID');
  return account({id:snapshotText(row.id,160,{id:true}),companyId,storeId,documentNumber:snapshotText(row.documentNumber,160,{optional:true}),supplierName:snapshotText(row.supplierName,512,{optional:true}),issueDay,categories:[...row.categories],totalAmount:snapshotAmount(analysis.primaryAmounts.get(row.id))});
 })};
 const statuses=new Set(['AWAITING_INVOICE','UPLOADED_AWAITING_REVIEW','REVIEW_REQUIRED']);
 const pendingOriginals={period:'ALL_MONTHS',items:(pending?.rows||[]).map(row=>{
  if(!statuses.has(row.status))snapshotFail('INVOICE_SNAPSHOT_STATUS_INVALID');
  const documentDate=row.documentDate===null||row.documentDate===undefined?'':row.documentDate;
  if(documentDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)||!Number.isFinite(Date.parse(documentDate))||new Date(documentDate).toISOString().slice(0,10)!==documentDate))snapshotFail('INVOICE_SNAPSHOT_PENDING_DATE_INVALID');
  return account({id:snapshotText(row.id,160,{id:true}),companyId,storeId,documentNumber:snapshotText(row.documentNumber,160,{optional:true}),supplierName:snapshotText(row.supplierName,512,{optional:true}),documentDate,status:row.status,amount:snapshotAmount(row.amount)});
 })};
 const finished=await snapshotTransactionState(tx);
 if(finished.transactionStartedAt!==entry.transactionStartedAt||finished.readAt<entry.readAt)snapshotFail('INVOICE_SNAPSHOT_TRANSACTION_CHANGED');
 const result={companyId,storeId,period,observation:{transactionStartedAt:entry.transactionStartedAt,readStartedAt:entry.readAt,readFinishedAt:finished.readAt,snapshotBasis:'HELD_REPEATABLE_READ_TRANSACTION',authorizationBasis:'ASSESSED_IN_HELD_TRANSACTION_SNAPSHOT'},coverage:{complete:complete&&pendingAvailable&&pending?.coverage.complete===true,sourceCounts,invoiceCount:invoices.items.length,pendingOriginalCount:pending?.counts.total??null,unavailable,limited,sourceLimit:MAX_SOURCE_ROWS},freezeEligibility:{eligible:reasons.length===0,reasons:[...new Set(reasons)]},invoices,pendingOriginals,candidateOnly:true,persisted:false};
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>4*1024*1024)snapshotFail('INVOICE_SNAPSHOT_PAYLOAD_LIMIT');
 return result;
}
