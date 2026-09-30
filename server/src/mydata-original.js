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
  for(const value of [row.mark,row.issuerVat,row.counterpartVat,row.documentNumber])if(!value||!tokens.includes(String(value)))throw error("Το πρωτότυπο δεν επιβεβαιώνει MARK, ΑΦΜ και αριθμό παραστατικού. Απαιτείται έλεγχος.");
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
  if(row.attachmentId)return {reused:true,downloaded:false};
  if(row.status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
  const pdf=await download(row);
  return prisma.$transaction(async tx=>{
    const current=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
    if(!current[0])throw error("Δεν βρέθηκε το παραστατικό.",404);
    if(current[0].attachmentId)return {reused:true,downloaded:false};
    if(current[0].status!=="RECEIVED")throw error("Το παραστατικό έχει ήδη μεταφερθεί για έλεγχο.");
    const attachmentId=crypto.randomUUID(),jobId=createAiJob?crypto.randomUUID():null;
    await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${companyId},${storeId},'AI_READER_SOURCE',${pdf.filename},'application/pdf',${"DATABASE:"+pdf.checksum},${pdf.checksum},${"data:application/pdf;base64,"+pdf.bytes.toString("base64")})`;
    if(jobId)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({rawText:pdf.text,lines:[],pageCount:pdf.pageCount,source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true})}::jsonb,${userId})`;
    await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"note"=${"Πρωτότυπο παρόχου • MARK "+row.mark+" • "+Number(row.totalGross).toFixed(2)+" € • Έλεγχος από βοηθό πριν από την καταχώρηση"},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||${JSON.stringify({originalDownloaded:true,originalJobId:jobId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    return {downloaded:true,reused:false,jobId};
  });
}
