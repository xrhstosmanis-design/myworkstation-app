import test from "node:test";
import assert from "node:assert/strict";
import {downloadInvoiceQr,invoiceQrUrl} from "../src/lib/invoice-qr-download.js";
import {createInvoiceQrHandler} from "../src/routes/commerce-invoice-qr.js";

const url="https://einvoice.s1ecos.gr/p/EL123456789/"+"a".repeat(40)+"/"+"b".repeat(32);
const xml=`<InvoicesDoc><invoice><mark>12345</mark><issuer><vatNumber>123456789</vatNumber><name>LAB &amp; Supplier</name></issuer><counterpart><vatNumber>987654321</vatNumber></counterpart><invoiceHeader><series>A</series><aa>0012</aa><issueDate>2026-10-11</issueDate><invoiceType>1.1</invoiceType><currency>EUR</currency></invoiceHeader><invoiceSummary><totalNetValue>10</totalNetValue><totalVatAmount>1.30</totalVatAmount><totalGrossValue>11.30</totalGrossValue></invoiceSummary></invoice></InvoicesDoc>`;
const pdf=Buffer.from("%PDF-"+"x".repeat(200));
const reader=async()=>({text:"12345 123456789 987654321 0012",pageCount:2});
function transport(source=xml,bytes=pdf){const calls=[];return {calls,fetcher:async(u,options)=>{calls.push({u,options});return new Response(u.endsWith("/myDATA")?source:bytes)}}}

test("QR downloads one original PDF with reviewable header, never infers paid state",async()=>{
  const t=transport(),result=await downloadInvoiceQr(url,"987654321",{...t,reader});
  assert.equal(result.header.documentNumber,"A-0012");assert.equal(result.header.totalGross,11.3);assert.equal(result.header.supplierName,"LAB & Supplier");assert.equal(result.pageCount,2);
  assert.equal(result.requiresHumanReview,true);assert.equal(result.header.paymentMethod,undefined);assert.equal(result.header.settlementMode,undefined);
  assert.deepEqual(t.calls.map(x=>x.u),[url+"/myDATA",url+"/pdf"]);assert.ok(t.calls.every(x=>x.options.redirect==="error"));
  assert.deepEqual(Buffer.from(result.dataUrl.split(",")[1],"base64"),pdf);
});

test("QR rejects arbitrary URLs, credentials, alternate ports and redirects",async()=>{
  for(const input of ["MW2PERSONAL",url.replace("https:","http:"),url.replace("einvoice.s1ecos.gr","localhost"),url.replace("einvoice.s1ecos.gr","einvoice.s1ecos.gr.attacker.test"),url.replace("https://","https://u:p@"),url+"?x=1",url+"#x",url.replace(".gr/",".gr:8443/"),url+"/pdf"]){assert.throws(()=>invoiceQrUrl(input));}
  const redirected=async(_u,o)=>{assert.equal(o.redirect,"error");throw Error("redirect rejected")};
  await assert.rejects(downloadInvoiceQr(url,"987654321",{fetcher:redirected,reader}),/redirect rejected/);
});

test("foreign recipient/issuer or missing metadata fails before PDF download",async()=>{
  for(const source of [xml.replace("987654321","111111111"),xml.replace("123456789","111111111"),xml.replace("<totalGrossValue>11.30</totalGrossValue>",""),xml.replace("EUR","USD"),xml.replace("<mark>12345</mark>",""),xml.replace("<invoice>","<!DOCTYPE x><invoice>"),xml.replace("</InvoicesDoc>","<invoice>second</invoice></InvoicesDoc>")]){
    const t=transport(source);await assert.rejects(downloadInvoiceQr(url,"987654321",{...t,reader}));assert.equal(t.calls.length,1);
  }
  const t=transport();await assert.rejects(downloadInvoiceQr(url,"",{...t,reader}));assert.equal(t.calls.length,0);
});

test("QR validates PDF identity, page cap, signature, size and credit-note type",async()=>{
  await assert.rejects(downloadInvoiceQr(url,"987654321",{...transport(),reader:async()=>({text:"12345 123456789 0012",pageCount:2})}),/ΑΦΜ/);
  await assert.rejects(downloadInvoiceQr(url,"987654321",{...transport(),reader:async()=>({text:"12345 123456789 987654321 0012",pageCount:6})}),/5 σελίδες/);
  await assert.rejects(downloadInvoiceQr(url,"987654321",{...transport(xml,Buffer.from("HTML")),reader}),/PDF/);
  await assert.rejects(downloadInvoiceQr(url,"987654321",{...transport(xml,Buffer.alloc(3400001)),reader}),/μεγάλο/);
  const r=await downloadInvoiceQr(url,"987654321",{...transport(xml.replace("1.1","5.1")),reader});assert.equal(r.header.documentType,"CREDIT_NOTE");
});

test("QR handler enforces selected store and payment permission without writes",async()=>{
  let downloads=0,queries=0,allowed=0;
  const database={store:{findFirst:async({where})=>{queries++;return where.companyId==="own"&&where.id==="store"?{id:"store",companyId:"own",company:{taxId:"987654321"}}:null}}};
  const handler=createInvoiceQrHandler({database,download:async(_url,vat)=>{assert.equal(vat,"987654321");downloads++;return {ok:true}},allowOutbound:()=>allowed++});
  const res=()=>({code:200,status(n){this.code=n;return this},json(data){this.data=data;return this},set(){return this}});
  for(const user of [{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:"own",storeId:"store",permissions:[]},{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:"own",storeId:"other",permissions:["SUPPLIER_PAYMENT"]},{role:"SELLER",companyId:"own"}]){const r=res();await handler({user,body:{storeId:"store",url}},r,e=>{throw e});assert.equal(r.code,403)}
  assert.equal(downloads,0);assert.equal(queries,0);
  const foreign=res();await handler({user:{role:"OWNER",companyId:"foreign"},body:{storeId:"store",url}},foreign,e=>{throw e});assert.equal(foreign.code,404);assert.equal(downloads,0);
  const r=res();await handler({user:{role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:"own",storeId:"store",permissions:["SUPPLIER_PAYMENT"]},body:{storeId:"store",url}},r,e=>{throw e});assert.equal(r.code,200);assert.equal(downloads,1);assert.equal(allowed,1);
});


test("Impact view QR resolves original PDF from verified XML for different invoices",async()=>{
  for(const [issuer,uid,auth,token] of [["123456789","c".repeat(40),"d".repeat(40),"e".repeat(32)],["111222333","1".repeat(40),"2".repeat(40),"3".repeat(32)]]){
    const view=`https://einvoice.impact.gr/v/EL${issuer}-1422948749-${auth}-${token}`;
    const source=xml.replace("123456789",issuer).replace("<mark>",`<uid>${uid}</uid><authenticationCode>${auth}</authenticationCode><mark>`);
    const t=transport(source),r=await downloadInvoiceQr(view,"987654321",{...t,reader:async()=>({text:`12345 ${issuer} 987654321 0012`,pageCount:1})});
    assert.equal(r.header.supplierTaxId,issuer);
    assert.deepEqual(t.calls.map(x=>x.u),[view+"/myDATA",`https://einvoice.impact.gr/p/EL${issuer}/${uid}/${token}/pdf`]);
    for(const bad of [source.replace(auth,"f".repeat(40)),source.replace(`<uid>${uid}</uid>`,""),source.replace("987654321","999999999")]){
      const rejected=transport(bad);await assert.rejects(downloadInvoiceQr(view,"987654321",{...rejected,reader}));assert.equal(rejected.calls.length,1);
    }
  }
});

test("provider formats remain bounded and canonical S1/Impact URLs still work",async()=>{
  const view="https://einvoice.impact.gr/v/EL123456789-123-"+"d".repeat(40)+"-"+"e".repeat(32);
  for(const bad of [view.replace("impact.gr","s1ecos.gr"),view.replace("-123-","-abc-"),view.replace("-123-","-"+"1".repeat(21)+"-"),view+"/pdf",view+"?next=https://localhost",view.replace("https://","https://user@"),view.replace("impact.gr","impact.gr.attacker.test")])assert.throws(()=>invoiceQrUrl(bad));
  const canonical=url.replace("s1ecos.gr","impact.gr"),t=transport();
  await downloadInvoiceQr(canonical,"987654321",{...t,reader});assert.equal(t.calls[1].u,canonical+"/pdf");
  assert.equal(invoiceQrUrl(url.replace("https://","https:/")).href,url);
});

const epsilonUrl="https://epsilondigital.epsilonnet.gr/DocViewer/12345678-1234-1234-1234-123456789abc";
const epsilonAuth="acbd".repeat(10);
const epsilonUid="bcda".repeat(10);
const epsilonXml=xml.replace("<mark>",`<uid>${epsilonUid}</uid><authenticationCode>${epsilonAuth}</authenticationCode><mark>`);
// Deliberately no issuer VAT in text: this template's supplier header is an image.
const epsilonText=`${epsilonAuth.slice(0,33)} ${epsilonUid.slice(0,29)} 12345 987654321 0012`;
function epsilonTransport(source=epsilonXml,bytes=pdf){
  const calls=[];
  return {calls,fetcher:async(u,o)=>{calls.push({u,o});return new Response(new URL(u).searchParams.get("fileType")==="3"?source:bytes)}};
}
test("Epsilon DocViewer QR downloads paired myDATA/PDF and verifies image-header identity",async()=>{
  for(const input of [epsilonUrl,epsilonUrl+"/"]){
    const t=epsilonTransport();
    const r=await downloadInvoiceQr(input,"987654321",{...t,reader:async()=>({text:epsilonText,pageCount:1})});
    assert.deepEqual(t.calls.map(x=>x.u),[3,2].map(type=>`https://epsilondigital.epsilonnet.gr/filedocument/getfile?fileType=${type}&documentId=12345678-1234-1234-1234-123456789abc`));
    assert.ok(t.calls.every(x=>x.o.redirect==="error"));
    assert.equal(r.header.supplierTaxId,"123456789");assert.equal(r.header.documentNumber,"A-0012");assert.equal(r.header.totalGross,11.3);
    assert.equal(r.requiresHumanReview,true);assert.equal(r.header.paymentMethod,undefined);
  }
});
test("Epsilon rejects untrusted paths, malformed IDs, query payloads and credentials before network",async()=>{
  for(const bad of [epsilonUrl.replace("https:","http:"),epsilonUrl.replace("epsilonnet.gr","epsilonnet.gr.attacker.test"),epsilonUrl.replace("/DocViewer/","/p/"),epsilonUrl.replace(/abc$/,"xyz"),epsilonUrl+"?next=http://localhost",epsilonUrl+"#x",epsilonUrl+"/pdf",epsilonUrl.replace("https://","https://u:p@"),epsilonUrl.replace(".gr/",".gr:444/"),epsilonUrl.replace("epsilondigital.epsilonnet.gr","einvoice.impact.gr")]){
    const t=epsilonTransport();await assert.rejects(downloadInvoiceQr(bad,"987654321",{...t,reader}));assert.equal(t.calls.length,0);
  }
});
test("Epsilon requires both printed hash prefixes, MARK, recipient and number; does not relax other providers",async()=>{
  for(const bad of [epsilonText.replace(epsilonAuth.slice(0,33),"c".repeat(33)),epsilonText.replace(epsilonUid.slice(0,29),"d".repeat(29)),epsilonText.replace(epsilonAuth.slice(0,33),epsilonAuth.slice(0,27)),epsilonText.replace("12345 ","54321 "),epsilonText.replace("987654321","111111111"),epsilonText.replace("0012","0013"),"12345 123456789 987654321 0012"]){
    await assert.rejects(downloadInvoiceQr(epsilonUrl,"987654321",{...epsilonTransport(),reader:async()=>({text:bad,pageCount:1})}),/Epsilon/);
  }
  for(const source of [epsilonXml.replace("987654321","111111111"),epsilonXml.replace("<vatNumber>123456789</vatNumber>","<vatNumber>invalid</vatNumber>")]){
    const t=epsilonTransport(source);await assert.rejects(downloadInvoiceQr(epsilonUrl,"987654321",{...t,reader}));assert.equal(t.calls.length,1);
  }
  for(const source of [epsilonXml.replace(`<uid>${epsilonUid}</uid>`,""),epsilonXml.replace(`<authenticationCode>${epsilonAuth}</authenticationCode>`,""),epsilonXml.replace(epsilonUid,epsilonAuth)]){
    await assert.rejects(downloadInvoiceQr(epsilonUrl,"987654321",{...epsilonTransport(source),reader:async()=>({text:epsilonText,pageCount:1})}),/Epsilon/);
  }
  await assert.rejects(downloadInvoiceQr(url,"987654321",{...transport(),reader:async()=>({text:epsilonText,pageCount:1})}),/ΑΦΜ/);
  await assert.rejects(downloadInvoiceQr(epsilonUrl,"987654321",{...epsilonTransport(epsilonXml,Buffer.from("HTML challenge")),reader}),/PDF/);
  await assert.rejects(downloadInvoiceQr(epsilonUrl,"987654321",{...epsilonTransport(),reader:async()=>({text:epsilonText,pageCount:6})}),/5 σελίδες/);
});

const epsilonShortKey="12345678123412341234123456789abc";
const epsilonShortSources=[
  ["epsilondigital.epsilonnet.gr","8"],
  ["epsilondigital-3rdparte.epsilonnet.gr","169"],
];
test("Epsilon fd QR resolves only the observed host/token pair to paired files without redirects",async()=>{
  for(const [host,suffix] of epsilonShortSources){
    const input=`https://${host}/fd/${epsilonShortKey}:${suffix}`;
    for(const value of [input," \r\n"+input+"\r\n",input+"/"]){
      const t=epsilonTransport();
      const result=await downloadInvoiceQr(value,"987654321",{...t,reader:async()=>({text:epsilonText,pageCount:3})});
      assert.deepEqual(t.calls.map(x=>x.u),[3,2].map(type=>`https://${host}/filedocument/getfile?fileType=${type}&documentId=12345678-1234-1234-1234-123456789abc`));
      assert.ok(t.calls.every(x=>x.o.redirect==="error"));
      assert.equal(result.pageCount,3);assert.equal(result.header.documentNumber,"A-0012");
      assert.equal(result.requiresHumanReview,true);assert.equal(result.header.paymentMethod,undefined);
    }
  }
});
test("Epsilon fd rejects malformed tokens, wrong host suffixes and altered URLs before network",async()=>{
  const valid=`https://epsilondigital.epsilonnet.gr/fd/${epsilonShortKey}:8`;
  for(const bad of [
    valid.replace(":8",":169"),valid.replace(":8",":9"),valid.replace(":8",""),
    valid.replace(epsilonShortKey,epsilonShortKey.slice(1)),valid.replace(epsilonShortKey,"z".repeat(32)),
    valid.replace("epsilondigital.epsilonnet.gr","epsilondigital-3rdparte.epsilonnet.gr"),
    valid.replace(".gr/",".gr.attacker.test/"),valid.replace("https://","https://user:secret@"),
    valid.replace("https:","http:"),valid.replace(".gr/",".gr:444/"),valid+"?next=https://localhost",valid+"#x",
    valid.replace("/fd/","/fd/../fd/"),valid.replace("1234","12\n34"),valid.replace("1234","12\t34"),valid.replace("1234","12 34"),
    "x".repeat(4097)
  ]){
    const t=epsilonTransport();await assert.rejects(downloadInvoiceQr(bad,"987654321",{...t,reader}));assert.equal(t.calls.length,0);
  }
});
test("Epsilon fd preserves foreign-recipient, PDF identity and missing-original rejection",async()=>{
  for(const [host,suffix] of epsilonShortSources){
    const input=`https://${host}/fd/${epsilonShortKey}:${suffix}`;
    const foreign=epsilonTransport(epsilonXml.replace("987654321","111111111"));
    await assert.rejects(downloadInvoiceQr(input,"987654321",{...foreign,reader}));assert.equal(foreign.calls.length,1);
    await assert.rejects(downloadInvoiceQr(input,"987654321",{...epsilonTransport(),reader:async()=>({text:epsilonText.replace("12345","54321"),pageCount:1})}),/Epsilon/);
    await assert.rejects(downloadInvoiceQr(input,"987654321",{...epsilonTransport(epsilonXml,Buffer.from("Document not found.")),reader}),/PDF/);
    const missing=epsilonTransport();const fetcher=async(u,o)=>new URL(u).searchParams.get("fileType")==="2"?new Response("Document not found.",{status:404}):missing.fetcher(u,o);
    await assert.rejects(downloadInvoiceQr(input,"987654321",{fetcher,reader}),/πάροχος/);
    const r=await downloadInvoiceQr(input,"987654321",{...epsilonTransport(epsilonXml.replace("1.1","5.1")),reader:async()=>({text:epsilonText,pageCount:1})});
    assert.equal(r.header.documentType,"CREDIT_NOTE");assert.equal(r.header.paymentMethod,undefined);
  }
});

test("verification and interactive-provider QR give precise fallback without network or invented PDF",async()=>{
  for(const [input,provider] of [
    [" https://invoicelink.megasoft.gr/invoiceinspect/qr?QrCode=QUJDRA%3D%3D\r\n","Megasoft"],
    ["https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=QUJDRA%3d%3d","ΑΑΔΕ"]
  ]){
    const t=epsilonTransport();await assert.rejects(downloadInvoiceQr(input,"987654321",{...t,reader}),new RegExp(provider));assert.equal(t.calls.length,0);
  }
});
