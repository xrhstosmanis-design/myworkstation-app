const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;

function outputText(response){
  if(typeof response?.output_text==='string'&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==='output_text'&&part.text)return part.text;
  return '';
}
function safeAmount(value){const n=Number(value||0);return Number.isFinite(n)&&n>0?money4(n):0}
function safePercent(value){const n=Number(value||0);return Number.isFinite(n)&&n>0&&n<100?money4(n):0}
function stamp(productLines,diagnostics){
  if(Array.isArray(productLines))for(const line of productLines){
    line.discountVerifierStatus=diagnostics.status;
    line.discountVerifierReason=diagnostics.reason;
    line.discountVerifierCandidates=diagnostics.candidates;
    line.discountVerifierAccepted=diagnostics.accepted;
    line.discountVerifierRawAccepted=diagnostics.rawAccepted||0;
    line.discountVerifierAiAccepted=diagnostics.aiAccepted||0;
    line.rawEconomicsAccepted=diagnostics.rawEconomicsAccepted||0;
  }
  return diagnostics;
}
function validateDiscountPairs(line,pairs){
  const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),net=Number(line?.netAmount||0);
  if(quantity<=0||unitCost<=0)return null;
  const grossBase=quantity*unitCost;let base=grossBase;const percents=[],amounts=[];
  for(const pair of pairs){
    let percent=safePercent(pair?.percent),amount=safeAmount(pair?.amount);
    if(!percent&&!amount){percents.push(0);amounts.push(0);continue}
    if(base<=0)return null;
    if(percent&&!amount)amount=money4(base*percent/100);
    else if(amount&&!percent)percent=safePercent(amount/base*100);
    if(!percent||!amount)return null;
    const expectedAmount=base*percent/100;
    if(Math.abs(expectedAmount-amount)>Math.max(0.025,Math.abs(amount)*0.025))return null;
    percents.push(percent);amounts.push(amount);base-=amount;
  }
  if(net>0&&Math.abs(base-net)>Math.max(0.05,net*0.02))return null;
  return {percents,amounts,grossBase,expectedNet:base};
}
function validatePrintedEconomics(candidate){
  const quantity=safeAmount(candidate?.printedQuantity),unitCost=safeAmount(candidate?.originalUnitPrice),initial=safeAmount(candidate?.initialAmount),net=safeAmount(candidate?.netAmount);
  const excise=Math.max(0,Number(candidate?.exciseTotal||0)),taxable=safeAmount(candidate?.taxableAmount),vatRate=Math.max(0,Number(candidate?.vatRate||0)),vatAmount=Math.max(0,Number(candidate?.vatAmount||0)),gross=safeAmount(candidate?.grossAmount);
  if(!(quantity>0&&unitCost>0&&initial>0&&net>0&&taxable>0&&gross>0)||![0,6,13,24].includes(vatRate))return null;
  if(Math.abs(quantity*unitCost-initial)>Math.max(.03,initial*.002))return null;
  const pairs=[{percent:candidate.discountPercent1,amount:candidate.discountAmount1},{percent:candidate.discountPercent2,amount:candidate.discountAmount2},{percent:candidate.discountPercent3,amount:candidate.discountAmount3}];
  let running=initial;const percents=[],amounts=[];
  for(const pair of pairs){
    const percent=Math.max(0,Number(pair.percent||0)),amount=Math.max(0,Number(pair.amount||0));
    if(percent>99.99)return null;
    // A printed percentage can have a zero-cent discount on a tiny line
    // (for example 7% of €0.02). Accept it only when rounding to cents is zero.
    if(amount>0&&percent===0)return null;
    if(percent>0&&amount===0&&running*percent/100>=.005)return null;
    if(percent>0&&Math.abs(running*percent/100-amount)>Math.max(.025,amount*.025))return null;
    percents.push(money4(percent));amounts.push(money4(amount));running-=amount;
  }
  if(Math.abs(running-net)>.03||Math.abs(net+excise-taxable)>.03||Math.abs(taxable*vatRate/100-vatAmount)>.04||Math.abs(taxable+vatAmount-gross)>.04)return null;
  return {quantity,unitCost,initial,net,excise,taxable,vatRate,vatAmount,gross,percents,amounts};
}

// A guide assembled from the first OCR pass can itself be incomplete.  The
// visual verifier therefore returns every physical row, not only the guided
// rows.  Accept a replacement table only when every row proves its complete
// arithmetic chain, the printed order is contiguous, the VAT footer agrees by
// rate and the aggregate agrees with the operator-confirmed invoice total.
// This lets a missing OCR row be recovered without copying data from an older
// invoice or guessing a balancing amount.
export function buildCompletePrintedTableCandidate(candidates,expectedGrossTotal,vatSummary=[]){
  const rows=Array.isArray(candidates)?candidates:[],expectedGross=Number(expectedGrossTotal||0);
  if(!rows.length||!(expectedGross>0))return null;
  const ordered=[...rows].sort((a,b)=>Number(a?.index||0)-Number(b?.index||0));
  if(ordered.some((row,index)=>Number(row?.index||0)!==index+1))return null;
  const rebuilt=[];
  for(const candidate of ordered){
    const code=String(candidate?.supplierCode||'').trim(),description=String(candidate?.description||'').replace(/\s+/g,' ').trim();
    const printed=validatePrintedEconomics(candidate),confidence=Number(candidate?.confidence||0);
    if(!code||!description||!printed||confidence<85)return null;
    const rawText=[code,description,candidate.printedUnit,printed.quantity,printed.unitCost,printed.initial,...printed.percents.flatMap((percent,index)=>[percent,printed.amounts[index]]),printed.net,printed.excise,printed.taxable,printed.vatRate,printed.vatAmount,printed.gross].join(' ');
    rebuilt.push({rawText,code,barcode:'',description,quantity:printed.quantity,invoiceQuantity:printed.quantity,unit:String(candidate.printedUnit||'').trim()||'ΤΜΧ',invoiceUnit:String(candidate.printedUnit||'').trim()||'ΤΜΧ',unitCost:printed.unitCost,unitPrice:printed.unitCost,packageUnitPrice:printed.unitCost,initialAmount:money4(printed.initial),discount1:printed.percents[0],discount1Amount:printed.amounts[0],discountAmount1:printed.amounts[0],discount2:printed.percents[1],discount2Amount:printed.amounts[1],discountAmount2:printed.amounts[1],discount3:printed.percents[2],discount3Amount:printed.amounts[2],discountAmount3:printed.amounts[2],netAmount:money4(printed.net),netValue:money4(printed.net),exciseTotal:money4(printed.excise),taxableAmount:money4(printed.taxable),vatRate:printed.vatRate,vatAmount:money4(printed.vatAmount),grossAmount:money4(printed.gross),confidence,sourceColumnsVerified:true,quantitySource:'AI_COMPLETE_PRINTED_TABLE_VERIFIED',discountSource:'AI_COMPLETE_PRINTED_TABLE_VERIFIED',discountConfidence:confidence,discountEvidence:String(candidate?.evidence||'').slice(0,180)});
  }
  const gross=money4(rebuilt.reduce((sum,line)=>sum+line.grossAmount,0));
  if(Math.abs(gross-expectedGross)>.05)return null;
  const summaries=(Array.isArray(vatSummary)?vatSummary:[]).filter(row=>Number(row?.taxable||0)>0||Number(row?.vat||0)>0||Number(row?.gross||0)>0);
  if(!summaries.length||Math.abs(summaries.reduce((sum,row)=>sum+Number(row?.gross||0),0)-expectedGross)>.05)return null;
  for(const summary of summaries){
    const rate=Number(summary?.rate||0),group=rebuilt.filter(line=>Number(line.vatRate)===rate);
    if(!group.length)return null;
    const taxable=group.reduce((sum,line)=>sum+line.taxableAmount,0),vat=group.reduce((sum,line)=>sum+line.vatAmount,0);
    if(Math.abs(taxable-Number(summary.taxable||0))>.05||Math.abs(vat-Number(summary.vat||0))>.06)return null;
  }
  return rebuilt;
}
function linePairs(line){return [
  {percent:line?.discount1,amount:line?.discount1Amount??line?.discountAmount1},
  {percent:line?.discount2,amount:line?.discount2Amount??line?.discountAmount2},
  {percent:line?.discount3,amount:line?.discount3Amount??line?.discountAmount3}
]}
function applyValidatedPairs(line,validated){
  [line.discount1,line.discount2,line.discount3]=validated.percents;
  [line.discount1Amount,line.discount2Amount,line.discount3Amount]=validated.amounts;
  [line.discountAmount1,line.discountAmount2,line.discountAmount3]=validated.amounts;
}
function parseLocaleNumber(text){
  const raw=String(text||'').trim();
  if(!raw)return null;
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
function normalizeSupplierCode(value){
  const code=String(value??'').trim().replace(/[^0-9A-Za-zΑ-Ωα-ω]/g,'').toUpperCase();
  // Vision commonly renders a numeric printed code without its display-only
  // leading zeroes (0168 -> 168, 00009 -> 9). Canonicalize only all-numeric
  // codes; alphanumeric supplier identities retain every character.
  return /^\d+$/.test(code)?code.replace(/^0+(?=\d)/,''):code;
}

function deriveEconomicsFromAzureContent(line){
  const quantity=Number(line?.quantity||0),net=Number(line?.netAmount||0);
  if(quantity<=0||net<=0||!line?.rawText)return null;
  const tokens=rawNumberTokens(line.rawText);if(tokens.length<3)return null;
  const qtyPositions=tokens.filter(t=>Math.abs(t.value-quantity)<0.0001).map(t=>t.index);
  if(!qtyPositions.length)return null;
  const candidates=[];
  for(const qIndex of qtyPositions){
    for(let pIndex=qIndex+1;pIndex<Math.min(tokens.length,qIndex+8);pIndex++){
      const price=tokens[pIndex].value;if(!(price>0&&price<100000))continue;
      const grossBase=quantity*price;
      if(grossBase+0.05<net)continue;
      // Strongest case: an explicit initial/gross line value after the price equals qty × price.
      const grossMatches=[];
      for(let gIndex=pIndex+1;gIndex<Math.min(tokens.length,pIndex+5);gIndex++)if(closeMoney(tokens[gIndex].value,grossBase,0.04,0.012))grossMatches.push(gIndex);
      if(!grossMatches.length){
        // No-discount line: qty × price itself may equal the Azure Amount/net.
        if(closeMoney(grossBase,net,0.05,0.015))candidates.push({price,grossBase,score:Math.abs(grossBase-net),qIndex,pIndex,gIndex:-1,pairs:[],evidence:`qty ${tokens[qIndex].raw} × price ${tokens[pIndex].raw} = net ${net}`});
        continue;
      }
      for(const gIndex of grossMatches){
        // No discount even with explicit gross token.
        if(closeMoney(grossBase,net,0.05,0.015))candidates.push({price,grossBase,score:Math.abs(grossBase-net),qIndex,pIndex,gIndex,pairs:[],evidence:`${tokens[qIndex].raw} × ${tokens[pIndex].raw} ≈ ${tokens[gIndex].raw}`});
        // One discount pair: gross × percent = discount amount and gross - discount = net.
        for(let pctIndex=gIndex+1;pctIndex<Math.min(tokens.length,gIndex+5);pctIndex++){
          const percent=tokens[pctIndex].value;if(!(percent>0&&percent<100))continue;
          for(let amountIndex=pctIndex+1;amountIndex<Math.min(tokens.length,pctIndex+4);amountIndex++){
            const amount=tokens[amountIndex].value;if(!(amount>0&&amount<grossBase))continue;
            const expectedDiscount=grossBase*percent/100;
            const after=grossBase-amount;
            if(!closeMoney(expectedDiscount,amount,0.025,0.025)||!closeMoney(after,net,0.05,0.02))continue;
            const score=Math.abs(expectedDiscount-amount)+Math.abs(after-net)+(pIndex-qIndex)*0.0001;
            candidates.push({price,grossBase,score,qIndex,pIndex,gIndex,pairs:[{percent:money4(percent),amount:money4(amount)}],evidence:`${tokens[qIndex].raw} × ${tokens[pIndex].raw} = ${tokens[gIndex].raw}; έκπτωση ${tokens[pctIndex].raw}% / ${tokens[amountIndex].raw}; net ${net}`});
          }
        }
      }
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.score-b.score||a.qIndex-b.qIndex||a.pIndex-b.pIndex);
  const best=candidates[0];
  const second=candidates[1];
  if(second&&Math.abs(second.score-best.score)<0.0005&&Math.abs(second.price-best.price)>0.0001)return null;
  return best;
}
function applyRawContentEconomics(productLines,diagnostics){
  for(const line of productLines){
    const hasDiscount=[line?.discount1,line?.discount2,line?.discount3,line?.discount1Amount,line?.discount2Amount,line?.discount3Amount].some(value=>Number(value||0)>0);
    if(Number(line.unitCost||0)>0&&!line.azureUnitCostDerivedFromNet&&hasDiscount)continue;
    const derived=deriveEconomicsFromAzureContent(line);if(!derived)continue;
    line.unitCost=money4(derived.price);
    line.unitPrice=money4(derived.price);
    line.rawEconomicsSource='AZURE_CONTENT_MATH_VERIFIED';
    line.rawEconomicsConfidence=99;
    line.rawEconomicsEvidence=derived.evidence;
    if(derived.pairs.length&&!(Number(line.discount1||0)>0||Number(line.discount2||0)>0||Number(line.discount3||0)>0)){
      line.discount1=derived.pairs[0].percent;line.discount1Amount=derived.pairs[0].amount;line.discountAmount1=derived.pairs[0].amount;
      line.discount2=0;line.discount2Amount=0;line.discountAmount2=0;line.discount3=0;line.discount3Amount=0;line.discountAmount3=0;
      line.discountSource='AZURE_CONTENT_MATH_VERIFIED';line.discountConfidence=99;line.discountEvidence=derived.evidence;
      diagnostics.accepted+=1;diagnostics.rawAccepted+=1;
    }
    diagnostics.rawEconomicsAccepted+=1;
  }
}
function derivePairsFromAzureContent(line){
  const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),net=Number(line?.netAmount||0);
  if(quantity<=0||unitCost<=0||net<=0||!line?.rawText)return null;
  const grossBase=quantity*unitCost,tokens=rawNumberTokens(line.rawText);
  if(!tokens.length)return null;
  const candidates=[];
  for(let i=0;i<tokens.length;i++){
    const p=tokens[i].value;if(!(p>0&&p<100))continue;
    for(let j=i+1;j<tokens.length;j++){
      const a=tokens[j].value;if(!(a>0&&a<grossBase))continue;
      const expected=grossBase*p/100;
      const amountError=Math.abs(expected-a);
      const netError=Math.abs((grossBase-a)-net);
      if(amountError<=Math.max(0.025,a*0.025)&&netError<=Math.max(0.05,net*0.02)){
        candidates.push({percent:money4(p),amount:money4(a),score:amountError+netError,pIndex:i,aIndex:j,evidence:`${tokens[i].raw} / ${tokens[j].raw}`});
      }
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.score-b.score||a.pIndex-b.pIndex||a.aIndex-b.aIndex);
  const best=candidates[0];
  const validated=validateDiscountPairs(line,[best,{percent:0,amount:0},{percent:0,amount:0}]);
  return validated?{validated,evidence:best.evidence}:null;
}
function applyRawContentDiscounts(productLines,diagnostics){
  for(const line of productLines){
    if(Number(line.discount1||0)>0||Number(line.discount2||0)>0||Number(line.discount3||0)>0)continue;
    const derived=derivePairsFromAzureContent(line);if(!derived)continue;
    applyValidatedPairs(line,derived.validated);
    line.discountSource='AZURE_CONTENT_MATH_VERIFIED';
    line.discountConfidence=99;
    line.discountEvidence=derived.evidence;
    diagnostics.accepted+=1;diagnostics.rawAccepted+=1;
  }
}

function applySiblingDiscountConsensus(productLines,diagnostics){
  const verifiedPercents=[];
  for(const line of productLines){
    const validated=validateDiscountPairs(line,linePairs(line));
    if(!validated)continue;
    const active=validated.percents.filter(value=>value>0);
    if(active.length===1)verifiedPercents.push(active[0]);
  }
  const unique=[...new Set(verifiedPercents.map(value=>money4(value)))];
  if(!unique.length||Math.max(...unique)-Math.min(...unique)>0.1)return;
  const percent=[...unique].sort((a,b)=>Math.abs(a-Math.round(a))-Math.abs(b-Math.round(b))||a-b)[0];
  for(const line of productLines){
    const active=linePairs(line).filter(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0);
    if(active.length>1)continue;
    const currentPercent=active.length?safePercent(active[0].percent):0;
    if(currentPercent&&Math.abs(currentPercent-percent)>0.1)continue;
    if(currentPercent&&Math.abs(currentPercent-percent)<=0.0001&&validateDiscountPairs(line,linePairs(line)))continue;
    const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),net=Number(line?.netAmount||0),base=quantity*unitCost;
    if(!(quantity>0&&unitCost>0&&net>0&&net<base))continue;
    const amount=money4(base*percent/100);
    const validated=validateDiscountPairs(line,[{percent,amount},{percent:0,amount:0},{percent:0,amount:0}]);
    if(!validated)continue;
    applyValidatedPairs(line,validated);
    line.discountSource='SIBLING_PERCENT_MATH_VERIFIED';
    line.discountConfidence=99;
    line.discountEvidence=`Ίδιο επαληθευμένο ποσοστό ${percent}% στο παραστατικό και συμφωνία καθαρής αξίας`;
    if(!currentPercent||Math.abs(currentPercent-percent)>0.0001){diagnostics.accepted+=1;diagnostics.rawAccepted+=1}
  }
}

function repairScaledQuantityDiscountAmbiguity(productLines,diagnostics){
  // A doubled quantity and a correspondingly inflated discount can reproduce
  // the exact same net amount (24 @ 31% == 48 @ 65.5%).  Total reconciliation
  // therefore cannot distinguish the two.  Resolve only when another row in
  // the same printed table independently establishes the same unit price and
  // normal discount, and the alternative arithmetic is exact.
  for(const line of productLines){
    const pairs=linePairs(line),active=pairs.filter(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0);
    if(active.length!==1)continue;
    const currentPercent=safePercent(active[0].percent),quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),net=Number(line?.netAmount||0);
    if(!(currentPercent>50&&quantity>0&&Number.isInteger(quantity)&&quantity%2===0&&unitCost>0&&net>0))continue;
    const halfQuantity=quantity/2;
    const siblingPercents=productLines.filter(other=>other!==line&&Math.abs(Number(other?.unitCost||0)-unitCost)<=0.0001)
      .flatMap(other=>linePairs(other).map(pair=>safePercent(pair.percent)).filter(percent=>percent>0&&percent<50));
    const unique=[...new Set(siblingPercents.map(percent=>money4(percent)))];
    if(unique.length!==1)continue;
    const percent=unique[0],base=halfQuantity*unitCost,amount=money4(base*percent/100);
    if(Math.abs((base-amount)-net)>Math.max(.03,net*.002))continue;
    const validated=validateDiscountPairs({...line,quantity:halfQuantity},[{percent,amount},{percent:0,amount:0},{percent:0,amount:0}]);
    if(!validated)continue;
    line.quantity=halfQuantity;line.invoiceQuantity=halfQuantity;line.quantitySource='SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED';
    applyValidatedPairs(line,validated);
    line.initialAmount=money4(base);
    line.discountSource='SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED';line.discountConfidence=99;
    line.discountEvidence=`Διόρθωση ισοδύναμης κλίμακας: ${halfQuantity} τεμ. με ${percent}% από ίδια τιμή/έκπτωση γειτονικής γραμμής`;
    diagnostics.scaledQuantityAmbiguitiesRepaired=Number(diagnostics.scaledQuantityAmbiguitiesRepaired||0)+1;
  }
}

function repairMantzilasCode00009PackAmbiguity(productLines,diagnostics,supplierRule){
  if(supplierRule!=="MANTZILAS")return;
  for(const line of productLines){
    if(normalizeSupplierCode(line?.code)!=="9")continue;
    const source=String(`${line?.description||""} ${line?.rawText||""}`).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    if(!/COCA\s*COLA\s*ZERO/.test(source)||!/(?:X|Χ)\s*24\s*(?:PACK|PK|TEM|TMX|ΤΕΜ|ΤΜΧ)/.test(source))continue;
    const pairs=linePairs(line),active=pairs.filter(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0);
    if(active.length!==1)continue;
    const currentPercent=safePercent(active[0].percent),quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),net=Number(line?.netAmount||0);
    if(Math.abs(currentPercent-65.5)>.05||![2,48].includes(quantity)||!(unitCost>0&&net>0)||!validateDiscountPairs(line,pairs))continue;
    const correctedQuantity=quantity/2,base=correctedQuantity*unitCost;
    const inferredPercent=(1-net/base)*100;
    if(Math.abs(inferredPercent-31)>.1)continue;
    const percent=31,amount=money4(base*percent/100);
    const validated=validateDiscountPairs({...line,quantity:correctedQuantity},[{percent,amount},{percent:0,amount:0},{percent:0,amount:0}]);
    if(!validated)continue;
    line.quantity=correctedQuantity;line.invoiceQuantity=correctedQuantity;line.quantitySource='MANTZILAS_CODE_00009_PACK24_SCALE_VERIFIED';
    applyValidatedPairs(line,validated);
    line.initialAmount=money4(base);
    line.discountSource='MANTZILAS_CODE_00009_PACK24_SCALE_VERIFIED';line.discountConfidence=99;
    line.discountEvidence=`Κωδικός 00009 COCA COLA ZERO x24: ${correctedQuantity} × ${money4(unitCost)} με 31% αναπαράγει ακριβώς net ${money4(net)}`;
    diagnostics.mantzilasCode00009AmbiguitiesRepaired=Number(diagnostics.mantzilasCode00009AmbiguitiesRepaired||0)+1;
  }
}

export async function verifyInvoiceDiscounts({contentData,mimeType,filename,productLines,apiKey,model,timeoutMs=0,reverifyAll=false,expectedGrossTotal=0,supplierRule=""}){
  const diagnostics={called:false,status:'SKIPPED',reason:'',candidates:0,accepted:0,rawAccepted:0,rawEconomicsAccepted:0,aiAccepted:0,rejectedLowConfidence:0,rejectedMath:0};
  if(!Array.isArray(productLines)){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}
  // A complete-table reread must also work when the first OCR pass found no
  // product rows at all. The image remains the sole evidence and the result
  // is accepted only through buildCompletePrintedTableCandidate below.
  if(!productLines.length&&!reverifyAll){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}
  const originalLines=reverifyAll?productLines.map(line=>JSON.parse(JSON.stringify(line))):[];

  // Azure often leaves UnitPrice/Discount empty on Greek invoices even though the full line content contains them.
  // Recover them only when quantity × price and discount arithmetic prove the candidate values.
  applyRawContentEconomics(productLines,diagnostics);
  applyRawContentDiscounts(productLines,diagnostics);
  // Structured extraction is evidence, not arithmetic truth. Reject a mapped
  // price/discount set unless qty × original price - discounts reproduces net.
  for(const line of productLines){
    if(!linePairs(line).some(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0))continue;
    const validated=validateDiscountPairs(line,linePairs(line));
    if(validated){applyValidatedPairs(line,validated);line.discountSource=line.discountSource||'AI_STRUCTURED_MATH_VERIFIED';continue}
    line.discount1=0;line.discount2=0;line.discount3=0;
    line.discount1Amount=0;line.discount2Amount=0;line.discount3Amount=0;
    line.discountAmount1=0;line.discountAmount2=0;line.discountAmount3=0;
    diagnostics.rejectedMath+=1;
  }
  applySiblingDiscountConsensus(productLines,diagnostics);
  const unresolved=productLines.length
    ?productLines.map((line,index)=>({line,index})).filter(({line})=>reverifyAll||!(Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0))
    :reverifyAll?[{line:{},index:0}]:[];
  if(!unresolved.length){diagnostics.status='OK';diagnostics.reason='AZURE_CONTENT_DISCOUNTS_VERIFIED';return stamp(productLines,diagnostics)}
  if(!apiKey){diagnostics.reason=diagnostics.rawAccepted>0?'PARTIAL_AZURE_CONTENT_NO_OPENAI_KEY':'NO_OPENAI_KEY';return stamp(productLines,diagnostics)}
  if(!contentData){diagnostics.reason='NO_DOCUMENT';return stamp(productLines,diagnostics)}

  diagnostics.called=true;
  const filePart=mimeType==='application/pdf'?{type:'input_file',filename:filename||'invoice.pdf',file_data:String(contentData).split(',').pop()}:{type:'input_image',image_url:contentData,detail:'high'};
  const guide=unresolved.map(({line,index})=>reverifyAll?`${index+1}. ${line.code||''} | ${line.description||''}`:`${index+1}. ${line.code||''} | ${line.description||''} | qty=${line.quantity||0} | price=${line.unitCost||0} | net=${line.netAmount||0} | azureContent=${line.rawText||''}`).join('\n');
  const reconciliationAnchor=Number(expectedGrossTotal||0);
  const guideGross=money4(productLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
  const guideDifference=reconciliationAnchor>0?money4(reconciliationAnchor-guideGross):0;
  const vatSummaryItem={type:'object',additionalProperties:false,properties:{rate:{type:'number',enum:[0,6,13,24]},taxable:{type:'number',minimum:0},vat:{type:'number',minimum:0},gross:{type:'number',minimum:0}},required:['rate','taxable','vat','gross']};
  const schema={type:'object',additionalProperties:false,properties:{discounts:{type:'array',items:{type:'object',additionalProperties:false,properties:{index:{type:'integer',minimum:1},supplierCode:{type:'string'},description:{type:'string'},printedQuantity:{type:'number',minimum:0},printedUnit:{type:'string'},originalUnitPrice:{type:'number',minimum:0},initialAmount:{type:'number',minimum:0},discountPercent1:{type:'number',minimum:0,maximum:99.99},discountAmount1:{type:'number',minimum:0},discountPercent2:{type:'number',minimum:0,maximum:99.99},discountAmount2:{type:'number',minimum:0},discountPercent3:{type:'number',minimum:0,maximum:99.99},discountAmount3:{type:'number',minimum:0},netAmount:{type:'number',minimum:0},exciseTotal:{type:'number',minimum:0},taxableAmount:{type:'number',minimum:0},vatRate:{type:'number',enum:[0,6,13,24]},vatAmount:{type:'number',minimum:0},grossAmount:{type:'number',minimum:0},confidence:{type:'number',minimum:0,maximum:100},evidence:{type:'string'}},required:['index','supplierCode','description','printedQuantity','printedUnit','originalUnitPrice','initialAmount','discountPercent1','discountAmount1','discountPercent2','discountAmount2','discountPercent3','discountAmount3','netAmount','exciseTotal','taxableAmount','vatRate','vatAmount','grossAmount','confidence','evidence']}},vatSummary:{type:'array',maxItems:4,items:vatSummaryItem}},required:['discounts','vatSummary']};
  const prompt=`Διάβασε ΟΛΕΣ τις ορατές φυσικές γραμμές του πίνακα αυστηρά οριζόντια, ακόμη και αν κάποια λείπει από τον παρακάτω προσωρινό οδηγό. Αρίθμησέ τες στο index συνεχόμενα 1..Ν με βάση την πραγματική τυπωμένη σειρά. Για κάθε γραμμή αντέγραψε υποχρεωτικά τον τυπωμένο κωδικό στο supplierCode και ολόκληρη την περιγραφή στο description. Ο οδηγός είναι μόνο βοήθημα ταυτότητας και μπορεί να είναι ελλιπής ή λάθος. Μην επαναλάβεις φυσική γραμμή και μην μεταφέρεις αριθμούς από διπλανή γραμμή. Επέστρεψε όλη την τυπωμένη αριθμητική αλυσίδα: ποσότητα, Μ.Μ., αρχική τιμή μονάδας, αρχική αξία, έως τρία ζεύγη ποσοστού/ποσού έκπτωσης, καθαρή αξία μετά την έκπτωση, ΕΦΚ, φορολογητέα αξία, συντελεστή ΦΠΑ, ποσό ΦΠΑ και τελική αξία. Μη συμπληρώνεις έκπτωση όταν στο έντυπο είναι 0. Όλες οι τιμές πρέπει να διαβαστούν ξανά από την εικόνα. Στο vatSummary αντέγραψε κάθε ορατή γραμμή της ΑΝΑΛΥΣΗΣ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ως rate, φορολογητέα αξία, ΦΠΑ και συνολική αξία. Βάλε 0 μόνο όταν πραγματικά δεν φαίνεται.

${reconciliationAnchor>0?`ΥΠΟΧΡΕΩΤΙΚΟΣ ΕΛΕΓΧΟΣ ΠΛΗΡΟΤΗΤΑΣ: Το ανεξάρτητα επιβεβαιωμένο τελικό πληρωτέο ποσό είναι ${reconciliationAnchor.toFixed(2)} €. Ο προσωρινός οδηγός αθροίζει ${guideGross.toFixed(2)} € και διαφέρει κατά ${Math.abs(guideDifference).toFixed(2)} €. Πριν επιστρέψεις JSON, μέτρησε οπτικά όλες τις φυσικές σειρές προϊόντων και άθροισε τα grossAmount που διάβασες. Το άθροισμα πρέπει να συμφωνεί με ${reconciliationAnchor.toFixed(2)} € εντός 0,05 € και οι ομάδες vatSummary πρέπει να αναπαράγουν το ίδιο τελικό ποσό. Αν δεν συμφωνεί, ξανακοίτα ολόκληρο τον πίνακα για παραλειφθείσα σειρά ή αριθμούς που μεταφέρθηκαν από διπλανή σειρά. Μην επινοήσεις γραμμή ή ποσό μόνο για να κλείσει η διαφορά.`:""}

ΠΡΟΣΩΡΙΝΟΣ ΟΔΗΓΟΣ (ενδέχεται να λείπουν σειρές):
${guide}`;
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},...(Number(timeoutMs)>0?{signal:AbortSignal.timeout(Number(timeoutMs))}:{}),body:JSON.stringify({model:model||'gpt-5',reasoning:{effort:'minimal'},input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],text:{format:{type:'json_schema',name:'invoice_discount_pairs',strict:true,schema}}})});
    if(!response.ok){diagnostics.status='FAILED';diagnostics.reason=`HTTP_${response.status}`;console.warn('Discount verifier failed:',response.status,await response.text().catch(()=>''));return stamp(productLines,diagnostics)}
    const text=outputText(await response.json());if(!text){diagnostics.status='FAILED';diagnostics.reason='EMPTY_OUTPUT';return stamp(productLines,diagnostics)}
    const parsed=JSON.parse(text),candidates=Array.isArray(parsed?.discounts)?parsed.discounts:[];diagnostics.candidates=candidates.length;
    diagnostics.vatSummary=Array.isArray(parsed?.vatSummary)?parsed.vatSummary:[];
    const acceptedPrintedIndexes=new Set();
    for(const candidate of candidates){
      const requestedIndex=Number(candidate?.index||0)-1;
      let targetIndex=requestedIndex;
      if(reverifyAll){
        const candidateCode=normalizeSupplierCode(candidate?.supplierCode);
        const matchingIndexes=productLines.map((line,index)=>normalizeSupplierCode(line?.code)===candidateCode?index:-1).filter(index=>index>=0);
        if(!candidateCode||matchingIndexes.length!==1||matchingIndexes[0]!==requestedIndex||acceptedPrintedIndexes.has(matchingIndexes[0])){diagnostics.rejectedMath+=1;continue}
        targetIndex=matchingIndexes[0];
      }
      const line=productLines[targetIndex];if(!line)continue;
      if(!reverifyAll&&(Number(line.discount1||0)>0||Number(line.discount2||0)>0||Number(line.discount3||0)>0))continue;
      const confidence=Number(candidate?.confidence||0);if(confidence<85){diagnostics.rejectedLowConfidence+=1;continue}
      if(reverifyAll){
        const printed=validatePrintedEconomics(candidate);if(!printed){diagnostics.rejectedMath+=1;continue}
        line.quantity=printed.quantity;line.invoiceQuantity=printed.quantity;line.quantitySource='AI_PRINTED_ROW_FULL_MATH_VERIFIED';
        if(String(candidate.printedUnit||'').trim()){line.unit=String(candidate.printedUnit).trim();line.invoiceUnit=String(candidate.printedUnit).trim()}
        line.unitCost=printed.unitCost;line.unitPrice=printed.unitCost;line.packageUnitPrice=printed.unitCost;line.initialAmount=money4(printed.initial);
        [line.discount1,line.discount2,line.discount3]=printed.percents;[line.discount1Amount,line.discount2Amount,line.discount3Amount]=printed.amounts;
        [line.discountAmount1,line.discountAmount2,line.discountAmount3]=printed.amounts;
        line.netAmount=money4(printed.net);line.netValue=money4(printed.net);line.exciseTotal=money4(printed.excise);line.taxableAmount=money4(printed.taxable);
        line.vatRate=printed.vatRate;line.vatAmount=money4(printed.vatAmount);line.grossAmount=money4(printed.gross);line.sourceColumnsVerified=true;
        line.discountSource='AI_PRINTED_ROW_FULL_MATH_VERIFIED';line.discountConfidence=confidence;line.discountEvidence=String(candidate?.evidence||'').slice(0,180);
        acceptedPrintedIndexes.add(targetIndex);diagnostics.accepted+=1;diagnostics.aiAccepted+=1;continue;
      }
      const pairs=[{percent:candidate.discountPercent1,amount:candidate.discountAmount1},{percent:candidate.discountPercent2,amount:candidate.discountAmount2},{percent:candidate.discountPercent3,amount:candidate.discountAmount3}];
      if(!pairs.some(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0))continue;
      const originalUnitPrice=safeAmount(candidate.originalUnitPrice),printedQuantity=safeAmount(candidate.printedQuantity),validationLine={...line,...(printedQuantity>0?{quantity:printedQuantity}:{}),...(originalUnitPrice>0?{unitCost:originalUnitPrice}:{})};
      const validated=validateDiscountPairs(validationLine,pairs);if(!validated){diagnostics.rejectedMath+=1;continue}
      if(printedQuantity>0){line.quantity=printedQuantity;line.invoiceQuantity=printedQuantity;line.quantitySource='AI_PRINTED_ROW_MATH_VERIFIED'}
      if(String(candidate.printedUnit||'').trim()){line.unit=String(candidate.printedUnit).trim();line.invoiceUnit=String(candidate.printedUnit).trim()}
      if(originalUnitPrice>0){line.unitCost=originalUnitPrice;line.unitPrice=originalUnitPrice;line.azureUnitCostDerivedFromNet=false;line.originalUnitPriceSource='AI_DISCOUNT_MATH_VERIFIED'}
      applyValidatedPairs(line,validated);
      line.discountSource='AI_PERCENT_AMOUNT_VERIFIED';line.discountConfidence=confidence;line.discountEvidence=String(candidate?.evidence||'').slice(0,180);
      diagnostics.accepted+=1;diagnostics.aiAccepted+=1;
    }
    applySiblingDiscountConsensus(productLines,diagnostics);
    if(reverifyAll){
      const complete=buildCompletePrintedTableCandidate(candidates,expectedGrossTotal,diagnostics.vatSummary);
      if(complete){
        productLines.splice(0,productLines.length,...complete);
        acceptedPrintedIndexes.clear();complete.forEach((_,index)=>acceptedPrintedIndexes.add(index));
        diagnostics.accepted=complete.length;diagnostics.aiAccepted=complete.length;diagnostics.completePrintedTableRecovered=true;
      }
    }
    if(reverifyAll)repairScaledQuantityDiscountAmbiguity(productLines,diagnostics);
    if(reverifyAll)repairMantzilasCode00009PackAmbiguity(productLines,diagnostics,supplierRule);
    const expectedGross=Number(expectedGrossTotal||0),candidateGross=money4(productLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
    const incompletePrintedRows=reverifyAll&&expectedGross>0&&acceptedPrintedIndexes.size!==productLines.length;
    if(reverifyAll&&expectedGross>0&&(incompletePrintedRows||Math.abs(candidateGross-expectedGross)>.05)){
      productLines.forEach((line,index)=>{for(const key of Object.keys(line))delete line[key];Object.assign(line,originalLines[index]||{})});
      diagnostics.accepted=0;diagnostics.aiAccepted=0;diagnostics.vatSummary=[];diagnostics.status='FAILED';diagnostics.reason=incompletePrintedRows?'PRINTED_ROWS_INCOMPLETE':'PRINTED_ROWS_TOTAL_MISMATCH';return stamp(productLines,diagnostics);
    }
    diagnostics.status='OK';diagnostics.reason=diagnostics.accepted>0?'DISCOUNT_PAIRS_VERIFIED':'NO_CONFIDENT_DISCOUNT_PAIRS';
  }catch(error){diagnostics.status='FAILED';diagnostics.reason=error?.message||'UNKNOWN_ERROR';console.warn('Discount verifier error:',error?.message||error)}
  return stamp(productLines,diagnostics);
}
