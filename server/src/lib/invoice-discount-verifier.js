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
    const percent=safePercent(pair?.percent),amount=safeAmount(pair?.amount);
    if(!percent&&!amount){percents.push(0);amounts.push(0);continue}
    if(!percent||!amount||base<=0)return null;
    const expectedAmount=base*percent/100;
    if(Math.abs(expectedAmount-amount)>Math.max(0.025,Math.abs(amount)*0.025))return null;
    percents.push(percent);amounts.push(amount);base-=amount;
  }
  if(net>0&&Math.abs(base-net)>Math.max(0.05,net*0.02))return null;
  return {percents,amounts,grossBase,expectedNet:base};
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
    if(Number(line.unitCost||0)>0)continue;
    const derived=deriveEconomicsFromAzureContent(line);if(!derived)continue;
    line.unitCost=money4(derived.price);
    line.unitPrice=money4(derived.price);
    line.rawEconomicsSource='AZURE_CONTENT_MATH_VERIFIED';
    line.rawEconomicsConfidence=99;
    line.rawEconomicsEvidence=derived.evidence;
    if(derived.pairs.length&&!(Number(line.discount1||0)>0||Number(line.discount2||0)>0||Number(line.discount3||0)>0)){
      line.discount1=derived.pairs[0].percent;line.discountAmount1=derived.pairs[0].amount;
      line.discount2=0;line.discountAmount2=0;line.discount3=0;line.discountAmount3=0;
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
    [line.discount1,line.discount2,line.discount3]=derived.validated.percents;
    [line.discountAmount1,line.discountAmount2,line.discountAmount3]=derived.validated.amounts;
    line.discountSource='AZURE_CONTENT_MATH_VERIFIED';
    line.discountConfidence=99;
    line.discountEvidence=derived.evidence;
    diagnostics.accepted+=1;diagnostics.rawAccepted+=1;
  }
}

export async function verifyInvoiceDiscounts({contentData,mimeType,filename,productLines,apiKey,model}){
  const diagnostics={called:false,status:'SKIPPED',reason:'',candidates:0,accepted:0,rawAccepted:0,rawEconomicsAccepted:0,aiAccepted:0,rejectedLowConfidence:0,rejectedMath:0};
  if(!Array.isArray(productLines)||!productLines.length){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}

  // Azure often leaves UnitPrice/Discount empty on Greek invoices even though the full line content contains them.
  // Recover them only when quantity × price and discount arithmetic prove the candidate values.
  applyRawContentEconomics(productLines,diagnostics);
  applyRawContentDiscounts(productLines,diagnostics);
  const unresolved=productLines.map((line,index)=>({line,index})).filter(({line})=>!(Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0));
  if(!unresolved.length){diagnostics.status='OK';diagnostics.reason='AZURE_CONTENT_DISCOUNTS_VERIFIED';return stamp(productLines,diagnostics)}
  if(!apiKey){diagnostics.reason=diagnostics.rawAccepted>0?'PARTIAL_AZURE_CONTENT_NO_OPENAI_KEY':'NO_OPENAI_KEY';return stamp(productLines,diagnostics)}
  if(!contentData){diagnostics.reason='NO_DOCUMENT';return stamp(productLines,diagnostics)}

  diagnostics.called=true;
  const filePart=mimeType==='application/pdf'?{type:'input_file',filename:filename||'invoice.pdf',file_data:String(contentData).split(',').pop()}:{type:'input_image',image_url:contentData,detail:'high'};
  const guide=unresolved.map(({line,index})=>`${index+1}. ${line.code||''} | ${line.description||''} | qty=${line.quantity||0} | price=${line.unitCost||0} | net=${line.netAmount||0} | azureContent=${line.rawText||''}`).join('\n');
  const schema={type:'object',additionalProperties:false,properties:{discounts:{type:'array',items:{type:'object',additionalProperties:false,properties:{index:{type:'integer',minimum:1},discountPercent1:{type:'number',minimum:0,maximum:99.99},discountAmount1:{type:'number',minimum:0},discountPercent2:{type:'number',minimum:0,maximum:99.99},discountAmount2:{type:'number',minimum:0},discountPercent3:{type:'number',minimum:0,maximum:99.99},discountAmount3:{type:'number',minimum:0},confidence:{type:'number',minimum:0,maximum:100},evidence:{type:'string'}},required:['index','discountPercent1','discountAmount1','discountPercent2','discountAmount2','discountPercent3','discountAmount3','confidence','evidence']}}},required:['discounts']};
  const prompt=`Διάβασε ΜΟΝΟ τα ζεύγη ΠΟΣΟΣΤΟΥ και ΠΟΣΟΥ έκπτωσης στις γραμμές του ελληνικού τιμολογίου. Το Azure content περιέχει ολόκληρη τη γραμμή. Παράδειγμα: qty 5, price 1,420, αρχική αξία 7,10, ποσοστό 15,00, ποσό έκπτωσης 1,07, καθαρή αξία 6,03. Επέστρεψε discountPercent1/2/3 και discountAmount1/2/3. Μην αλλάξεις ποσότητα, τιμή, καθαρή αξία ή ΦΠΑ. Βάλε 0 όταν δεν είσαι βέβαιος.\n\nΓΡΑΜΜΕΣ:\n${guide}`;
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:model||'gpt-5',input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],text:{format:{type:'json_schema',name:'invoice_discount_pairs',strict:true,schema}}})});
    if(!response.ok){diagnostics.status='FAILED';diagnostics.reason=`HTTP_${response.status}`;console.warn('Discount verifier failed:',response.status,await response.text().catch(()=>''));return stamp(productLines,diagnostics)}
    const text=outputText(await response.json());if(!text){diagnostics.status='FAILED';diagnostics.reason='EMPTY_OUTPUT';return stamp(productLines,diagnostics)}
    const parsed=JSON.parse(text),candidates=Array.isArray(parsed?.discounts)?parsed.discounts:[];diagnostics.candidates=candidates.length;
    for(const candidate of candidates){
      const line=productLines[Number(candidate?.index||0)-1];if(!line)continue;
      if(Number(line.discount1||0)>0||Number(line.discount2||0)>0||Number(line.discount3||0)>0)continue;
      const confidence=Number(candidate?.confidence||0);if(confidence<85){diagnostics.rejectedLowConfidence+=1;continue}
      const pairs=[{percent:candidate.discountPercent1,amount:candidate.discountAmount1},{percent:candidate.discountPercent2,amount:candidate.discountAmount2},{percent:candidate.discountPercent3,amount:candidate.discountAmount3}];
      if(!pairs.some(pair=>safePercent(pair.percent)>0||safeAmount(pair.amount)>0))continue;
      const validated=validateDiscountPairs(line,pairs);if(!validated){diagnostics.rejectedMath+=1;continue}
      [line.discount1,line.discount2,line.discount3]=validated.percents;[line.discountAmount1,line.discountAmount2,line.discountAmount3]=validated.amounts;
      line.discountSource='AI_PERCENT_AMOUNT_VERIFIED';line.discountConfidence=confidence;line.discountEvidence=String(candidate?.evidence||'').slice(0,180);
      diagnostics.accepted+=1;diagnostics.aiAccepted+=1;
    }
    diagnostics.status='OK';diagnostics.reason=diagnostics.accepted>0?'DISCOUNT_PAIRS_VERIFIED':'NO_CONFIDENT_DISCOUNT_PAIRS';
  }catch(error){diagnostics.status='FAILED';diagnostics.reason=error?.message||'UNKNOWN_ERROR';console.warn('Discount verifier error:',error?.message||error)}
  return stamp(productLines,diagnostics);
}
