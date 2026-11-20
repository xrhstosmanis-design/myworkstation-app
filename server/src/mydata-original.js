import {ensureInvoiceCommonDraftSchema,lockInvoiceStore,attachInboundToExistingDraft} from "./lib/invoice-common-draft.js";
import {assertCustomerDemoOutboundAllowed} from "./customer-demo-runtime.js";
import crypto from "node:crypto";
import {invoiceDetailLines} from "./mydata-xml.js";
import {evaluateStandaloneDeliveryAttachment} from './lib/mydata-standalone-original-eligibility.js';
import {readStandaloneOriginalSnapshot} from './lib/mydata-standalone-original-metadata.js';
import {matchesVerifiedEpsilonOriginal} from './lib/mydata-original-provider-profiles.js';

const error=(message,status=409)=>Object.assign(new Error(message),{status});
// Host and format-code pairs confirmed against provider PDFs. Each host is exact.
const epsilonOriginalFormats = new Map([
  ["epsilondigital.epsilonnet.gr", "8"],
  ["epsilondigital3.epsilonnet.gr", "84"],
  ["epsilondigital14.epsilonnet.gr", "160"],
  ["epsilondigital22.epsilonnet.gr", "190"],
  ["epsilondigital-3rdpartd.epsilonnet.gr", "159"],
  ["epsilondigital-enetgroup.epsilonnet.gr", "107"],
  ["epsilondigital-nbg.epsilonnet.gr", "109"],
  ["epsilondigitalsmart10.epsilonnet.gr", "227"],
]);

function originalRecoveryLinkPattern(formats) {
  return "<(?:[[:alnum:]_]+:)?downloadingInvoiceUrl[^>]*>[[:space:]]*https://(?:"
    + formats.join("|") + ")/?[[:space:]]*</(?:[[:alnum:]_]+:)?downloadingInvoiceUrl>";
}

const epsilonRecoveryFormats = Array.from(epsilonOriginalFormats, ([host, code]) =>
  host.replaceAll(".", "[.]") + "/fd/[a-f0-9]{32}:" + code);

// PostgreSQL ARE syntax, with host and paths anchored inside the XML value.
export function providerOriginalRecoveryLinkPattern({includeExistingImpact = false} = {}) {
  return originalRecoveryLinkPattern([
    ...epsilonRecoveryFormats,
    ...(includeExistingImpact ? ["einvoice[.]impact[.]gr/p/EL[0-9]{9}/[a-f0-9]{40}/[a-f0-9]{32}"] : []),
    "einvoice[.]s1ecos[.]gr/p/EL[0-9]{9}/[a-f0-9]{40}/[a-f0-9]{32}",
    "e-invoicing[.]gr/edocuments/ViewInvoice/-1/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}_[a-z0-9]{7}",
    String.raw`vs[.]gr/iv/invoice/download/([a-z0-9]{4}_[0-9])/\1~k1~[a-f0-9]{40}~[a-z0-9_-]{43}`,
  ]);
}

export function originalDownloadUrl(xml,issuerVat){
  const raw=String(xml||"").match(/<(?:\w+:)?downloadingInvoiceUrl\b[^>]*>([\s\S]*?)<\/(?:\w+:)?downloadingInvoiceUrl>/i)?.[1];
  if(!raw)throw error("Ο πάροχος δεν έχει διαβιβάσει σύνδεσμο πρωτοτύπου.");
  const decoded=raw.trim().replace(/&amp;/g,"&").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n)));
  if(/[\u0000-\u0020\u007f]/.test(decoded))throw error("Μη έγκυρος σύνδεσμος πρωτοτύπου.");
  let url;try{url=new URL(decoded)}catch{throw error("Μη έγκυρος σύνδεσμος πρωτοτύπου.")}
  const validIssuer = /^\d{9}$/.test(issuerVat);
  const impact = validIssuer && ["einvoice.impact.gr","einvoice.s1ecos.gr"].includes(url.hostname)
    && new RegExp("^/p/EL" + issuerVat + "/[A-Fa-f0-9]{40}/[A-Fa-f0-9]{32}/?$").test(url.pathname);
  const epsilonFormat = url.pathname.match(/^\/fd\/[a-f0-9]{32}:(\d{1,3})\/?$/i)?.[1];
  const epsilon = validIssuer && (matchesVerifiedEpsilonOriginal(url,issuerVat)
    || (epsilonFormat !== undefined && epsilonOriginalFormats.get(url.hostname) === epsilonFormat));
  const einvoicing = validIssuer && url.hostname === "e-invoicing.gr"
    && /^\/edocuments\/ViewInvoice\/-1\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[A-Za-z0-9]{6,8}\/?$/i.test(url.pathname);
  const vs = validIssuer && url.hostname === "vs.gr"
    && /^\/iv\/invoice\/download\/([A-Za-z0-9]{4}_[0-9])\/\1~k1~[a-f0-9]{40}~[A-Za-z0-9_-]{43}\/?$/.test(url.pathname);
  const onesign = validIssuer && url.hostname === "onesign-api.onesys.gr"
    && /^\/invoice\/public\/download\/[0-9]{1,20}\/?$/.test(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !(impact || epsilon || einvoicing || vs || onesign)) {
    throw error("Ο σύνδεσμος απαιτεί διαφορετικό υποστηριζόμενο πάροχο ή δεν συμφωνεί με το ΑΦΜ εκδότη.");
  }
  url.pathname=url.pathname.replace(/\/$/,"")+(onesign?"":"/pdf");
  return url.href;
}
export async function readOriginalPdf(bytes){
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task=getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:true});
  try{
    const doc=await task.promise;
    if(doc.numPages>20)throw error("Το πρωτότυπο υπερβαίνει τις 20 σελίδες.");
    const pages=[];
    for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent();pages.push(content.items.map(i=>i.str||"").join("\n"))}
    return {text:pages.join("\n\n"),pageCount:doc.numPages};
  }finally{await task.destroy()}
}
export function verifyOriginalText(text,row){
  const tokens=String(text||"").match(/[0-9]+/g)||[];
  const mismatch=()=>{throw error("Το πρωτότυπο δεν επιβεβαιώνει MARK, ΑΦΜ και αριθμό παραστατικού. Απαιτείται έλεγχος.")};
  // MARK and VAT identifiers remain exact. Only the invoice number may be zero-padded.
  for(const value of [row.mark,row.issuerVat,row.counterpartVat])if(!value||!tokens.includes(String(value)))mismatch();
  const number=String(row.documentNumber??"");
  const withoutPadding=value=>value.replace(/^0+(?=\d)/,"");
  if(!number||!tokens.some(token=>token===number||(/^[0-9]+$/.test(number)&&withoutPadding(token)===withoutPadding(number))))mismatch();
}
export async function fetchOriginalPdf(row,fetcher=fetch,reader=readOriginalPdf){
  assertCustomerDemoOutboundAllowed(row);
  const signal=AbortSignal.timeout(45000);
  try{return await downloadOriginalPdf(row,fetcher,reader,signal)}catch(cause){
    if(cause?.name==="TimeoutError"||(signal.aborted&&signal.reason?.name==="TimeoutError"))throw error("Η λήψη του πρωτοτύπου δεν ολοκληρώθηκε εντός 45 δευτερολέπτων. Ο πάροχος δεν απάντησε εγκαίρως. Το παραστατικό παραμένει σε αναμονή· δοκιμάστε αργότερα.",504);
    throw cause;
  }
}
async function downloadOriginalPdf(row,fetcher,reader,signal){
  const url=originalDownloadUrl(row.rawPayload?.xml,row.issuerVat);
  const response=await fetcher(url,{redirect:"error",signal,headers:{Accept:"application/pdf"}});
  if(!response.ok||!/^application\/pdf\b/i.test(response.headers.get("content-type")||""))throw error("Ο πάροχος δεν επέστρεψε πρωτότυπο PDF.");
  const max=3400000;
  if(Number(response.headers.get("content-length"))>max)throw error("Το PDF υπερβαίνει τα 3,4 MB.");
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>max){await response.body.cancel?.().catch(()=>{});throw error("Το PDF υπερβαίνει τα 3,4 MB.")}chunks.push(Buffer.from(chunk))}
  const bytes=Buffer.concat(chunks);
  if(bytes.length<100||bytes.subarray(0,5).toString()!=="%PDF-")throw error("Το αρχείο δεν είναι PDF.");
  const {text,pageCount}=await reader(bytes);verifyOriginalText(text,row);
  return {bytes,text,pageCount,checksum:crypto.createHash("sha256").update(bytes).digest("hex"),filename:`mydata-${row.documentNumber}-${row.mark}.pdf`};
}

// Network work precedes the row lock; competing downloads can only attach once.
export async function acquireOriginal(prisma,companyId,storeId,inboxId,userId,createAiJob,download=fetchOriginalPdf,{reconcileExisting=false}={}){
  assertCustomerDemoOutboundAllowed({companyId,storeId});
  await ensureInvoiceCommonDraftSchema(prisma);
  const rows=await prisma.$queryRaw`SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId} LIMIT 1`;
  const row=rows[0];if(!row)throw error("Δεν βρέθηκε το παραστατικό.",404);
  if(createAiJob===true&&row.invoiceType==='9.3')return acquireStandaloneOriginal(prisma,row,{companyId,storeId,inboxId},download);
  if(row.attachmentId)return prisma.$transaction(tx=>attachReviewDraft(tx,row,companyId,storeId,inboxId,userId,createAiJob));
  if(row.status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
  const pdf=await download(row);
  return prisma.$transaction(async tx=>{
    await lockInvoiceStore(tx,companyId,storeId);
    const current=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
    if(!current[0])throw error("Δεν βρέθηκε το παραστατικό.",404);
    if(current[0].attachmentId)return attachReviewDraft(tx,{...row,attachmentId:current[0].attachmentId},companyId,storeId,inboxId,userId,createAiJob);
    if(current[0].status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
    const attachmentId=crypto.randomUUID(),jobId=createAiJob?crypto.randomUUID():null;
    await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${companyId},${storeId},'AI_READER_SOURCE',${pdf.filename},'application/pdf',${"DATABASE:"+pdf.checksum},${pdf.checksum},${"data:application/pdf;base64,"+pdf.bytes.toString("base64")})`;
    if(jobId)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({rawText:pdf.text,lines:[],pageCount:pdf.pageCount,source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true})}::jsonb,${userId})`;
    await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"note"=${"Πρωτότυπο παρόχου • MARK "+row.mark+" • "+Number(row.totalGross).toFixed(2)+" € • Έλεγχος από βοηθό πριν από την καταχώρηση"},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||${JSON.stringify({originalDownloaded:true,originalJobId:jobId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    const draft=reconcileExisting && !createAiJob
      ? await attachInboundToExistingDraft(tx,{companyId,storeId,inboxId},userId)
      : await attachReviewDraft(tx,{...row,attachmentId},companyId,storeId,inboxId,userId,createAiJob);
    return {...draft,downloaded:true,reused:false,jobId};
  });
}

// Ordinary UI only. The existing false/bulk and invoice paths above retain
// their draft/worker contract. No job, purchase or financial writer is called.
async function acquireStandaloneOriginal(prisma,source,scope,download){
  if(typeof source.rawPayload?.xml!=='string')throw error('Τα στοιχεία ταυτότητας του πρωτοτύπου χρειάζονται χειροκίνητο έλεγχο.');
  const pdf=source.attachmentId?null:await download(source);
  const identity=row=>JSON.stringify([['id','companyId','storeId','inboxId','mark','issuerVat','counterpartVat','series','documentNumber','invoiceType','currency','totalNet','totalVat','totalGross'].map(key=>row[key]==null?null:String(row[key])),row.issueDate?new Date(row.issueDate).toISOString():null,row.rawPayload?.xml??null]);
  return prisma.$transaction(async tx=>{
    await lockInvoiceStore(tx,scope.companyId,scope.storeId);
    const rows=await tx.$queryRaw`SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${scope.companyId} AND m."storeId"=${scope.storeId} AND m."inboxId"=${scope.inboxId} FOR UPDATE OF m,i`;
    const row=rows[0];
    if(rows.length!==1||identity(row)!==identity(source))throw error('Τα στοιχεία του παραστατικού άλλαξαν. Ανανεώστε τη θυρίδα πριν από νέα λήψη.');
    const snapshot=await readStandaloneOriginalSnapshot(tx,scope,row);
    const decision=evaluateStandaloneDeliveryAttachment(snapshot,scope);
    if(!decision.eligible)throw error('Το δελτίο αποστολής χρειάζεται έλεγχο ταυτότητας ή συνδέσεων. Δεν δημιουργήθηκε αγορά.');
    if(decision.replay)return {downloaded:false,reused:true,attachmentOnly:true};
    if(!pdf)throw error('Το πρωτότυπο δεν είναι πλέον διαθέσιμο. Ανανεώστε τη θυρίδα.');
    const attachmentId=crypto.randomUUID();
    await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${scope.companyId},${scope.storeId},'AI_READER_SOURCE',${pdf.filename},'application/pdf',${'DATABASE:'+pdf.checksum},${pdf.checksum},${'data:application/pdf;base64,'+pdf.bytes.toString('base64')})`;
    await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${scope.inboxId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||jsonb_build_object('originalDownloaded',true) WHERE "id"=${row.id} AND "inboxId"=${scope.inboxId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
    return {downloaded:true,reused:false,attachmentOnly:true};
  });
}


// The verified provider PDF can include zero-value carton supplies absent from XML.
export function pdfPackagingLines(rawText, xmlLines) {
  if (!xmlLines.length || xmlLines.some(line => !line.itemCode && line.netValue === 0)) return [];
  const normalizeCode = value => value.replace(/[\s\u00ad]/g, "").toUpperCase();
  const known = new Set(xmlLines.filter(line => line.itemCode).map(line => normalizeCode(line.itemCode)));
  const candidates = new Map();
  const rows = /(?:^|\n)[ \t]*(\d{5}\s*-\s*\d{1,3}(?:\s*-\s*\d{3})?)[ \t]*\n\s*(Χ\s*\/\s*Κ[\s\S]{1,230}?)\n[ \t]*(\d+(?:[,.]\d{2})?)[ \t]*\n\s*ΤΕΜΑΧΙΟ\s+0[,.]00\s+(?:ΤΕΜΑΧΙΟ\s+)?H87(?:\s+0[,.]00){9}\s+24\s+0(?=\s|$)/gu;
  for (const [, code, label, printedQuantity] of String(rawText || "").matchAll(rows)) {
    const itemCode = normalizeCode(code);
    const quantity = Number(printedQuantity.replace(",", "."));
    if (known.has(itemCode) || !Number.isSafeInteger(quantity) || quantity < 1) continue;
    if (candidates.has(itemCode)) {
      candidates.set(itemCode, null);
      continue;
    }
    candidates.set(itemCode, {
      itemCode, quantity, measurementUnit: 1, netValue: 0, vatAmount: 0, vatCategory: 1,
      description: label.replace(/^Χ\s*\/\s*Κ/u, "Χ/Κ").replace(/\s+/g, " ").trim(),
    });
  }
  return [...candidates.values()].filter(Boolean);
}

// Reuse the existing invoice-assistant draft contract, with explicit myDATA provenance.
// Only draft shells are created here. Printed rows are proposed and confirmed inside the assistant.
async function attachReviewDraft(tx,row,companyId,storeId,inboxId,userId,enabled){
  if(!enabled)return {reused:true,downloaded:false};
  await lockInvoiceStore(tx,companyId,storeId);
  const inbox=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
  if(!inbox[0]?.attachmentId)throw error("Δεν βρέθηκε το πρωτότυπο για το πρόχειρο.",404);
  const jobs=await tx.$queryRaw`SELECT "id","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "attachmentId"=${inbox[0].attachmentId} AND "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt","id" LIMIT 1 FOR UPDATE`;
  const job=jobs[0];
  const common=await attachInboundToExistingDraft(tx,{companyId,storeId,inboxId},userId);
  if(common){
    if(common.ok && job?.id && ["RECEIVED","IN_REVIEW"].includes(inbox[0].status)
      && /^(?:1\.[1-6]|2\.[1-4])$/.test(String(row.invoiceType||"")) && (!row.currency||row.currency==="EUR") && Number(row.totalGross)>0){
      const drafts=await tx.$queryRaw`SELECT o."id",o."supplierId" FROM "PurchaseOrder" o
        JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
        WHERE o."id"=${common.purchaseOrderId} AND d."id"=${common.documentId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}
          AND o."status"='NEW' AND d."status"='DRAFT' AND d."documentType"='INVOICE'
          AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id")
          AND NOT EXISTS (SELECT 1 FROM "PurchaseDocumentLine" l WHERE l."purchaseDocumentId"=d."id") FOR UPDATE OF o,d`;
      const draft=drafts[0];
      if(draft && await prefillReviewDraft(tx,row,job,companyId,storeId,draft.id,draft.supplierId)){
        await tx.$executeRaw`UPDATE "DocumentInbox" SET "status"='IN_REVIEW',"note"=${"myDATA • MARK "+row.mark+" • Κοινό πρόχειρο POS/myDATA — Έλεγχος γραμμών"},"updatedAt"=NOW() WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
      }
    }
    return common;
  }
  if(job?.purchaseDocumentId||row.rawPayload?.mydataDraftOrderId){
    const orders=await tx.$queryRaw`SELECT o."id",o."status",o."supplierId" FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId" WHERE d."id"=${job?.purchaseDocumentId||row.rawPayload.mydataDraftDocumentId} AND o."companyId"=${companyId} AND o."storeId"=${storeId} LIMIT 1 FOR UPDATE OF o`;
    if(!orders[0])throw error("Το συνδεδεμένο πρόχειρο έχει διαγραφεί. Δεν δημιουργείται δεύτερο.");
    if(orders[0].status!=="NEW")throw error("Το παραστατικό έχει ήδη προχωρήσει. Ελέγξτε την υπάρχουσα αγορά.");
    if(row.rawPayload?.mydataDraftOrderId===orders[0].id && inbox[0].status==="IN_REVIEW"){
      const existingLines=await tx.$queryRaw`SELECT 1 FROM "PurchaseOrderLine" WHERE "orderId"=${orders[0].id} LIMIT 1`;
      if(!existingLines.length){
        const filled=await prefillReviewDraft(tx,row,job,companyId,storeId,orders[0].id,orders[0].supplierId);
        await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||jsonb_build_object('automaticPrefillChecked',true,'packagingPrefillChecked',true) WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "inboxId"=${inboxId}`;
        if(!filled)await tx.$executeRaw`UPDATE "DocumentInbox" SET "note"=${"myDATA • MARK "+row.mark+" • Χρειάζεται έλεγχος γραμμών XML, συσκευασίας ή συνόλων."},"updatedAt"=NOW() WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
      }
    }
    return {reused:true,downloaded:false,jobId:job?.id,purchaseOrderId:orders[0].id};
  }
  if(!["RECEIVED","IN_REVIEW"].includes(inbox[0].status))throw error("Το παραστατικό έχει ήδη ελεγχθεί.");
  if(!/^(?:1\.[1-6]|2\.[1-4]|5\.[12])$/.test(String(row.invoiceType||""))||(row.currency&&row.currency!=="EUR")||!(Number(row.totalGross)>0)||!row.issueDate)throw error("Ο τύπος, η ημερομηνία ή το νόμισμα απαιτούν χειροκίνητο έλεγχο πριν δημιουργηθεί αγορά.");
  const suppliers=await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND regexp_replace(COALESCE("taxId",''),'[^0-9]','','g')=${row.issuerVat} LIMIT 2`;
  const supplierId=suppliers.length===1?suppliers[0].id:null;
  const number=[row.series,row.documentNumber].filter(Boolean).join(" ");
  const duplicate=await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "supplierId" IS NOT DISTINCT FROM ${supplierId} AND UPPER(regexp_replace("documentNumber",'\\s','','g'))=UPPER(regexp_replace(${number},'\\s','','g')) AND "status" IN ('DRAFT','APPROVED') LIMIT 1`;
  if(duplicate.length)throw error("Υπάρχει ήδη αγορά με τον ίδιο προμηθευτή και αριθμό. Ελέγξτε την υπάρχουσα εγγραφή.");
  const documentId=crypto.randomUUID(),orderId=crypto.randomUUID(),jobId=job?.id||crypto.randomUUID();
  if(!job)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${inbox[0].attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true})}::jsonb,${userId})`;
  await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","purchaseOrderId") VALUES (${documentId},${companyId},${storeId},${supplierId},${String(row.invoiceType).startsWith("5.")?"CREDIT_NOTE":"INVOICE"},${number},${new Date(row.issueDate)},0,0,${Number(row.totalGross)},'POS_OCR_DRAFT','DRAFT',${userId},${orderId})`;
  await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${companyId},${storeId},${supplierId},'NEW',${number},${"myDATA • MARK "+row.mark+" — Ανάγνωση από βοηθό — ΠΡΟΣ ΕΛΕΓΧΟ"},${userId},'Λήψη myDATA','Λήψη myDATA','POS_OCR_DRAFT',${documentId})`;
  await prefillReviewDraft(tx,row,job,companyId,storeId,orderId,supplierId);
  await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${documentId},"stage"='MYDATA_DRAFT_READY',"status"='AWAITING_APPROVAL',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true,mydataDraftOrderId:orderId})}::jsonb,"updatedAt"=NOW() WHERE "id"=${jobId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "DocumentInbox" SET "status"='IN_REVIEW',"note"=${"myDATA • MARK "+row.mark+" • Πρόχειρο στις Παραγγελίες & Αγορές — Ανάγνωση από βοηθό"},"updatedAt"=NOW() WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({mydataDraftOrderId:orderId,mydataDraftDocumentId:documentId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  return {reused:true,downloaded:false,jobId,purchaseOrderId:orderId};
}

async function prefillReviewDraft(tx,row,job,companyId,storeId,orderId,supplierId){
  const xmlLines = invoiceDetailLines(row.rawPayload?.xml);
  const lines = [...xmlLines, ...pdfPackagingLines(job?.resultJson?.rawText, xmlLines)];
  const vatRates = new Map([[1,24],[2,13],[3,6],[4,17],[5,9],[6,4],[7,0]]);
  const isCarton = line => line.measurementUnit === 7
    && /^(κιβώτιο|κιβωτια|κιβώτια|κυτίο|κυτιο|κυτία|κυτια|κιβ\.?|κβ\.?|carton)$/iu.test(line.measurementUnitTitle || "");
  const supplierCodes = [...new Set(lines.map(line => line.itemCode).filter(Boolean))];
  const mappings = supplierId && supplierCodes.length ? await tx.$queryRaw`
    SELECT m."supplierItemCode",m."unitsPerPackage",sp."productId"
    FROM "SupplierProductMapping" m
    LEFT JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=m."companyId" AND p."active"
    LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"
    WHERE m."companyId"=${companyId} AND m."supplierId"=${supplierId}
      AND m."supplierItemCode"=ANY(${supplierCodes}::text[]) AND m."confirmedAt" IS NOT NULL` : [];
  const byCode = new Map(mappings.map(mapping => [mapping.supplierItemCode, mapping]));
  const unitsFor = line => line.measurementUnit === 1 ? 1
    : isCarton(line) ? Number(byCode.get(line.itemCode)?.unitsPerPackage || 0)
    : line.measurementUnit === 7 ? 0 : undefined;
  const prepared = lines.length > 0 && lines.every(line => line.description && line.description.length <= 250
    && Number.isInteger(unitsFor(line)) && unitsFor(line) >= 0 && unitsFor(line) <= 100000 && line.quantity > 0 && line.netValue !== null
    && line.netValue >= 0 && line.vatAmount !== null && line.vatAmount >= 0
    && vatRates.has(line.vatCategory)
    && (line.vatCategory !== 7 || line.vatAmount === 0));
  const cents = amount => Math.round(Number(amount) * 100);
  const sumsMatch = ["netValue", "vatAmount"].every((key, index) =>
    lines.reduce((sum, line) => sum + cents(line[key]), 0) === cents(index ? row.totalVat : row.totalNet));
  if (prepared && sumsMatch && cents(row.totalNet) + cents(row.totalVat) === cents(row.totalGross)) {
    for (const line of lines) {
      const unitCost = line.netValue / line.quantity;
      await tx.$executeRaw`INSERT INTO "PurchaseOrderLine"
        ("id","orderId","productId","supplierCode","description","quantity","unitCost","initialUnitCost",
         "invoiceUnit","stockUnitsPerInvoiceUnit","vatRate","netAmount","vatAmount","grossAmount")
        VALUES (${crypto.randomUUID()},${orderId},${byCode.get(line.itemCode)?.productId ?? null},${line.itemCode},${line.description},${line.quantity},
          ${unitCost},${unitCost},${line.measurementUnit === 7 ? 'PACKAGE' : 'PIECE'},${unitsFor(line)},${vatRates.get(line.vatCategory)},${line.netValue},${line.vatAmount},
          ${(cents(line.netValue) + cents(line.vatAmount)) / 100})`;
    }
    return true;
  }
  return false;
}
