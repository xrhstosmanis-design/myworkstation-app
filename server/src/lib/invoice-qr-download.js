import {invoiceNodes,invoiceSummary} from "../mydata-xml.js";
import {readOriginalPdf,verifyOriginalText} from "../mydata-original.js";

const fail=(message,status=422)=>Object.assign(new Error(message),{status});
// Provider formats are independent of supplier identity or invoice number.
export function invoiceQrSource(value){
  let url;try{url=new URL(String(value||""))}catch{throw fail("Το QR δεν περιέχει υποστηριζόμενο σύνδεσμο τιμολογίου.")}
  const knownHost=["einvoice.s1ecos.gr","einvoice.impact.gr"].includes(url.hostname);
  const canonical=url.pathname.match(/^\/p\/EL(\d{9})\/([a-f0-9]{40})\/([a-f0-9]{32})\/?$/i);
  const impactView=url.hostname==="einvoice.impact.gr"&&url.pathname.match(/^\/v\/EL(\d{9})-(\d{1,20})-([a-f0-9]{40})-([a-f0-9]{32})\/?$/i);
  if(url.protocol!=="https:"||!knownHost||url.username||url.password||url.port||url.search||url.hash||(!canonical&&!impactView))throw fail("Το QR αναγνωρίστηκε, αλλά η μορφή του παρόχου δεν υποστηρίζεται ακόμη. Χρησιμοποίησε φωτογραφία ολόκληρου του τιμολογίου ή PDF.");
  url.pathname=url.pathname.replace(/\/$/,"");
  return {url,issuerVat:(canonical||impactView)[1],format:impactView?"impact-view":"canonical",authenticationCode:impactView?.[3],documentToken:impactView?.[4]};
}
export function invoiceQrUrl(value){return invoiceQrSource(value).url}
async function boundedDownload(url,limit,signal,fetcher){
  const response=await fetcher(url,{redirect:"error",signal,headers:{Accept:"application/xml,application/pdf"}});
  if(!response.ok)throw fail("Ο πάροχος δεν επέστρεψε το τιμολόγιο. Δοκίμασε φωτογραφία ή PDF.",502);
  if(Number(response.headers.get("content-length"))>limit)throw fail("Το ηλεκτρονικό τιμολόγιο είναι πολύ μεγάλο.");
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit){await response.body.cancel?.().catch(()=>{});throw fail("Το ηλεκτρονικό τιμολόγιο είναι πολύ μεγάλο.")}chunks.push(Buffer.from(chunk))}
  return Buffer.concat(chunks);
}
export async function downloadInvoiceQr(value,recipientVat,{fetcher=fetch,reader=readOriginalPdf}={}){
  const source=invoiceQrSource(value),url=source.url,vat=String(recipientVat||"").replace(/^EL/i,"").trim();
  if(!/^\d{9}$/.test(vat))throw fail("Δεν υπάρχει έγκυρο ΑΦΜ στην εταιρεία του καταστήματος. Χρησιμοποίησε φωτογραφία ή PDF.",409);
  const signal=AbortSignal.timeout(45000);
  try{
    const xml=(await boundedDownload(`${url.href}/myDATA`,1000000,signal,fetcher)).toString("utf8");
    const nodes=invoiceNodes(xml);
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)||nodes.length!==1)throw fail("Δεν αναγνωρίστηκε ένα μοναδικό τιμολόγιο στον σύνδεσμο QR.");
    const row=invoiceSummary(nodes[0]);
    if(row.issuerVat!==source.issuerVat||row.counterpartVat!==vat)throw fail("Το τιμολόγιο QR δεν αντιστοιχεί στην εταιρεία του επιλεγμένου καταστήματος.",409);
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(row.issueDate||"")&&Number.isFinite(Date.parse(row.issueDate))&&new Date(row.issueDate).toISOString().slice(0,10)===row.issueDate;
    if(!/^\d+$/.test(row.mark||"")||!row.documentNumber||!validDate||row.currency!=="EUR"||!/<(?:\w+:)?currency\b[^>]*>\s*EUR\s*<\//.test(nodes[0])||!Number.isFinite(row.totalGross)||row.totalGross<=0||!/<(?:\w+:)?totalGrossValue\b[^>]*>\s*\d+(?:\.\d+)?\s*<\//.test(nodes[0]))throw fail("Λείπουν ασφαλή βασικά στοιχεία του τιμολογίου QR. Χρησιμοποίησε φωτογραφία ή PDF.");
    if(!["1.1","1.2","1.3","2.1","2.2","2.3","5.1","5.2"].includes(row.invoiceType))throw fail("Ο τύπος παραστατικού QR χρειάζεται χειροκίνητο έλεγχο. Χρησιμοποίησε φωτογραφία ή PDF.");
    let pdfUrl=`${url.href}/pdf`;
    if(source.format==="impact-view"){
      // /v/ exposes myDATA directly; its 40-character key is authenticationCode,
      // while /p/ needs the UID. Resolve from the same validated XML, without HTML.
      const authentication=nodes[0].match(/<(?:\w+:)?authenticationCode\b[^>]*>\s*([a-f0-9]{40})\s*<\//i)?.[1];
      if(!/^[a-f0-9]{40}$/i.test(row.uid||"")||authentication?.toUpperCase()!==source.authenticationCode.toUpperCase())throw fail("Δεν επιβεβαιώθηκε η ταυτότητα του τιμολογίου QR.");
      pdfUrl=`${url.origin}/p/EL${source.issuerVat}/${row.uid}/${source.documentToken}/pdf`;
    }
    const bytes=await boundedDownload(pdfUrl,3400000,signal,fetcher);
    if(bytes.length<100||bytes.subarray(0,5).toString()!=="%PDF-")throw fail("Ο πάροχος δεν επέστρεψε πρωτότυπο PDF.");
    const {text,pageCount}=await reader(bytes);verifyOriginalText(text,row);
    if(!Number.isInteger(pageCount)||pageCount<1||pageCount>5)throw fail("Το PDF QR υπερβαίνει τις 5 σελίδες. Χρειάζεται έλεγχος στο BackOffice.");
    const issuer=nodes[0].match(/<(?:\w+:)?issuer\b[^>]*>([\s\S]*?)<\/(?:\w+:)?issuer>/)?.[1]||"";
    const name=issuer.match(/<(?:\w+:)?name\b[^>]*>([^<]*)<\//)?.[1]||"";
    return {filename:`invoice-qr-${row.documentNumber}-${row.mark}.pdf`,mimeType:"application/pdf",dataUrl:`data:application/pdf;base64,${bytes.toString("base64")}`,pageCount,header:{supplierTaxId:row.issuerVat,supplierName:name.replace(/&amp;/g,"&").replace(/&quot;/g,'"'),documentNumber:row.series?`${row.series}-${row.documentNumber}`:row.documentNumber,documentDate:row.issueDate,totalGross:row.totalGross,documentType:row.invoiceType.startsWith("5.")?"CREDIT_NOTE":"INVOICE",mark:row.mark},requiresHumanReview:true};
  }catch(error){if(signal.aborted)throw fail("Ο πάροχος δεν απάντησε εντός 45 δευτερολέπτων. Δοκίμασε φωτογραφία ή PDF.",504);throw error}
}
