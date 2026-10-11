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
