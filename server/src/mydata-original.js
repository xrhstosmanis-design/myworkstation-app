import crypto from "node:crypto";

const error=(message,status=409)=>Object.assign(new Error(message),{status});
export function originalDownloadUrl(xml,issuerVat){
  const raw=String(xml||"").match(/<(?:\w+:)?downloadingInvoiceUrl\b[^>]*>([\s\S]*?)<\/(?:\w+:)?downloadingInvoiceUrl>/i)?.[1];
  if(!raw)throw error("Ο πάροχος δεν έχει διαβιβάσει σύνδεσμο πρωτοτύπου.");
  const decoded=raw.trim().replace(/&amp;/g,"&").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n)));
  let url;try{url=new URL(decoded)}catch{throw error("Μη έγκυρος σύνδεσμος πρωτοτύπου.")}
  // First verified provider adapter. Never fetch arbitrary hosts or redirects.
  if(url.protocol!=="https:"||url.hostname!=="einvoice.impact.gr"||url.username||url.password||url.port||url.search||url.hash||!/^\d{9}$/.test(issuerVat)||!new RegExp("^/p/EL"+issuerVat+"/[A-Fa-f0-9]{40}/[A-Fa-f0-9]{32}/?$").test(url.pathname))throw error("Ο σύνδεσμος απαιτεί διαφορετικό υποστηριζόμενο πάροχο ή δεν συμφωνεί με το ΑΦΜ εκδότη.");
  url.pathname=url.pathname.replace(/\/$/,"")+"/pdf";
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
  const url=originalDownloadUrl(row.rawPayload?.xml,row.issuerVat),signal=AbortSignal.timeout(15000);
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
export async function acquireOriginal(prisma,companyId,storeId,inboxId,userId,createAiJob,download=fetchOriginalPdf){
  const rows=await prisma.$queryRaw`SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId} LIMIT 1`;
  const row=rows[0];if(!row)throw error("Δεν βρέθηκε το παραστατικό.",404);
  if(row.attachmentId)return prisma.$transaction(tx=>attachReviewDraft(tx,row,companyId,storeId,inboxId,userId,createAiJob));
  if(row.status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
  const pdf=await download(row);
  return prisma.$transaction(async tx=>{
    const current=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
    if(!current[0])throw error("Δεν βρέθηκε το παραστατικό.",404);
    if(current[0].attachmentId)return attachReviewDraft(tx,{...row,attachmentId:current[0].attachmentId},companyId,storeId,inboxId,userId,createAiJob);
    if(current[0].status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
    const attachmentId=crypto.randomUUID(),jobId=createAiJob?crypto.randomUUID():null;
    await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${companyId},${storeId},'AI_READER_SOURCE',${pdf.filename},'application/pdf',${"DATABASE:"+pdf.checksum},${pdf.checksum},${"data:application/pdf;base64,"+pdf.bytes.toString("base64")})`;
    if(jobId)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({rawText:pdf.text,lines:[],pageCount:pdf.pageCount,source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true})}::jsonb,${userId})`;
    await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"note"=${"Πρωτότυπο παρόχου • MARK "+row.mark+" • "+Number(row.totalGross).toFixed(2)+" € • Έλεγχος από βοηθό πριν από την καταχώρηση"},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||${JSON.stringify({originalDownloaded:true,originalJobId:jobId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    const draft=await attachReviewDraft(tx,{...row,attachmentId},companyId,storeId,inboxId,userId,createAiJob);
    return {...draft,downloaded:true,reused:false,jobId};
  });
}


// Reuse the existing invoice-assistant draft contract, with explicit myDATA provenance.
// Only draft shells are created here. Printed rows are proposed and confirmed inside the assistant.
async function attachReviewDraft(tx,row,companyId,storeId,inboxId,userId,enabled){
  if(!enabled)return {reused:true,downloaded:false};
  const inbox=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
  if(!inbox[0]?.attachmentId)throw error("Δεν βρέθηκε το πρωτότυπο για το πρόχειρο.",404);
  const jobs=await tx.$queryRaw`SELECT "id","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "attachmentId"=${inbox[0].attachmentId} AND "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt","id" LIMIT 1 FOR UPDATE`;
  const job=jobs[0];
  if(job?.purchaseDocumentId||row.rawPayload?.mydataDraftOrderId){
    const orders=await tx.$queryRaw`SELECT o."id",o."status" FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId" WHERE d."id"=${job?.purchaseDocumentId||row.rawPayload.mydataDraftDocumentId} AND o."companyId"=${companyId} AND o."storeId"=${storeId} LIMIT 1`;
    if(!orders[0])throw error("Το συνδεδεμένο πρόχειρο έχει διαγραφεί. Δεν δημιουργείται δεύτερο.");
    if(orders[0].status!=="NEW")throw error("Το παραστατικό έχει ήδη προχωρήσει. Ελέγξτε την υπάρχουσα αγορά.");
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
  await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${documentId},"stage"='MYDATA_DRAFT_READY',"status"='AWAITING_APPROVAL',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true,mydataDraftOrderId:orderId})}::jsonb,"updatedAt"=NOW() WHERE "id"=${jobId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "DocumentInbox" SET "status"='IN_REVIEW',"note"=${"myDATA • MARK "+row.mark+" • Πρόχειρο στις Παραγγελίες & Αγορές — Ανάγνωση από βοηθό"},"updatedAt"=NOW() WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({mydataDraftOrderId:orderId,mydataDraftDocumentId:documentId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  return {reused:true,downloaded:false,jobId,purchaseOrderId:orderId};
}
