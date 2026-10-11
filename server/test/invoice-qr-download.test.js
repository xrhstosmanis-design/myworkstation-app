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
