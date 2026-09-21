const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const invoiceKey=value=>norm(value).replace(/^0+(?=\d)/,"");

function supplierMatches(document,supplier){
  const expectedTaxId=cleanTaxId(supplier?.taxId),documentTaxId=cleanTaxId(document?.supplierTaxId);
  if(expectedTaxId&&documentTaxId)return expectedTaxId===documentTaxId;
  const expectedName=norm(supplier?.name),documentName=norm(document?.supplierName);
  return Boolean(expectedName&&documentName&&(expectedName===documentName||(expectedName.length>=7&&documentName.length>=7&&(expectedName.includes(documentName)||documentName.includes(expectedName)))));
}

function learnedLine(line,index){
  if(String(line?.status||"").toUpperCase()!=="CONFIRMED")return null;
  const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitPrice??line?.unitCost??0);
  const discounts=[line?.discount1,line?.discount2,line?.discount3].map(value=>Math.max(0,Number(value||0)));
  const initialAmount=money4(quantity*unitCost);
  const calculatedNet=money4(discounts.reduce((amount,discount)=>amount*(1-discount/100),initialAmount));
  const declaredNet=Number(line?.netValue??line?.netAmount??0);
  if(declaredNet>0&&Math.abs(declaredNet-calculatedNet)>Math.max(.05,calculatedNet*.002))return null;
  const netAmount=declaredNet>0?money4(declaredNet):calculatedNet;
  const vatRate=Math.max(0,Number(line?.vatRate||0));
  if(!String(line?.description||line?.masterProductName||"").trim()||!(quantity>0&&unitCost>0&&netAmount>0)||![0,6,13,24].includes(vatRate))return null;
  let running=initialAmount;const discountAmounts=[];
  for(const discount of discounts){const amount=money4(running*discount/100);discountAmounts.push(amount);running=money4(running-amount)}
  if(Math.abs(running-netAmount)>.05)return null;
  const vatAmount=money4(netAmount*vatRate/100),grossAmount=money4(netAmount+vatAmount);
  return {
    rawText:String(line.rawText||[line.supplierItemCode,line.description].filter(Boolean).join(" ")),
    code:String(line.supplierItemCode||line.code||"").trim(),barcode:String(line.barcode||"").trim(),
    description:String(line.description||line.masterProductName||"").replace(/\s+/g," ").trim(),
    quantity,invoiceQuantity:quantity,unit:String(line.invoiceUnit||line.unit||"ΤΜΧ"),invoiceUnit:String(line.invoiceUnit||line.unit||"ΤΜΧ"),
    unitsPerPackage:Math.max(0,Number(line.unitsPerPackage||0)),unitCost,unitPrice:unitCost,packageUnitPrice:unitCost,
    retailPrice:Math.max(0,Number(line.retailPrice||0)),initialAmount,
    discount1:discounts[0],discount1Amount:discountAmounts[0],discountAmount1:discountAmounts[0],
    discount2:discounts[1],discount2Amount:discountAmounts[1],discountAmount2:discountAmounts[1],
    discount3:discounts[2],discount3Amount:discountAmounts[2],discountAmount3:discountAmounts[2],
    netAmount,netValue:netAmount,exciseTotal:0,taxableAmount:netAmount,vatRate,vatAmount,grossAmount,
    confidence:100,sourceColumnsVerified:true,quantitySource:"CENTRAL_LEARNING_EXACT_INVOICE_VERIFIED",
    discountSource:"CENTRAL_LEARNING_EXACT_INVOICE_VERIFIED",discountConfidence:100,
    discountEvidence:`Κεντρικά επιβεβαιωμένη γραμμή ${index+1} του ίδιου τιμολογίου`
  };
}

export function exactLearnedInvoiceCandidate(state,{supplier,documentNumber,totalGross,tolerance=.05}={}){
  const expectedNumber=invoiceKey(documentNumber),expectedGross=Number(totalGross||0);
  if(!expectedNumber)return null;
  const documents=(Array.isArray(state?.documents)?state.documents:[])
    .filter(document=>String(document?.status||"").toUpperCase()==="LEARNED")
    .filter(document=>supplierMatches(document,supplier)&&invoiceKey(document?.invoiceNo||document?.invoiceNumber)===expectedNumber)
    .sort((a,b)=>Date.parse(b?.updatedAt||b?.createdAt||0)-Date.parse(a?.updatedAt||a?.createdAt||0));
  for(const document of documents){
    const active=(Array.isArray(document?.lines)?document.lines:[]).filter(line=>String(line?.status||"").toUpperCase()!=="REJECTED");
    if(!active.length)continue;
    const lines=active.map(learnedLine);
    if(lines.some(line=>!line))continue;
    const learnedGross=money4(lines.reduce((sum,line)=>sum+line.grossAmount,0));
    if(expectedGross>0&&Math.abs(learnedGross-expectedGross)>tolerance)continue;
    const vatGroups=new Map();
    for(const line of lines){
      const current=vatGroups.get(line.vatRate)||{rate:line.vatRate,taxable:0,vat:0,gross:0};
      current.taxable=money4(current.taxable+line.netAmount);
      current.vat=money4(current.vat+line.vatAmount);
      current.gross=money4(current.gross+line.grossAmount);
      vatGroups.set(line.vatRate,current);
    }
    return {documentId:String(document.id||""),lines,vatSummary:[...vatGroups.values()].sort((a,b)=>a.rate-b.rate),learnedGross,difference:money4(learnedGross-(expectedGross>0?expectedGross:learnedGross))};
  }
  return null;
}
