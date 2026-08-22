const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;
const cleanTaxId=value=>String(value||'').replace(/\D/g,'');
const CANONICAL_VAT=[0,6,13,24];
const tolerance=(value,min=0.03,ratio=0.012)=>Math.max(min,Math.abs(Number(value||0))*ratio);

function nearestVat(raw){
  const n=Number(raw);if(!Number.isFinite(n)||n<0)return null;
  const ranked=CANONICAL_VAT.map(rate=>({rate,diff:Math.abs(n-rate)})).sort((a,b)=>a.diff-b.diff);
  return ranked[0]&&ranked[0].diff<=1.25?ranked[0]:null;
}
function pushCorrection(line,field,from,to,reason){
  if(from===to)return;
  line.autoCorrections=line.autoCorrections||[];
  line.autoCorrections.push({field,from,to,reason});
}
function pushReview(line,reason){
  line.reviewReasons=line.reviewReasons||[];
  if(!line.reviewReasons.includes(reason))line.reviewReasons.push(reason);
}
function parseLocaleNumber(text){
  const raw=String(text||'').trim();if(!raw)return null;
  let cleaned=raw.replace(/\s/g,'');
  if(cleaned.includes(',')&&cleaned.includes('.')){
    if(cleaned.lastIndexOf(',')>cleaned.lastIndexOf('.'))cleaned=cleaned.replace(/\./g,'').replace(',','.');
    else cleaned=cleaned.replace(/,/g,'');
  }else if(cleaned.includes(','))cleaned=cleaned.replace(',','.');
  const n=Number(cleaned);return Number.isFinite(n)?n:null;
}
function rawNumberTokens(rawText){
  const matches=String(rawText||'').match(/\d+(?:[.,]\d+)?/g)||[];
  return matches.map((raw,index)=>({raw,value:parseLocaleNumber(raw),index})).filter(x=>Number.isFinite(x.value));
}
function closeMoney(a,b,min=0.03,ratio=0.015){return Math.abs(Number(a||0)-Number(b||0))<=Math.max(min,Math.abs(Number(b||0))*ratio)}
function discountFactor(line){
  return [line?.discount1,line?.discount2,line?.discount3].reduce((factor,value)=>{
    const p=Number(value||0);return p>0&&p<100?factor*(1-p/100):factor;
  },1);
}
function hasVerifiedDiscount(line){
  const hasDiscount=[line?.discount1,line?.discount2,line?.discount3].some(value=>Number(value||0)>0&&Number(value||0)<100);
  if(!hasDiscount)return false;
  const source=String(line?.discountSource||'').toUpperCase();
  return source.includes('VERIFIED')||Number(line?.discountConfidence||0)>=85||Number(line?.discountAmount1||0)>0||Number(line?.discountAmount2||0)>0||Number(line?.discountAmount3||0)>0;
}
function recoverVerifiedDiscount(line,quantity,unitCost,net){
  if(quantity<=0||unitCost<=0||net<=0||!line?.rawText)return null;
  const gross=quantity*unitCost,tokens=rawNumberTokens(line.rawText);
  if(!tokens.length)return null;
  const grossIndexes=tokens.filter(t=>closeMoney(t.value,gross,0.04,0.012)).map(t=>t.index);
  const candidates=[];
  for(const gIndex of grossIndexes){
    for(let pIndex=gIndex+1;pIndex<Math.min(tokens.length,gIndex+5);pIndex++){
      const percent=tokens[pIndex].value;if(!(percent>0&&percent<100))continue;
      for(let aIndex=pIndex+1;aIndex<Math.min(tokens.length,pIndex+4);aIndex++){
        const amount=tokens[aIndex].value;if(!(amount>0&&amount<gross))continue;
        const expectedAmount=gross*percent/100;
        const after=gross-amount;
        if(!closeMoney(expectedAmount,amount,0.025,0.025)||!closeMoney(after,net,0.05,0.02))continue;
        candidates.push({percent:money4(percent),amount:money4(amount),score:Math.abs(expectedAmount-amount)+Math.abs(after-net),evidence:`gross ${tokens[gIndex].raw}; ${tokens[pIndex].raw}% / ${tokens[aIndex].raw}; net ${net}`});
      }
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.score-b.score);
  const best=candidates[0],second=candidates[1];
  if(second&&Math.abs(second.score-best.score)<0.0005&&Math.abs(second.percent-best.percent)>0.0001)return null;
  return best;
}
function sanitizeAzureDiscounts(line,quantity,unitCost,net){
  const current=[Number(line.discount1||0),Number(line.discount2||0),Number(line.discount3||0)];
  if(!current.some(v=>v>0))return;
  if(quantity<=0||unitCost<=0||net<=0)return;
  const expected=money2(quantity*unitCost*discountFactor(line));
  if(closeMoney(expected,net,0.05,0.02)||hasVerifiedDiscount(line))return;
  const old1=line.discount1||0,old2=line.discount2||0,old3=line.discount3||0;
  pushCorrection(line,'discount1',old1,0,'REJECTED_AZURE_DISCOUNT_FIELDS_NOT_MATCHING_LINE_MATH');
  pushCorrection(line,'discount2',old2,0,'REJECTED_AZURE_DISCOUNT_FIELDS_NOT_MATCHING_LINE_MATH');
  pushCorrection(line,'discount3',old3,0,'REJECTED_AZURE_DISCOUNT_FIELDS_NOT_MATCHING_LINE_MATH');
  line.discount1=0;line.discount2=0;line.discount3=0;
  const recovered=recoverVerifiedDiscount(line,quantity,unitCost,net);
  if(recovered){
    pushCorrection(line,'discount1',0,recovered.percent,'RECOVERED_FROM_AZURE_RAW_LINE_MATH');
    line.discount1=recovered.percent;line.discountAmount1=recovered.amount;
    line.discountAmount2=0;line.discountAmount3=0;
    line.discountSource='AZURE_RAW_LINE_MATH_VERIFIED';
    line.discountConfidence=99;
    line.discountEvidence=recovered.evidence;
  }else pushReview(line,'AZURE_DISCOUNT_FIELDS_REJECTED_REVIEW_REQUIRED');
}
function applyLearningContract(line){
  const code=String(line.supplierItemCode||line.code||'').trim();
  const price=Number(line.unitPrice||line.unitCost||0);
  const net=Number(line.netValue||line.netAmount||0);
  const qty=Number(line.quantity||0);
  line.supplierItemCode=code;
  line.code=line.code||code;
  line.unitPrice=price>0?money4(price):0;
  line.unitCost=Number(line.unitCost||0)>0?money4(line.unitCost):line.unitPrice;
  line.netValue=net>0?money2(net):0;
  line.netAmount=Number(line.netAmount||0)>0?money2(line.netAmount):line.netValue;
  line.netUnitCost=qty>0&&line.netValue>0?money4(line.netValue/qty):0;
  line.unitsPerPackage=Number(line.unitsPerPackage||0)>0?Number(line.unitsPerPackage):0;
  line.invoiceLearningContract='V2';
  return line;
}
function reconcileLine(input,index){
  const line={...input,autoCorrections:[...(input?.autoCorrections||[])],reviewReasons:[...(input?.reviewReasons||[])]};
  let quantity=Number(line.quantity||0),unitCost=Number(line.unitCost||line.unitPrice||0),net=Number(line.netAmount||line.netValue||0),tax=Number(line.azureTax||0),vat=Number(line.vatRate||0),gross=Number(line.grossAmount||0);

  sanitizeAzureDiscounts(line,quantity,unitCost,net);
  let factor=discountFactor(line);

  if(quantity>0&&unitCost<=0&&net>0&&factor>0){
    const derived=money4(net/(quantity*factor));
    if(derived>0){pushCorrection(line,'unitCost',line.unitCost||line.unitPrice||0,derived,'DERIVED_FROM_QTY_NET_DISCOUNTS');line.unitCost=unitCost=derived}
  }
  if(net<=0&&quantity>0&&unitCost>0&&factor>0){
    const derived=money2(quantity*unitCost*factor);
    if(derived>0){pushCorrection(line,'netAmount',line.netAmount||line.netValue||0,derived,'DERIVED_FROM_QTY_PRICE_DISCOUNTS');line.netAmount=net=derived}
  }

  // A verified discount is authoritative for the line economics. Azure may expose
  // the pre-discount Amount as NetAmount/GrossAmount while the raw row contains a
  // mathematically verified discount pair. Recompute net before VAT in that case.
  if(quantity>0&&unitCost>0&&hasVerifiedDiscount(line)){
    const discountedNet=money2(quantity*unitCost*discountFactor(line));
    if(discountedNet>0&&Math.abs(discountedNet-net)>0.02){
      pushCorrection(line,'netAmount',net,discountedNet,'VERIFIED_DISCOUNT_RECALCULATED_NET');
      line.netAmount=net=discountedNet;
    }
  }

  if(net>0&&tax>0){
    const derived=nearestVat(tax/net*100);
    if(derived&&(!CANONICAL_VAT.includes(Math.round(vat))||Number(line.azureTaxRateConfidence||0)<70)){
      pushCorrection(line,'vatRate',line.vatRate||0,derived.rate,'DERIVED_FROM_NET_AND_TAX');line.vatRate=vat=derived.rate;
    }
  }
  if(net>0&&vat>0&&tax<=0){
    const derivedTax=money2(net*vat/100);
    pushCorrection(line,'azureTax',line.azureTax||0,derivedTax,'DERIVED_FROM_NET_AND_VAT');line.azureTax=tax=derivedTax;
  }

  if(net>0&&CANONICAL_VAT.includes(Math.round(vat))&&vat>0){
    const expectedTax=money2(net*vat/100);
    if(tax<=0||Math.abs(tax-expectedTax)>0.02){
      pushCorrection(line,'azureTax',line.azureTax||0,expectedTax,'RECONCILED_FROM_VERIFIED_NET_AND_VAT');
      line.azureTax=tax=expectedTax;
    }
  }

  if(net>0){
    const expectedGross=money2(net+(tax>0?tax:(vat>0?net*vat/100:0)));
    if(expectedGross>0&&Math.abs(expectedGross-gross)>0.02){pushCorrection(line,'grossAmount',line.grossAmount||0,expectedGross,'NET_PLUS_TAX');line.grossAmount=gross=expectedGross}
  }

  factor=discountFactor(line);
  if(quantity>0&&unitCost>0&&net>0){
    const expectedNet=money2(quantity*unitCost*factor);
    const diff=Math.abs(expectedNet-net);
    if(diff<=tolerance(net,0.05,0.015)){
      line.mathVerified=true;
      line.expectedNetAmount=expectedNet;
      if(diff>0.02){
        pushCorrection(line,'netAmount',net,expectedNet,'QTY_PRICE_DISCOUNT_MATH');line.netAmount=net=expectedNet;
        if(vat>0){const expectedTax=money2(net*vat/100);if(Math.abs(tax-expectedTax)>0.02){pushCorrection(line,'azureTax',tax,expectedTax,'RECALCULATED_AFTER_NET_CORRECTION');line.azureTax=tax=expectedTax}}
        const expectedGross=money2(net+(tax>0?tax:(vat>0?net*vat/100:0)));if(expectedGross>0)line.grossAmount=gross=expectedGross;
      }
    }else{
      line.mathVerified=false;line.expectedNetAmount=expectedNet;line.netDifference=money2(net-expectedNet);pushReview(line,'NET_DOES_NOT_MATCH_QTY_PRICE_DISCOUNTS');
    }
  }else pushReview(line,'INSUFFICIENT_DATA_FOR_LINE_MATH');

  if(vat&&!CANONICAL_VAT.includes(Math.round(vat)))pushReview(line,'NON_CANONICAL_VAT_RATE');
  if(Number(line.confidence||0)<70)pushReview(line,'LOW_AZURE_CONFIDENCE');
  if(!String(line.description||'').trim())pushReview(line,'MISSING_DESCRIPTION');
  if(quantity<=0)pushReview(line,'MISSING_OR_INVALID_QUANTITY');

  line.autoVerified=line.reviewReasons.length===0&&Boolean(line.mathVerified)&&Number(line.confidence||0)>=70;
  line.reconciliationStatus=line.autoVerified?'AUTO_VERIFIED':line.autoCorrections.length?'AUTO_CORRECTED_REVIEW':'REVIEW';
  line.reconciliationSequence=index+1;
  return applyLearningContract(line);
}

export function reconcileAzureInvoice(parsed){
  const result={...parsed,supplier:{...(parsed?.supplier||{})}};
  const originalTaxId=String(result.supplier.taxId||'');const normalizedTaxId=cleanTaxId(originalTaxId);
  const headerCorrections=[];const headerReview=[];
  if(normalizedTaxId&&normalizedTaxId!==originalTaxId){result.supplier.taxId=normalizedTaxId;headerCorrections.push({field:'supplier.taxId',from:originalTaxId,to:normalizedTaxId,reason:'DIGITS_ONLY_NORMALIZATION'})}
  if(normalizedTaxId&&normalizedTaxId.length!==9)headerReview.push('SUPPLIER_TAX_ID_NOT_9_DIGITS');
  const originalNumber=String(result.documentNumber||'');const cleanNumber=originalNumber.trim().replace(/\s+/g,' ');
  if(cleanNumber!==originalNumber){result.documentNumber=cleanNumber;headerCorrections.push({field:'documentNumber',from:originalNumber,to:cleanNumber,reason:'WHITESPACE_NORMALIZATION'})}

  result.productLines=Array.isArray(parsed?.productLines)?parsed.productLines.map(reconcileLine):[];
  result.lines=result.productLines.map(line=>({text:line.rawText||[line.supplierItemCode,line.description,line.quantity,line.unit,line.unitPrice,line.netValue].filter(Boolean).join(' '),confidence:line.confidence}));
  const usableGross=result.productLines.filter(line=>Number(line.grossAmount||0)>0);
  const lineGrossSum=money2(usableGross.reduce((sum,line)=>sum+Number(line.grossAmount||0),0));
  const totalGross=Number(result.totalGross||0);
  let totalDifference=totalGross>0?money2(totalGross-lineGrossSum):0;
  const allLinesVerified=result.productLines.length>0&&result.productLines.every(line=>line.autoVerified);
  if(totalGross<=0&&lineGrossSum>0&&allLinesVerified){
    headerCorrections.push({field:'totalGross',from:result.totalGross||0,to:lineGrossSum,reason:'SUM_OF_AUTO_VERIFIED_LINES'});result.totalGross=lineGrossSum;totalDifference=0;
  }else if(totalGross>0&&lineGrossSum>0&&Math.abs(totalDifference)>tolerance(totalGross,0.10,0.015)){
    headerReview.push('INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM');
  }

  const correctedLines=result.productLines.filter(line=>line.autoCorrections?.length).length;
  const verifiedLines=result.productLines.filter(line=>line.autoVerified).length;
  const reviewLines=result.productLines.length-verifiedLines;
  result.reconciliation={
    engine:'MYWORKSTATION_DETERMINISTIC_V2',
    headerCorrections,
    headerReview,
    lineGrossSum,
    invoiceTotal:Number(result.totalGross||0),
    totalDifference,
    lineCount:result.productLines.length,
    correctedLines,
    verifiedLines,
    reviewLines,
    status:headerReview.length||reviewLines?'REVIEW_REQUIRED':(headerCorrections.length||correctedLines?'AUTO_CORRECTED':'AUTO_VERIFIED')
  };
  return result;
}
