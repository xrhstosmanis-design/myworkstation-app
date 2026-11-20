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
 ['epsilondigital19.epsilonnet.gr','177'],
 ['epsilondigital-3rdpartb.epsilonnet.gr','129'],
 ['epsilondigital9.epsilonnet.gr','145'],
]);

export function matchesVerifiedEpsilonOriginal(url,issuerVat){
 if(!(url instanceof URL)||!['string','number'].includes(typeof issuerVat)||!/^\d{9}$/.test(String(issuerVat)))return false;
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)return false;
 const format=url.pathname.match(/^\/fd\/[a-f0-9]{32}:(\d{1,3})\/?$/i)?.[1];
 return format!==undefined&&epsilonFormats.get(url.hostname)===format;
}
