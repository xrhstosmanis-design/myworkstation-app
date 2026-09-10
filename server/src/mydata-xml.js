const clean=value=>value==null?null:String(value).trim()||null;
const number=value=>{const n=Number(String(value??"").replace(",","."));return Number.isFinite(n)?n:0};
const entity=value=>String(value||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
function tag(xml,name){const match=new RegExp(`<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`,`i`).exec(xml);return match?entity(match[1].trim()):null}

export function myDataError(xml){return /<(?:[A-Za-z0-9_-]+:)?error(?:\s[^>]*)?>/i.test(String(xml||""))?(tag(xml,"message")||"Ελέγξτε τους κωδικούς και το δοκιμαστικό περιβάλλον."):null}
export function invoiceNodes(xml){return [...String(xml||"").matchAll(/<(?:[A-Za-z0-9_-]+:)?invoice(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?invoice>/gi)].map(match=>match[1])}
export function invoiceSummary(invoiceXml){
  const header=tag(invoiceXml,"invoiceHeader")||"",summary=tag(invoiceXml,"invoiceSummary")||"",issuer=tag(invoiceXml,"issuer")||"",counterpart=tag(invoiceXml,"counterpart")||"";
  const totalNet=number(tag(summary,"totalNetValue")),totalVat=number(tag(summary,"totalVatAmount"));
  return {mark:clean(tag(invoiceXml,"mark")),uid:clean(tag(invoiceXml,"uid")),issuerVat:clean(tag(issuer,"vatNumber")),counterpartVat:clean(tag(counterpart,"vatNumber")),series:clean(tag(header,"series")),documentNumber:clean(tag(header,"aa")),issueDate:clean(tag(header,"issueDate")),invoiceType:clean(tag(header,"invoiceType")),currency:clean(tag(header,"currency"))||"EUR",totalNet,totalVat,totalGross:number(tag(summary,"totalGrossValue"))||(totalNet+totalVat)};
}
