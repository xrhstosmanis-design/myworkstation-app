import {ensureInvoiceCommonDraftSchema,lockInvoiceStore,attachInboundToExistingDraft} from "./lib/invoice-common-draft.js";
import {assertCustomerDemoOutboundAllowed} from "./customer-demo-runtime.js";
import crypto from "node:crypto";
import {invoiceDetailLines} from "./mydata-xml.js";
import {evaluateStandaloneDeliveryAttachment} from './lib/mydata-standalone-original-eligibility.js';
import {readStandaloneOriginalSnapshot} from './lib/mydata-standalone-original-metadata.js';
import {matchesVerifiedEpsilonOriginal} from './lib/mydata-original-provider-profiles.js';
import {readOriginalIdentityHeader} from './lib/mydata-original-identity-ocr.js';

import {ALFA19_PROFILE,printedEconomicsProfileForUrl,parseMyDataPrintedLineEconomics} from './lib/mydata-printed-line-economics.js';
import {myDataPrintedEconomicsRowsFingerprint} from './lib/mydata-printed-economics-review.js';
const textHash=value=>crypto.createHash('sha256').update(value).digest('hex');
function providerOriginalTextProof(row,pdf){
  if(typeof pdf.text!=='string'||pdf.text.length>200000||!Buffer.isBuffer(pdf.bytes)||pdf.bytes.length<100||pdf.bytes.length>3400000
    ||!Number.isInteger(pdf.pageCount)||pdf.pageCount<1||pdf.pageCount>20||textHash(pdf.bytes)!==pdf.checksum)return null;
  let profile;try{profile=printedEconomicsProfileForUrl(originalDownloadUrl(row.rawPayload?.xml,row.issuerVat))}catch{return null}
  return profile?{version:'SERVER_PROVIDER_PDF_V1',pdfChecksum:pdf.checksum,rawTextSHA256:textHash(pdf.text),pageCount:pdf.pageCount,profile}:null;
}
// Check each exact projected decimal against the actual SQL numeric capacity.
// A low-scale legacy column must never silently round a VERIFIED discount.
function decimalFitsColumn(value,column){
  if(!column||column.data_type!=='numeric')return false;
  if(column.numeric_precision==null&&column.numeric_scale==null)return true;
  const match=String(value).match(/^(\d+)(?:\.(\d+))?$/);
  if(!match||!Number.isInteger(column.numeric_precision)||!Number.isInteger(column.numeric_scale)||column.numeric_scale<0)return false;
  return match[1].replace(/^0+/,'').length<=column.numeric_precision-column.numeric_scale
    &&(match[2]||'').replace(/0+$/,'').length<=column.numeric_scale;
}
const error=(message,status=409)=>Object.assign(new Error(message),{status});
// Host and format-code pairs confirmed against provider PDFs. Each host is exact.
const epsilonOriginalFormats = new Map([
  ["epsilondigital.epsilonnet.gr", "8"],
  ["epsilondigital3.epsilonnet.gr", "84"],
  ["epsilondigital14.epsilonnet.gr", "160"],
  ["epsilondigital22.epsilonnet.gr", "190"],
  ["epsilondigital-enetgroup.epsilonnet.gr", "107"],
  ["epsilondigital-nbg.epsilonnet.gr", "109"],
  ["epsilondigitalsmart10.epsilonnet.gr", "227"],
  ["epsilondigitalsmart9.epsilonnet.gr", "217"],
  ["epsilondigital2.epsilonnet.gr", "72"],
  ["epsilondigital18.epsilonnet.gr", "172"],
  ["epsilondigital-3rdpartd.epsilonnet.gr", "159"],
  ["epsilondigital24.epsilonnet.gr", "209"],
]);

function originalRecoveryLinkPattern(formats) {
  return "<(?:[[:alnum:]_]+:)?downloadingInvoiceUrl[^>]*>[[:space:]]*https://(?:"
    + formats.join("|") + ")/?[[:space:]]*</(?:[[:alnum:]_]+:)?downloadingInvoiceUrl>";
}

const epsilonRecoveryFormats = Array.from(epsilonOriginalFormats, ([host, code]) =>
  host.replaceAll(".", "[.]") + "/fd/[a-f0-9]{32}:" + code);

const megasoftOriginalLink = "invoicelink[.]megasoft[.]gr/invoiceinspect/qr[?]QrCode=[A-Za-z0-9]{100}(?:/pdf)?";
const megasoftOriginalUrl = new RegExp("^https://" + megasoftOriginalLink + "$");

// PostgreSQL ARE syntax, with host and paths anchored inside the XML value.
export const panormouOriginalStoreId = "cmwqvuxrx001is8g4uqlyzwg2";

export function providerOriginalRecoveryLinkPattern({includeExistingImpact = false, storeId} = {}) {
  return originalRecoveryLinkPattern([
    ...epsilonRecoveryFormats,
    ...(includeExistingImpact ? ["einvoice[.]impact[.]gr/p/EL[0-9]{9}/[a-f0-9]{40}/[a-f0-9]{32}"] : []),
    "einvoice[.]s1ecos[.]gr/p/EL[0-9]{9}/[a-f0-9]{40}/[a-f0-9]{32}",
    ...(storeId === panormouOriginalStoreId ? ["mydata[.]primer[.]gr/[a-f0-9]{40}"] : []),
    "e-invoicing[.]gr/edocuments/ViewInvoice/-1/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}_[a-z0-9]{7}",
    String.raw`vs[.]gr/iv/invoice/download/([a-z0-9]{4}_[0-9])/\1~k1~[a-f0-9]{40}~[a-z0-9_-]{43}`,
  ]);
}

// Viewer links identify the source of an XML draft. They are never fetched here.
export function myDataXmlDraftProvider(xml, issuerVat){
  const raw=String(xml||"").match(/<(?:\w+:)?downloadingInvoiceUrl\b[^>]*>([^<]+)<\/(?:\w+:)?downloadingInvoiceUrl>/i)?.[1]?.trim();
  if(!raw||raw.length>2048||!/^\d{9}$/.test(issuerVat))return null;
  const link=raw.replace(/&amp;|&#38;|&#x26;/gi,"&");
  if(!link.startsWith("https://")||/[\s\\]/.test(link))return null;
  let url;try{url=new URL(link)}catch{return null}
  if(url.username||url.password||url.port||url.hash)return null;
  if(["beta-srv.parochos.gr","srv.parochos.gr"].includes(url.hostname)&&!url.search
      && /^\/FileDocument\/Get\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(url.pathname))return "PAROCHOS";
  if(url.hostname==="srv2.parochos.gr"&&!url.search&&/^\/fd\/[a-f0-9]{32}:[0-9]$/i.test(url.pathname))return "PAROCHOS";
  const params=url.searchParams;
  if(url.hostname==="invosign.gr"&&url.pathname==="/viewinvoice.php"&&[...params].length===3
      && params.get("afm")==="EL"+issuerVat&&params.get("file")&&params.get("gvsenc"))return "INVOSIGN";
  return null;
}

export async function prepareMyDataXmlReviewDraft(tx,row,userId,provider){
  return attachReviewDraft(tx,row,row.companyId,row.storeId,row.inboxId,userId,true,{xmlProvider:provider});
}

export function originalDownloadUrl(xml,issuerVat,storeId){
  const raw=String(xml||"").match(/<(?:\w+:)?downloadingInvoiceUrl\b[^>]*>([\s\S]*?)<\/(?:\w+:)?downloadingInvoiceUrl>/i)?.[1];
  if(!raw)throw error("Ο πάροχος δεν έχει διαβιβάσει σύνδεσμο πρωτοτύπου.");
  const decoded=raw.trim().replace(/&amp;/g,"&").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n)));
  if(/[\u0000-\u0020\u007f]/.test(decoded))throw error("Μη έγκυρος σύνδεσμος πρωτοτύπου.");
  let url;try{url=new URL(decoded)}catch{throw error("Μη έγκυρος σύνδεσμος πρωτοτύπου.")}
  const validIssuer = /^\d{9}$/.test(issuerVat);
  if (validIssuer && storeId === panormouOriginalStoreId && megasoftOriginalUrl.test(decoded)) {
    return decoded.endsWith("/pdf") ? decoded : decoded + "/pdf";
  }
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
  const primer = validIssuer && storeId === panormouOriginalStoreId && url.hostname === "mydata.primer.gr"
    && /^\/[a-f0-9]{40}\/?$/i.test(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !(impact || epsilon || einvoicing || vs || onesign || primer)) {
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
export async function fetchOriginalPdf(row,fetcher=fetch,reader=readOriginalPdf,identityReader=readOriginalIdentityHeader){
  assertCustomerDemoOutboundAllowed(row);
  const signal=AbortSignal.timeout(45000);
  try{return await downloadOriginalPdf(row,fetcher,reader,signal,identityReader)}catch(cause){
    if(cause?.name==="TimeoutError"||(signal.aborted&&signal.reason?.name==="TimeoutError"))throw error("Η λήψη του πρωτοτύπου δεν ολοκληρώθηκε εντός 45 δευτερολέπτων. Ο πάροχος δεν απάντησε εγκαίρως. Το παραστατικό παραμένει σε αναμονή· δοκιμάστε αργότερα.",504);
    throw cause;
  }
}
async function downloadOriginalPdf(row,fetcher,reader,signal,identityReader){
  const url=originalDownloadUrl(row.rawPayload?.xml,row.issuerVat,row.storeId);
  const sourceUrl = new URL(url);
  const primer = sourceUrl.hostname === "mydata.primer.gr";
  const options = {redirect:"error",signal,headers:{Accept:"application/pdf"}};
  let response = await fetcher(url, primer ? {...options,redirect:"manual"} : options);
  if (primer && response.status === 301) {
    const expected = `https://mydata-backend.primer.gr/invoice${sourceUrl.pathname}`;
    await response.body?.cancel();
    if (response.headers.get("location") !== expected) {
      throw error("Η Primer επέστρεψε μη αναμενόμενη ανακατεύθυνση για το PDF.");
    }
    response = await fetcher(expected, options);
  }
  if(!response.ok||!/^application\/pdf\b/i.test(response.headers.get("content-type")||""))throw error("Ο πάροχος δεν επέστρεψε πρωτότυπο PDF.");
  const max=3400000;
  if(Number(response.headers.get("content-length"))>max)throw error("Το PDF υπερβαίνει τα 3,4 MB.");
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>max){await response.body.cancel?.().catch(()=>{});throw error("Το PDF υπερβαίνει τα 3,4 MB.")}chunks.push(Buffer.from(chunk))}
  const bytes=Buffer.concat(chunks);
  if(bytes.length<100||bytes.subarray(0,5).toString()!=="%PDF-")throw error("Το αρχείο δεν είναι PDF.");
  let {text,pageCount}=await reader(bytes);
  signal.throwIfAborted();
  const checksum=crypto.createHash("sha256").update(bytes).digest("hex");
  try{verifyOriginalText(text,row)}catch(cause){
    if(!canReadIdentityHeader(url,text,pageCount,row))throw cause;
    // Expected identity fields never enter OCR generation. Only the same PDF
    // bytes and cancellation signal cross the isolated local reader boundary.
    const header=await identityReader(bytes,{signal});
    signal.throwIfAborted();
    if(header?.checksum!==checksum||header?.pageCount!==1||header?.region!=="FIRST_PAGE_TOP_45_PERCENT"
      ||!Number.isFinite(header?.confidence)||(header.confidence<50||header.confidence>100)
      ||typeof header.text!=="string"||!header.text.trim()||header.text.length>20000)throw cause;
    text=String(text)+"\n"+header.text;
    verifyOriginalText(text,row);
  }
  return {bytes,text,pageCount,checksum,filename:`mydata-${row.documentNumber}-${row.mark}.pdf`};
}

function canReadIdentityHeader(downloadUrl,text,pageCount,row){
  if(pageCount!==1||!/^\d{9}$/.test(String(row.issuerVat??"")))return false;
  const url=new URL(downloadUrl);
  const profiles=new Map([
    ["epsilondigital-3rdparte.epsilonnet.gr","169"],
    ["epsilondigital-cosmote.epsilonnet.gr","22"],
    ["epsilondigital-telekom.epsilonnet.gr","22"],
  ]);
  const format=url.pathname.match(/^\/fd\/[a-f0-9]{32}:(\d{1,3})\/pdf$/i)?.[1];
  if(!format||profiles.get(url.hostname)!==format)return false;
  const tokens=String(text||"").match(/[0-9]+/g)||[];
  if(tokens.includes(String(row.issuerVat)))return false;
  for(const value of [row.mark,row.counterpartVat])if(!value||!tokens.includes(String(value)))return false;
  const number=String(row.documentNumber??"");
  const unpad=value=>value.replace(/^0+(?=\d)/,"");
  return !!number&&tokens.some(token=>token===number||(/^[0-9]+$/.test(number)&&unpad(token)===unpad(number)));
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
    if(jobId)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({rawText:pdf.text,lines:[],pageCount:pdf.pageCount,source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true,providerOriginalTextProof:providerOriginalTextProof(row,pdf)})}::jsonb,${userId})`;
    await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"note"=${"Πρωτότυπο παρόχου • MARK "+row.mark+" • "+Number(row.totalGross).toFixed(2)+" € • Έλεγχος από βοηθό πριν από την καταχώρηση"},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||${JSON.stringify({originalDownloaded:true,originalJobId:jobId})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
    const draft=reconcileExisting && !createAiJob
      ? await attachInboundToExistingDraft(tx,{companyId,storeId,inboxId},userId)
      : await attachReviewDraft(tx,{...row,attachmentId},companyId,storeId,inboxId,userId,createAiJob);
    return {...draft,downloaded:true,reused:false,jobId};
  });
}

const providerOriginalIdentity=row=>JSON.stringify([
  ['id','companyId','storeId','inboxId','mark','issuerVat','counterpartVat','series','documentNumber','invoiceType','currency','totalNet','totalVat','totalGross']
    .map(key=>row[key]==null?null:String(row[key])),
  row.issueDate?new Date(row.issueDate).toISOString():null,row.rawPayload?.xml??null
]);

function lookupProviderInbox(db,{companyId,storeId,inboxId},{lock=false}={}){
  return lock?db.$queryRaw`
    SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i
      ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId}
    LIMIT 2 FOR UPDATE OF m,i`
  :db.$queryRaw`
    SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i
      ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId}
    LIMIT 2`;
}

async function storeProviderInboxAttachment(tx,scope,row,pdf){
  const {companyId,storeId,inboxId}=scope,attachmentId=crypto.randomUUID();
  await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${companyId},${storeId},'AI_READER_SOURCE',${pdf.filename},'application/pdf',${'DATABASE:'+pdf.checksum},${pdf.checksum},${'data:application/pdf;base64,'+pdf.bytes.toString('base64')})`;
  await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=${attachmentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=("rawPayload"-'originalPending'-'originalError')||jsonb_build_object('originalDownloaded',true) WHERE "id"=${row.id} AND "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  return attachmentId;
}

export async function fetchStaffMyDataInboxOriginal(db,scope,verify,download=fetchOriginalPdf){
  assertCustomerDemoOutboundAllowed(scope);
  const {companyId,storeId,inboxId,actorId}=scope;
  await verify(db);
  const sources=await lookupProviderInbox(db,scope);
  if(sources.length!==1)throw error("Δεν βρέθηκε το παραστατικό στο επιλεγμένο κατάστημα.",404);
  const source=sources[0];
  if(typeof source.rawPayload?.xml!=="string"||(!source.attachmentId&&source.status!=="RECEIVED"))
    throw error("Το παραστατικό χρειάζεται έλεγχο πριν από τη λήψη πρωτοτύπου.");
  const pdf=source.attachmentId?null:await download(source);
  return db.$transaction(async tx=>{
    await verify(tx);
    await lockInvoiceStore(tx,companyId,storeId);
    const current=await lookupProviderInbox(tx,scope,{lock:true}),row=current[0];
    if(current.length!==1||providerOriginalIdentity(row)!==providerOriginalIdentity(source))
      throw error("Τα στοιχεία του παραστατικού άλλαξαν. Ανανεώστε τη θυρίδα πριν από νέα λήψη.");
    if(row.invoiceType==="9.3"){
      const snapshot=await readStandaloneOriginalSnapshot(tx,scope,row);
      if(!evaluateStandaloneDeliveryAttachment(snapshot,scope).eligible)
        throw error("Το δελτίο αποστολής χρειάζεται έλεγχο ταυτότητας ή συνδέσεων.");
    }
    if(row.attachmentId){
      const [stored]=await tx.$queryRaw`
        SELECT "id" FROM "DocumentAttachment" WHERE "id"=${row.attachmentId} AND "companyId"=${companyId}
          AND "storeId"=${storeId} AND "contentData" IS NOT NULL LIMIT 1`;
      if(!stored)throw error("Το συνημμένο πρωτότυπο δεν είναι πλέον διαθέσιμο.");
      return {id:inboxId,downloaded:false,reused:true,attachmentOnly:true};
    }
    if(row.status!=="RECEIVED"||!pdf)throw error("Η θυρίδα άλλαξε. Ανανέωσε πριν από νέα λήψη.");
    const attachmentId=await storeProviderInboxAttachment(tx,scope,row,pdf);
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${actorId},'MYDATA_PROVIDER_ORIGINAL_ATTACHED',
        ${JSON.stringify({inboxId,attachmentId,mark:row.mark})}::jsonb)`;
    return {id:inboxId,downloaded:true,reused:false,attachmentOnly:true};
  },{timeout:30000});
}

// Ordinary UI only. The existing false/bulk and invoice paths above retain
// their draft/worker contract. No job, purchase or financial writer is called.
async function acquireStandaloneOriginal(prisma,source,scope,download){
  if(typeof source.rawPayload?.xml!=='string')throw error('Τα στοιχεία ταυτότητας του πρωτοτύπου χρειάζονται χειροκίνητο έλεγχο.');
  const pdf=source.attachmentId?null:await download(source);
  return prisma.$transaction(async tx=>{
    await lockInvoiceStore(tx,scope.companyId,scope.storeId);
    const rows=await tx.$queryRaw`SELECT m.*,i."attachmentId",i."status" FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId" WHERE m."companyId"=${scope.companyId} AND m."storeId"=${scope.storeId} AND m."inboxId"=${scope.inboxId} FOR UPDATE OF m,i`;
    const row=rows[0];
    if(rows.length!==1||providerOriginalIdentity(row)!==providerOriginalIdentity(source))throw error('Τα στοιχεία του παραστατικού άλλαξαν. Ανανεώστε τη θυρίδα πριν από νέα λήψη.');
    const snapshot=await readStandaloneOriginalSnapshot(tx,scope,row);
    const decision=evaluateStandaloneDeliveryAttachment(snapshot,scope);
    if(!decision.eligible)throw error('Το δελτίο αποστολής χρειάζεται έλεγχο ταυτότητας ή συνδέσεων. Δεν δημιουργήθηκε αγορά.');
    if(decision.replay)return {downloaded:false,reused:true,attachmentOnly:true};
    if(!pdf)throw error('Το πρωτότυπο δεν είναι πλέον διαθέσιμο. Ανανεώστε τη θυρίδα.');
    await storeProviderInboxAttachment(tx,scope,row,pdf);
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
async function attachReviewDraft(tx,row,companyId,storeId,inboxId,userId,enabled,{xmlProvider=null}={}){
  if(!enabled)return {reused:true,downloaded:false};
  await lockInvoiceStore(tx,companyId,storeId);
  const inbox=await tx.$queryRaw`SELECT "id","attachmentId","status" FROM "DocumentInbox" WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1 FOR UPDATE`;
  if(!inbox[0]||(!inbox[0].attachmentId&&!xmlProvider))throw error("Δεν βρέθηκε το παραστατικό για το πρόχειρο.",404);
  const jobs=inbox[0].attachmentId?await tx.$queryRaw`SELECT "id","companyId","storeId","attachmentId","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "attachmentId"=${inbox[0].attachmentId} AND "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "createdAt","id" LIMIT 1 FOR UPDATE`:[];
  const job=jobs[0];
  const common=await attachInboundToExistingDraft(tx,{companyId,storeId,inboxId},userId,{reviewOnly:Boolean(xmlProvider)});
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
  if(duplicate.length&&xmlProvider)return {reconciliationRequired:true};
  if(duplicate.length)throw error("Υπάρχει ήδη αγορά με τον ίδιο προμηθευτή και αριθμό. Ελέγξτε την υπάρχουσα εγγραφή.");
  const documentId=crypto.randomUUID(),orderId=crypto.randomUUID(),jobId=job?.id||(xmlProvider?null:crypto.randomUUID());
  if(!job&&jobId)await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${inbox[0].attachmentId},'LOCAL','LOCAL_COMPLETE',0,${JSON.stringify({source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true})}::jsonb,${userId})`;
  await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","purchaseOrderId") VALUES (${documentId},${companyId},${storeId},${supplierId},${String(row.invoiceType).startsWith("5.")?"CREDIT_NOTE":"INVOICE"},${number},${new Date(row.issueDate)},0,0,${Number(row.totalGross)},'POS_OCR_DRAFT','DRAFT',${userId},${orderId})`;
  await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${companyId},${storeId},${supplierId},'NEW',${number},${"myDATA • MARK "+row.mark+(xmlProvider?" — Στοιχεία XML myDATA":" — Ανάγνωση από βοηθό")+" — ΠΡΟΣ ΕΛΕΓΧΟ"},${userId},'Λήψη myDATA','Λήψη myDATA','POS_OCR_DRAFT',${documentId})`;
  const filled=await prefillReviewDraft(tx,row,job||(jobId?{id:jobId,companyId,storeId,attachmentId:inbox[0].attachmentId,resultJson:{}}:null),companyId,storeId,orderId,supplierId);
  if(jobId)await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${documentId},"stage"='MYDATA_DRAFT_READY',"status"='AWAITING_APPROVAL',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({source:"MYDATA_PROVIDER_ORIGINAL",myDataMark:row.mark,requiresHumanReview:true,mydataDraftOrderId:orderId})}::jsonb,"updatedAt"=NOW() WHERE "id"=${jobId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "DocumentInbox" SET "status"='IN_REVIEW',"note"=${"myDATA • MARK "+row.mark+" • Πρόχειρο στις Παραγγελίες & Αγορές"+(xmlProvider?(filled?" — XML myDATA, προς έλεγχο":" — XML myDATA, χρειάζεται συμπλήρωση γραμμών"):" — Ανάγνωση από βοηθό")},"updatedAt"=NOW() WHERE "id"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({mydataDraftOrderId:orderId,mydataDraftDocumentId:documentId,...(xmlProvider?{mydataDraftSource:"AADE_XML",mydataViewerProvider:xmlProvider}:{})})}::jsonb WHERE "inboxId"=${inboxId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
  return {reused:true,downloaded:false,jobId,purchaseOrderId:orderId};
}

// For delegated prefill, the source is already attached to the specific
// draft. Never invoke the download, draft creation or reconciliation paths.
export async function prefillStoredMyDataDraft(db,{companyId,storeId,orderId,actorId},verify){
  return db.$transaction(async tx=>{
    await verify(tx);
    await lockInvoiceStore(tx,companyId,storeId);
    const sources=await tx.$queryRaw`SELECT m.*,i."attachmentId",o."supplierId",o."sourceDocumentId"
      FROM "MyDataInboundDocument" m
      JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
      JOIN "PurchaseOrder" o ON o."id"=m."rawPayload"->>'mydataDraftOrderId' AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
      JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."id"=m."rawPayload"->>'mydataDraftDocumentId'
        AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
      JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=m."companyId" AND a."storeId"=m."storeId"
      WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND o."id"=${orderId} AND i."status"='IN_REVIEW'
        AND o."status"='NEW' AND o."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT' AND d."documentType"='INVOICE'
        AND COALESCE(to_jsonb(o)->>'reopenVersion','0')='0'
      LIMIT 2 FOR UPDATE OF m,i,o,d`;
    const row=sources[0];
    if(sources.length!==1||!/^(?:1\.[1-6]|2\.[1-4])$/.test(String(row.invoiceType||""))||
      (row.currency&&row.currency!=="EUR")||!(Number(row.totalGross)>0)){
      throw error("Δεν βρέθηκε μοναδικό ανοιχτό πρόχειρο τιμολογίου myDATA με συνημμένο πρωτότυπο.",409);
    }
    const jobs=await tx.$queryRaw`SELECT "id","companyId","storeId","attachmentId","purchaseDocumentId","resultJson"
      FROM "AiReaderJob" WHERE "attachmentId"=${row.attachmentId} AND "companyId"=${companyId} AND "storeId"=${storeId}
        AND "purchaseDocumentId"=${row.sourceDocumentId} ORDER BY "createdAt","id" LIMIT 1 FOR UPDATE`;
    const filled=await prefillReviewDraft(tx,row,jobs[0],companyId,storeId,orderId,row.supplierId);
    const [count]=await tx.$queryRaw`SELECT COUNT(*)::int AS "lineCount" FROM "PurchaseOrderLine" WHERE "orderId"=${orderId}`;
    const lineCount=count.lineCount;
    if(!filled)return {lineCount};
    const details=JSON.stringify({orderId,documentId:row.sourceDocumentId,inboxId:row.inboxId,lineCount});
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},NULL,${actorId},'PURCHASE_MYDATA_PREFILLED',${details}::jsonb)`;
    return {lineCount};
  },{timeout:30000});
}

async function prefillReviewDraft(tx,row,job,companyId,storeId,orderId,supplierId){
  const locked=await tx.$queryRaw`SELECT o."id",o."supplierId",d."id" AS "documentId" FROM "PurchaseOrder" o
    JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
    WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}
      AND o."status"='NEW' AND o."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT'
      AND COALESCE(to_jsonb(o)->>'reopenVersion','0')='0' FOR UPDATE OF o,d`;
  const target=locked[0];
  if(!target||target.supplierId!==supplierId)return false;
  const counts=await tx.$queryRaw`SELECT (SELECT COUNT(*) FROM "PurchaseOrderLine" WHERE "orderId"=${orderId})::int AS orders,
    (SELECT COUNT(*) FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${target.documentId})::int AS documents`;
  if(counts[0]?.orders||counts[0]?.documents)return false;
  const sources=await tx.$queryRaw`SELECT m.* FROM "MyDataInboundDocument" m WHERE m."id"=${row.id} AND m."companyId"=${companyId}
    AND m."storeId"=${storeId} AND m."inboxId"=${row.inboxId} FOR UPDATE`;
  const source=sources[0];
  if(!source||source.rawPayload?.printedEconomicsReview||typeof source.rawPayload?.xml!=='string'||source.rawPayload.xml.length>1000000)return false;
  const identity=x=>JSON.stringify(['mark','issuerVat','counterpartVat','series','documentNumber','invoiceType','currency','totalNet','totalVat','totalGross'].map(k=>x[k]==null?null:String(x[k])) .concat(x.issueDate?new Date(x.issueDate).toISOString():null));
  if(identity(source)!==identity(row)||source.rawPayload.xml!==row.rawPayload?.xml)return false;
  const xmlLines = invoiceDetailLines(source.rawPayload.xml);
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
    const attachments=await tx.$queryRaw`SELECT a."id",a."checksum" FROM "DocumentAttachment" a JOIN "DocumentInbox" i
      ON i."attachmentId"=a."id" AND i."companyId"=a."companyId" AND i."storeId"=a."storeId"
      WHERE i."id"=${row.inboxId} AND i."companyId"=${companyId} AND i."storeId"=${storeId}`;
    const attachment=attachments.length===1?attachments[0]:null;
    const result=job?.resultJson,proof=result?.providerOriginalTextProof;
    let profile;try{profile=printedEconomicsProfileForUrl(originalDownloadUrl(source.rawPayload.xml,source.issuerVat))}catch{}
    const proven=attachment&&job?.companyId===companyId&&job?.storeId===storeId&&job?.attachmentId===attachment.id
      &&(!job.purchaseDocumentId||job.purchaseDocumentId===target.documentId)&&result?.source==='MYDATA_PROVIDER_ORIGINAL'
      &&String(result.myDataMark)===String(source.mark)&&proof?.version==='SERVER_PROVIDER_PDF_V1'&&profile&&proof.profile===profile
      &&proof.pdfChecksum===attachment.checksum&&typeof result.rawText==='string'&&result.rawText.length<=200000
      &&proof.rawTextSHA256===textHash(result.rawText)&&proof.pageCount===result.pageCount;
    let printed=proven&&/^(?:1\.[1-6]|2\.[1-4])$/.test(String(source.invoiceType))&&(!source.currency||source.currency==='EUR')
      ?parseMyDataPrintedLineEconomics({text:result.rawText,xmlLines,totalNet:String(source.totalNet),totalVat:String(source.totalVat),totalGross:String(source.totalGross),pageCount:result.pageCount,profile}):null;
    if(printed&&(printed.profile!==profile||printed.rows.length!==lines.length||printed.rows.some((p,i)=>p.itemCode!==lines[i].itemCode||Number(p.quantity)!==lines[i].quantity)))printed=null;
    if(printed?.profile===ALFA19_PROFILE){
      const physical=printed.rows.map(p=>p.physicalLineNumber);
      if(physical.some(n=>!Number.isInteger(n)||n<1||n>printed.rows.length)||new Set(physical).size!==physical.length)printed=null;
    }
    if(printed){
      const columns=await tx.$queryRaw`SELECT column_name,data_type,numeric_precision,numeric_scale FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='PurchaseOrderLine'
          AND column_name IN ('unitCost','initialUnitCost','discount1','discount2','discount3')`;
      const byName=new Map(columns.map(c=>[c.column_name,c]));
      if(printed.rows.some(p=>['unitCost','initialUnitCost','discount1','discount2','discount3'].some(k=>!decimalFitsColumn(p[k],byName.get(k)))))printed=null;
    }
    const inserted=[];
    for (const [index,line] of lines.entries()) {
      const id=crypto.randomUUID(),economics=printed?.rows[index];inserted.push({id,line,economics});
      if(economics){
        // Keep the confirmed decimal amounts exact across the driver boundary.
        // A JS float parameter can otherwise become 8.130000000000001 in an
        // unconstrained numeric column and invalidate the persisted proof.
        const exactAlfa=printed.profile===ALFA19_PROFILE;
        const netAmount=exactAlfa?economics.netValue:line.netValue;
        const vatAmount=exactAlfa?economics.vatAmount:line.vatAmount;
        const grossCents=cents(line.netValue)+cents(line.vatAmount);
        const grossAmount=exactAlfa?`${Math.floor(grossCents/100)}.${String(grossCents%100).padStart(2,'0')}`:grossCents/100;
        await tx.$executeRaw`INSERT INTO "PurchaseOrderLine"
          ("id","orderId","productId","supplierCode","description","quantity","unitCost","initialUnitCost","discount1","discount2","discount3",
           "invoiceUnit","stockUnitsPerInvoiceUnit","vatRate","netAmount","vatAmount","grossAmount")
          VALUES (${id},${orderId},${byCode.get(line.itemCode)?.productId??null},${line.itemCode},${line.description},${line.quantity},
           ${economics.unitCost}::numeric,${economics.initialUnitCost}::numeric,${economics.discount1}::numeric,${economics.discount2}::numeric,${economics.discount3}::numeric,
           ${line.measurementUnit===7?'PACKAGE':'PIECE'},${unitsFor(line)},${vatRates.get(line.vatCategory)},${netAmount}::numeric,${vatAmount}::numeric,${grossAmount}::numeric)`;
        continue;
      }
      const unitCost = line.netValue / line.quantity;
      await tx.$executeRaw`INSERT INTO "PurchaseOrderLine"
        ("id","orderId","productId","supplierCode","description","quantity","unitCost","initialUnitCost",
         "invoiceUnit","stockUnitsPerInvoiceUnit","vatRate","netAmount","vatAmount","grossAmount")
        VALUES (${id},${orderId},${byCode.get(line.itemCode)?.productId ?? null},${line.itemCode},${line.description},${line.quantity},
          ${unitCost},${unitCost},${line.measurementUnit === 7 ? 'PACKAGE' : 'PIECE'},${unitsFor(line)},${vatRates.get(line.vatCategory)},${line.netValue},${line.vatAmount},
          ${(cents(line.netValue) + cents(line.vatAmount)) / 100})`;
    }
    const persisted=lines.length<=250?await tx.$queryRaw`SELECT (SELECT jsonb_object_agg(e.key,CASE WHEN jsonb_typeof(e.value)='number' THEN to_jsonb(e.value::text) ELSE e.value END)
      FROM jsonb_each(to_jsonb(l)) e) AS row FROM "PurchaseOrderLine" l WHERE l."orderId"=${orderId} ORDER BY l."id" LIMIT 251`:[];
    const rowsFingerprint=myDataPrintedEconomicsRowsFingerprint(persisted.map(x=>x.row));
    if(printed){
      const expected=new Map(inserted.map(({id,line,economics:p})=>[id,{productId:byCode.get(line.itemCode)?.productId??null,
        supplierCode:line.itemCode,description:line.description,quantity:line.quantity,unitCost:p.unitCost,initialUnitCost:p.initialUnitCost,
        discount1:p.discount1,discount2:p.discount2,discount3:p.discount3,exciseTotal:0,vatRate:vatRates.get(line.vatCategory),
        netAmount:line.netValue,vatAmount:line.vatAmount,grossAmount:(cents(line.netValue)+cents(line.vatAmount))/100,
        invoiceUnit:line.measurementUnit===7?'PACKAGE':'PIECE',stockUnitsPerInvoiceUnit:unitsFor(line)}]));
      const expectedFingerprint=myDataPrintedEconomicsRowsFingerprint(persisted.map(({row:r})=>({...r,...expected.get(r.id)})));
      if(!rowsFingerprint||expected.size!==persisted.length||persisted.some(({row:r})=>!expected.has(r.id))||expectedFingerprint!==rowsFingerprint)printed=null;
    }
    if(attachment&&job?.id&&(rowsFingerprint||lines.length>250)){
      const marker={version:'MYDATA_PRINTED_ECONOMICS_V1',state:printed?'VERIFIED':'UNKNOWN',companyId,storeId,inboxId:row.inboxId,mark:source.mark,
        orderId,documentId:target.documentId,jobId:job.id,attachmentId:attachment.id,supplierId:target.supplierId??null,
        attachmentChecksum:attachment.checksum,rawTextSHA256:proven?textHash(result.rawText):null,xmlSHA256:textHash(source.rawPayload.xml),rowsFingerprint,
        ...(proven?{printedProfile:profile,pageCount:result.pageCount}:{}),
        lineCount:lines.length,reason:printed?'PRINTED_LINE_AMOUNT_CONFIRMED':lines.length>250?'ROW_LIMIT':!proven?'MISSING_ORIGINAL_TEXT_PROOF':'PRINTED_ECONOMICS_NOT_PROVEN',
        ...(printed?{discountAmountTotal:printed.totals.discount,rows:inserted.map(({id,economics:p})=>({lineId:id,lineNumber:p.lineNumber,itemCode:p.itemCode,
          originalUnitCost:p.unitCost,printedInitialAmount:p.printedInitialAmount,printedDiscountSteps:p.printedDiscountSteps,
          ...(Number.isInteger(p.physicalLineNumber)?{physicalLineNumber:p.physicalLineNumber}:{}),storageEquivalentPercents:[p.discount1,p.discount2,p.discount3]}))}:{rows:[]})};
      await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({printedEconomicsReview:marker})}::jsonb
        WHERE "id"=${source.id} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "inboxId"=${row.inboxId}`;
    }
    return true;
  }
  return false;
}
