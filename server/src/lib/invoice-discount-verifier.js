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
  const cleaned=String(text||'').replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  const n=Number(cleaned);return Number.isFinite(n)?n:null;
}
function rawNumberTokens(rawText){
  const matches=String(rawText||'').match(/\d+(?:[.,]\d+)?/g)||[];
  return matches.map((raw,index)=>({raw,value:parseLocaleNumber(raw),index})).filter(x=>Number.isFinite(x.value));
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
  const diagnostics={called:false,status:'SKIPPED',reason:'',candidates:0,accepted:0,rawAccepted:0,aiAccepted:0,rejectedLowConfidence:0,rejectedMath:0};
  if(!Array.isArray(productLines)||!productLines.length){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}

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
