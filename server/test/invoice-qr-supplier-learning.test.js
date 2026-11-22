import test from "node:test";
import assert from "node:assert/strict";
import {canonicalAadeInvoiceQr,readStoredMyDataQr} from "../src/lib/invoice-qr-mydata.js";
import {learnVerifiedInvoiceQrSupplier,learnedInvoiceQrSupplierName} from "../src/lib/invoice-qr-supplier-learning.js";
import {createInvoiceQrHandler} from "../src/routes/commerce-invoice-qr.js";

const aadeQr="https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=QUJDRA%3D%3D";
const identity={companyId:"company-1",storeId:"store-diadoxou",recipientVat:"987654321",value:aadeQr};

test("official myDATA QR validation accepts full opaque token only, not arbitrary URLs",()=>{
  assert.equal(canonicalAadeInvoiceQr(aadeQr),aadeQr);
  for(const bad of [
    aadeQr.replace("https:","http:"),
    aadeQr.replace("mydatapi.aade.gr","evil.example"),
    aadeQr.replace("?q=","?other="),
    aadeQr+"#fragment",aadeQr+"&next=evil",
    aadeQr.replace("QUJDRA",""),"https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo",
    aadeQr.replace("https://","https://name@"),
    aadeQr.replace(".gr/",".gr:8443/"),
    "https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=abc%XY"
  ])assert.equal(canonicalAadeInvoiceQr(bad),null,bad);
});

test("stored AΑΔΕ QR returns selected store original and XML issuer name without payment",async()=>{
  let query=0,read=0;
  const db={$queryRaw:async(parts,...values)=>{
    query++;
    const sql=parts.join("?");
    assert.match(sql,/"companyId"/);
    assert.match(sql,/"storeId"/);
    assert.match(sql,/"counterpartVat"/);
    assert.deepEqual(values,["company-1","store-diadoxou","987654321",aadeQr]);
    return [{inboxId:"matched-inbox"}];
  }};
  const row={issuerVat:"123456789",counterpartVat:"987654321",
    mark:"4000123456",documentNumber:"999",series:"T",
    invoiceType:"1.1",issueDate:"2026-11-11",currency:"EUR",totalGross:13.56,
    rawPayload:{xml:"<issuer><vatNumber>123456789</vatNumber><name>ΠΡΟΜΗΘΕΥΤΗΣ &amp; ΣΙΑ</name></issuer>"},
    supplierName:"",contentData:"data:application/pdf;base64,XXXXX"};
  const result=await readStoredMyDataQr(db,identity,{
    readRow:async (_db,company,store,inbox)=>{read++;assert.deepEqual([company,store,inbox],["company-1","store-diadoxou","matched-inbox"]);return row},
    readPdf:async file=>{assert.equal(file,row);return {filename:"real-source.pdf",bytes:Buffer.from("%PDF-stub"),pageCount:2}}
  });
  assert.equal(query,1);assert.equal(read,1);
  assert.equal(result.header.supplierName,"ΠΡΟΜΗΘΕΥΤΗΣ & ΣΙΑ");
  assert.equal(result.header.supplierTaxId,"123456789");
  assert.equal(result.header.mark,"4000123456");
  assert.equal(result.inboxId,"matched-inbox");
  assert.equal(result.header.paymentMethod,undefined);
  assert.equal(result.requiresHumanReview,true);
});

test("AΑΔΕ QR not found in selected store refuses any other store or network fallback",async()=>{
  let networkCalls=0;
  const db={$queryRaw:async()=>[]};
  await assert.rejects(readStoredMyDataQr(db,identity,{readPdf:async()=>networkCalls++}),/δεν βρέθηκε/);
  assert.equal(networkCalls,0);
});

test("learned supplier QR format uses company/VAT and no store or unique QR tokens",async()=>{
  const writes=[],schemas=[];
  const db={
    $executeRawUnsafe:async sql=>{schemas.push(sql)},
    $executeRaw:async(parts,...values)=>{writes.push({sql:parts.join("?"),values})},
    $queryRaw:async(parts,...values)=>{assert.match(parts.join("?"),/"companyId"/);assert.deepEqual(values,["company-1","123456789","epsilon"]);return [{supplierName:"ΕΠΑΛΗΘΕΥΜΕΝΟΣ ΠΡΟΜΗΘΕΥΤΗΣ"}]}
  };
  for(let i=0;i<2;i++)assert.equal(await learnVerifiedInvoiceQrSupplier(db,{
    companyId:"company-1",supplierVat:"123456789",format:"epsilon",
    supplierName:"ΕΠΑΛΗΘΕΥΜΕΝΟΣ ΠΡΟΜΗΘΕΥΤΗΣ",mark:String(1000+i)
  }),true);
  assert.equal(schemas.length,1);
  assert.equal(writes.length,2);
  assert.deepEqual(writes[0].values,["company-1","123456789","epsilon","ΕΠΑΛΗΘΕΥΜΕΝΟΣ ΠΡΟΜΗΘΕΥΤΗΣ"]);
  assert.ok(!JSON.stringify(writes).includes("store-diadoxou"));
  assert.ok(!JSON.stringify(writes).includes("QUJDRA"));
  assert.equal(await learnedInvoiceQrSupplierName(db,{companyId:"company-1",supplierVat:"123456789",format:"epsilon"}),"ΕΠΑΛΗΘΕΥΜΕΝΟΣ ΠΡΟΜΗΘΕΥΤΗΣ");
  assert.equal(await learnVerifiedInvoiceQrSupplier(db,{companyId:"company-1",supplierVat:"123456789",format:"arbitrary-webpage",mark:"2000"}),false);
  assert.equal(writes.length,2);
});

test("POS QR scan reuses learned name, not a payment, and learns only verified invoice",async()=>{
  const calls=[];
  const database={store:{findFirst:async()=>({id:"store-diadoxou",companyId:"company-1",company:{taxId:"987654321"}})}};
  const header={supplierTaxId:"123456789",supplierName:"",mark:"4000123456",documentNumber:"T 999",documentDate:"2026-11-11",totalGross:13.56,documentType:"INVOICE"};
  const handler=createInvoiceQrHandler({
    database,allowOutbound:()=>{},
    readStored:async()=>({header,inboxId:"matched-inbox",pageCount:1,dataUrl:"data:application/pdf;base64,QQ=="}),
    download:async()=>assert.fail("No provider download for matched AΑΔΕ inbox QR"),
    lookupLearned:async(_db,identity)=>{calls.push({lookup:identity});return "ΚΕΝΤΡΙΚΗ ΕΠΩΝΥΜΙΑ"},
    learn:async(_db,identity)=>{calls.push({learn:identity});return true}
  });
  const res={status(){return this},set(){return this},json(v){this.body=v;return this}};
  await handler({user:{role:"OWNER",companyId:"company-1"},body:{storeId:"store-diadoxou",url:aadeQr}},res,error=>{throw error});
  assert.equal(res.body.header.supplierName,"ΚΕΝΤΡΙΚΗ ΕΠΩΝΥΜΙΑ");
  assert.equal(res.body.inboxId,"matched-inbox");
  assert.deepEqual(calls[0].lookup,{companyId:"company-1",supplierVat:"123456789",format:"aade-mydata"});
  assert.equal(calls[1].learn.mark,"4000123456");
  assert.equal(calls[1].learn.companyId,"company-1");
  assert.equal(res.body.header.settlementMode,undefined);
});
