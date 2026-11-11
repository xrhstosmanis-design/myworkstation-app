import {inboxHeader,selectedInboxRow,verifiedInboxPdf} from "./pos-inbox-original.js";
import {invoiceIssuerName} from "../mydata-xml.js";

const fail=(message,status=409)=>Object.assign(new Error(message),{status});

// Every invoice has its own opaque q value. The supported QR pattern is common
// to all stores, but its lookup is always confined to the authenticated store.
export function canonicalAadeInvoiceQr(value){
  const input=String(value??"").trim();
  if(!input||input.length>4096||/[\u0000-\u0020\u007f]/.test(input)||/%(?![0-9a-fA-F]{2})/.test(input))return null;
  let url;try{url=new URL(input)}catch{return null}
  if(url.protocol!=="https:"||url.hostname!=="mydatapi.aade.gr"||url.pathname!=="/myDATA/TimologioQR/QRInfo"||url.username||url.password||url.port||url.hash||!(url.search.startsWith("?q=")&&new RegExp("^[A-Za-z0-9%+/=]+$").test(url.search.slice(3))))return null;
  return url.searchParams.get("q")?url.href:null;
}

export async function readStoredMyDataQr(database,{companyId,storeId,recipientVat,value},deps={}){
  const qr=canonicalAadeInvoiceQr(value);
  if(!qr)return null;
  const matches=await database.$queryRaw`
    SELECT m."inboxId" FROM "MyDataInboundDocument" m
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
      AND m."counterpartVat"=${recipientVat}
      AND (regexp_match(m."rawPayload"->>'xml','<qrCodeUrl>([^<]+)</qrCodeUrl>'))[1]=${qr}
    LIMIT 2`;
  if(matches.length===0)throw fail("Το QR της ΑΑΔΕ δεν βρέθηκε στη θυρίδα myDATA του επιλεγμένου καταστήματος. Κάνε πρώτα συγχρονισμό myDATA ή χρησιμοποίησε το πρωτότυπο PDF.",404);
  if(matches.length!==1)throw fail("Το QR αντιστοιχεί σε περισσότερα από ένα παραστατικά. Χρειάζεται έλεγχος στο BackOffice.");
  const readRow=deps.readRow||selectedInboxRow;
  const readPdf=deps.readPdf||verifiedInboxPdf;
  const row=await readRow(database,companyId,storeId,matches[0].inboxId);
  // The official received XML can provide the issuer name even before a
  // supplier is added to the catalog. No supplier is created by a scan.
  const supplierName=row.supplierName||invoiceIssuerName(row.rawPayload?.xml)||"";
  const header=inboxHeader({...row,supplierName},recipientVat);
  const pdf=await readPdf(row,row.contentData);
  return {
    header,filename:pdf.filename,mimeType:"application/pdf",
    dataUrl:"data:application/pdf;base64,"+pdf.bytes.toString("base64"),
    pageCount:pdf.pageCount,inboxId:matches[0].inboxId,requiresHumanReview:true
  };
}
