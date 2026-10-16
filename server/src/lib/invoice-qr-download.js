import {invoiceNodes,invoiceSummary} from "../mydata-xml.js";
import {readOriginalPdf,verifyOriginalText} from "../mydata-original.js";

const fail=(message,status=422)=>Object.assign(new Error(message),{status});
// Provider formats are independent of supplier identity or invoice number.
export function invoiceQrSource(value){
  const input=String(value||"").trim();
  // Only trim framing whitespace. Never repair embedded controls or a truncated token.
  if(input.length>4096||/[\u0000-\u0020\u007f]/.test(input)||/\/(?:\.|%2e){1,2}(?:\/|[?#]|$)/i.test(input))throw fail("Ο σύνδεσμος QR είναι ελλιπής ή περιέχει μη έγκυρους χαρακτήρες.");
  let url;try{url=new URL(input)}catch{throw fail("Το QR δεν περιέχει υποστηριζόμενο σύνδεσμο τιμολογίου.")}
  if(url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&!url.hash){
    if(url.hostname==="invoicelink.megasoft.gr"&&url.pathname==="/invoiceinspect/qr"&&/^\?QrCode=[A-Za-z0-9%+\/=]+$/.test(url.search))throw fail("Αναγνωρίστηκε QR Megasoft InvoiceLink. Η αυτόματη λήψη του πρωτότυπου PDF από αυτή τη μορφή δεν υποστηρίζεται ακόμη. Χρησιμοποίησε φωτογραφία ολόκληρου του τιμολογίου ή PDF.");
    if(url.hostname==="mydatapi.aade.gr"&&url.pathname==="/myDATA/TimologioQR/QRInfo"&&/^\?q=[A-Za-z0-9%+\/=]+$/.test(url.search))throw fail("Αναγνωρίστηκε QR επιβεβαίωσης ΑΑΔΕ. Για την εισαγωγή χρειάζεται το πλήρες τιμολόγιο: φωτογραφία ολόκληρου του παραστατικού ή PDF.");
  }
  const epsilonHost=["epsilondigital.epsilonnet.gr","epsilondigital-3rdparte.epsilonnet.gr"].includes(url.hostname);
  const epsilonShort=epsilonHost&&url.pathname.match(/^\/fd\/([a-f0-9]{32}):(8|169)\/?$/i);
  const epsilon=url.hostname==="epsilondigital.epsilonnet.gr"&&url.pathname.match(/^\/DocViewer\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i);
  const knownHost=["einvoice.s1ecos.gr","einvoice.impact.gr"].includes(url.hostname)||Boolean(epsilon)||Boolean(epsilonShort);
  const canonical=url.pathname.match(/^\/p\/EL(\d{9})\/([a-f0-9]{40})\/([a-f0-9]{32})\/?$/i);
  const impactView=url.hostname==="einvoice.impact.gr"&&url.pathname.match(/^\/v\/EL(\d{9})-(\d{1,20})-([a-f0-9]{40})-([a-f0-9]{32})\/?$/i);
  if(url.protocol!=="https:"||!knownHost||url.username||url.password||url.port||url.search||url.hash||(!canonical&&!impactView&&!epsilon&&!epsilonShort))throw fail("Το QR αναγνωρίστηκε, αλλά η μορφή του παρόχου δεν υποστηρίζεται ακόμη. Χρησιμοποίησε φωτογραφία ολόκληρου του τιμολογίου ή PDF.");
  if(epsilonShort&&epsilonShort[2]!== (url.hostname==="epsilondigital.epsilonnet.gr"?"8":"169"))throw fail("Η μορφή του συνδέσμου Epsilon δεν υποστηρίζεται ακόμη. Χρησιμοποίησε φωτογραφία ή PDF.");
  url.pathname=url.pathname.replace(/\/$/,"");
  // Both observed /fd/ endpoints redirect to this same document UUID. Resolve
  // locally; do not enable network redirects or accept a provider-supplied host.
  const key=epsilonShort?.[1];
  const documentId=epsilon?.[1]||(key?key.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5"):undefined);
  return {url,issuerVat:(canonical||impactView)?.[1],format:epsilon||epsilonShort?"epsilon":impactView?"impact-view":"canonical",documentId,authenticationCode:impactView?.[3],documentToken:impactView?.[4]};
}
export function invoiceQrUrl(value){return invoiceQrSource(value).url}
function epsilonFileUrl(source,type){
  return `${source.url.origin}/filedocument/getfile?fileType=${type}&documentId=${source.documentId}`;
}
function verifyEpsilonOriginal(text,row,xml){
  // Some Epsilon templates rasterize the issuer header and clip the printed
  // authentication/UID hashes. Bind both provider downloads through BOTH
  // independently printed hash prefixes (at least 112 bits each), in addition
  // to MARK, recipient VAT and invoice number. Other providers keep their guard.
  const authentication=xml.match(/<(?:\w+:)?authenticationCode\b[^>]*>\s*([a-f0-9]{40})\s*<\//i)?.[1];
  const hashes=String(text||"").match(/\b[a-f0-9]{28,40}\b/gi)||[];
  const matches=value=>/^[a-f0-9]{40}$/i.test(value||"")?hashes.filter(hash=>value.toUpperCase().startsWith(hash.toUpperCase())):[];
  const bound=String(authentication).toUpperCase()!==String(row.uid).toUpperCase()&&matches(authentication).some(auth=>matches(row.uid).some(uid=>auth.toUpperCase()!==uid.toUpperCase()));
  const tokens=String(text||"").match(/[0-9]+/g)||[];
  const number=String(row.documentNumber||"");
  const sameNumber=t=>t===number||(/^\d+$/.test(number)&&t.replace(/^0+(?=\d)/,"")===number.replace(/^0+(?=\d)/,""));
  if(!bound||!tokens.includes(row.mark)||!tokens.includes(row.counterpartVat)||!number||!tokens.some(sameNumber))throw fail("Το πρωτότυπο Epsilon δεν επιβεβαιώνει τους κωδικούς ταυτοποίησης, MARK, ΑΦΜ παραλήπτη και αριθμό παραστατικού. Χρησιμοποίησε φωτογραφία ή PDF.");
}
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
    const xml=(await boundedDownload(source.format==="epsilon"?epsilonFileUrl(source,3):`${url.href}/myDATA`,1000000,signal,fetcher)).toString("utf8");
    const nodes=invoiceNodes(xml);
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)||nodes.length!==1)throw fail("Δεν αναγνωρίστηκε ένα μοναδικό τιμολόγιο στον σύνδεσμο QR.");
    const row=invoiceSummary(nodes[0]);
    if(!/^\d{9}$/.test(row.issuerVat||"")||(source.issuerVat&&row.issuerVat!==source.issuerVat)||row.counterpartVat!==vat)throw fail("Το τιμολόγιο QR δεν αντιστοιχεί στην εταιρεία του επιλεγμένου καταστήματος.",409);
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(row.issueDate||"")&&Number.isFinite(Date.parse(row.issueDate))&&new Date(row.issueDate).toISOString().slice(0,10)===row.issueDate;
    if(!/^\d+$/.test(row.mark||"")||!row.documentNumber||!validDate||row.currency!=="EUR"||!/<(?:\w+:)?currency\b[^>]*>\s*EUR\s*<\//.test(nodes[0])||!Number.isFinite(row.totalGross)||row.totalGross<=0||!/<(?:\w+:)?totalGrossValue\b[^>]*>\s*\d+(?:\.\d+)?\s*<\//.test(nodes[0]))throw fail("Λείπουν ασφαλή βασικά στοιχεία του τιμολογίου QR. Χρησιμοποίησε φωτογραφία ή PDF.");
    if(!["1.1","1.2","1.3","2.1","2.2","2.3","5.1","5.2"].includes(row.invoiceType))throw fail("Ο τύπος παραστατικού QR χρειάζεται χειροκίνητο έλεγχο. Χρησιμοποίησε φωτογραφία ή PDF.");
    let pdfUrl=source.format==="epsilon"?epsilonFileUrl(source,2):`${url.href}/pdf`;
    if(source.format==="impact-view"){
      // /v/ exposes myDATA directly; its 40-character key is authenticationCode,
      // while /p/ needs the UID. Resolve from the same validated XML, without HTML.
      const authentication=nodes[0].match(/<(?:\w+:)?authenticationCode\b[^>]*>\s*([a-f0-9]{40})\s*<\//i)?.[1];
      if(!/^[a-f0-9]{40}$/i.test(row.uid||"")||authentication?.toUpperCase()!==source.authenticationCode.toUpperCase())throw fail("Δεν επιβεβαιώθηκε η ταυτότητα του τιμολογίου QR.");
      pdfUrl=`${url.origin}/p/EL${source.issuerVat}/${row.uid}/${source.documentToken}/pdf`;
    }
    const bytes=await boundedDownload(pdfUrl,3400000,signal,fetcher);
    if(bytes.length<100||bytes.subarray(0,5).toString()!=="%PDF-")throw fail("Ο πάροχος δεν επέστρεψε πρωτότυπο PDF.");
    const {text,pageCount}=await reader(bytes);
    if(source.format==="epsilon")verifyEpsilonOriginal(text,row,nodes[0]);else verifyOriginalText(text,row);
    if(!Number.isInteger(pageCount)||pageCount<1||pageCount>5)throw fail("Το PDF QR υπερβαίνει τις 5 σελίδες. Χρειάζεται έλεγχος στο BackOffice.");
    const issuer=nodes[0].match(/<(?:\w+:)?issuer\b[^>]*>([\s\S]*?)<\/(?:\w+:)?issuer>/)?.[1]||"";
    const name=issuer.match(/<(?:\w+:)?name\b[^>]*>([^<]*)<\//)?.[1]||"";
    return {filename:`invoice-qr-${row.documentNumber}-${row.mark}.pdf`,mimeType:"application/pdf",dataUrl:`data:application/pdf;base64,${bytes.toString("base64")}`,pageCount,header:{supplierTaxId:row.issuerVat,supplierName:name.replace(/&amp;/g,"&").replace(/&quot;/g,'"'),documentNumber:row.series?`${row.series}-${row.documentNumber}`:row.documentNumber,documentDate:row.issueDate,totalGross:row.totalGross,documentType:row.invoiceType.startsWith("5.")?"CREDIT_NOTE":"INVOICE",mark:row.mark},requiresHumanReview:true};
  }catch(error){if(signal.aborted)throw fail("Ο πάροχος δεν απάντησε εντός 45 δευτερολέπτων. Δοκίμασε φωτογραφία ή PDF.",504);throw error}
}
