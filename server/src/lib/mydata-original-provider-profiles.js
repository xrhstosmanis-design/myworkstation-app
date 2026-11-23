// Exact Epsilon host/format pairs verified against actual provider PDFs and the
// unchanged MARK, issuer/recipient VAT and document-number text identity guard.
// A matching URL only permits a download attempt; it never verifies its bytes.
const epsilonFormats=new Map([
 ['epsilondigital.epsilonnet.gr','8'],
 ['epsilondigital3.epsilonnet.gr','84'],
 ['epsilondigital14.epsilonnet.gr','160'],
 ['epsilondigital22.epsilonnet.gr','190'],
 ['epsilondigital-enetgroup.epsilonnet.gr','107'],
 ['epsilondigital-nbg.epsilonnet.gr','109'],
 ['epsilondigitalsmart10.epsilonnet.gr','227'],
 ['epsilondigitalsmart9.epsilonnet.gr','217'],
 ['epsilondigital2.epsilonnet.gr','72'],
 ['epsilondigital18.epsilonnet.gr','172'],
 ['epsilondigital-3rdpartd.epsilonnet.gr','159'],
 ['epsilondigital24.epsilonnet.gr','209'],
 ['epsilondigital19.epsilonnet.gr','177'],
 ['epsilondigital-3rdpartb.epsilonnet.gr','129'],
 ['epsilondigital9.epsilonnet.gr','145'],
 // Image-header originals: the download pipeline additionally requires the
 // bounded server OCR proof when the embedded issuer VAT is absent.
 ['epsilondigital-3rdparte.epsilonnet.gr','169'],
 ['epsilondigital-cosmote.epsilonnet.gr','22'],
 ['epsilondigital-telekom.epsilonnet.gr','22'],
]);

export function matchesVerifiedEpsilonOriginal(url,issuerVat){
 if(!(url instanceof URL)||!['string','number'].includes(typeof issuerVat)||!/^\d{9}$/.test(String(issuerVat)))return false;
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return false;
 const format=url.pathname.match(/^\/fd\/[a-f0-9]{32}:(\d{1,3})\/?$/i)?.[1];
 return format!==undefined&&epsilonFormats.get(url.hostname)===format;
}
