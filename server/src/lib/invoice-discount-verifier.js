const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;

function outputText(response){
  if(typeof response?.output_text==='string'&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[]){
    for(const part of item?.content||[]){
      if(part?.type==='output_text'&&part.text)return part.text;
    }
  }
  return '';
}

function safeAmount(value){
  const n=Number(value||0);
  return Number.isFinite(n)&&n>0?money4(n):0;
}

function safePercent(value){
  const n=Number(value||0);
  return Number.isFinite(n)&&n>0&&n<100?money4(n):0;
}

function stamp(productLines,diagnostics){
  if(Array.isArray(productLines)){
    for(const line of productLines){
      line.discountVerifierStatus=diagnostics.status;
      line.discountVerifierReason=diagnostics.reason;
      line.discountVerifierCandidates=diagnostics.candidates;
      line.discountVerifierAccepted=diagnostics.accepted;
    }
  }
  return diagnostics;
}

function convertAmountsToPercents(line,amounts){
  const quantity=Number(line?.quantity||0);
  const unitCost=Number(line?.unitCost||0);
  const net=Number(line?.netAmount||0);
  const [amount1,amount2,amount3]=amounts.map(safeAmount);
  const grossBase=quantity*unitCost;
  if(quantity<=0||unitCost<=0||grossBase<=0)return null;

  let base=grossBase;
  const percents=[];
  for(const amount of [amount1,amount2,amount3]){
    if(amount<=0){percents.push(0);continue}
    if(amount>=base)return null;
    const percent=safePercent(amount/base*100);
    if(!percent)return null;
    percents.push(percent);
    base-=amount;
  }

  if(net>0){
    const expectedNet=grossBase-amount1-amount2-amount3;
    const tolerance=Math.max(0.05,net*0.025);
    if(Math.abs(expectedNet-net)>tolerance)return null;
  }

  return {percents,amounts:[amount1,amount2,amount3],base:grossBase};
}

export async function verifyInvoiceDiscounts({contentData,mimeType,filename,productLines,apiKey,model}){
  const diagnostics={called:false,status:'SKIPPED',reason:'',candidates:0,accepted:0,rejectedLowConfidence:0,rejectedMath:0};
  if(!apiKey){diagnostics.reason='NO_OPENAI_KEY';return stamp(productLines,diagnostics)}
  if(!contentData){diagnostics.reason='NO_DOCUMENT';return stamp(productLines,diagnostics)}
  if(!Array.isArray(productLines)||!productLines.length){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}
  if(productLines.some(line=>Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0)){
    diagnostics.reason='DISCOUNTS_ALREADY_PRESENT';
    return stamp(productLines,diagnostics);
  }

  diagnostics.called=true;
  const filePart=mimeType==='application/pdf'
    ? {type:'input_file',filename:filename||'invoice.pdf',file_data:String(contentData).split(',').pop()}
    : {type:'input_image',image_url:contentData,detail:'high'};

  const guide=productLines.map((line,index)=>`${index+1}. ${line.code||''} | ${line.description||''} | qty=${line.quantity||0} | price=${line.unitCost||0} | net=${line.netAmount||0} | azureContent=${line.rawText||''}`).join('\n');
  const schema={
    type:'object',
    additionalProperties:false,
    properties:{
      discounts:{
        type:'array',
        items:{
          type:'object',
          additionalProperties:false,
          properties:{
            index:{type:'integer',minimum:1},
            discountAmount1:{type:'number',minimum:0},
            discountAmount2:{type:'number',minimum:0},
            discountAmount3:{type:'number',minimum:0},
            confidence:{type:'number',minimum:0,maximum:100},
            evidence:{type:'string'}
          },
          required:['index','discountAmount1','discountAmount2','discountAmount3','confidence','evidence']
        }
      }
    },
    required:['discounts']
  };

  const prompt=`Στο συγκεκριμένο ελληνικό τιμολόγιο οι στήλες εκπτώσεων εμφανίζουν ΠΟΣΑ ΣΕ ΕΥΡΩ και όχι ποσοστά. Διάβασε ΜΟΝΟ τα ποσά έκπτωσης της κάθε γραμμής προϊόντος. Μην μετατρέψεις εσύ τα ποσά σε ποσοστά. Μην αλλάξεις ποσότητα, τιμή, καθαρή αξία ή ΦΠΑ. Για κάθε γραμμή επέστρεψε discountAmount1/2/3 ως χρηματικά ποσά σε ευρώ. Βάλε 0 όταν δεν υπάρχει σαφές ποσό έκπτωσης ή δεν είσαι βέβαιος. Μην χρησιμοποιήσεις ποσότητα, τιμή, ΦΠΑ, καθαρή αξία ή άλλον αριθμό ως έκπτωση. Χρησιμοποίησε και το azureContent της ίδιας γραμμής ως βοήθημα. Στο evidence γράψε πολύ σύντομα ποια ποσά έκπτωσης είδες.\n\nΓΡΑΜΜΕΣ:\n${guide}`;

  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:model||'gpt-5',
        input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],
        text:{format:{type:'json_schema',name:'invoice_discount_amounts',strict:true,schema}}
      })
    });
    if(!response.ok){
      diagnostics.status='FAILED';
      diagnostics.reason=`HTTP_${response.status}`;
      console.warn('Discount verifier failed:',response.status,await response.text().catch(()=>''));
      return stamp(productLines,diagnostics);
    }
    const body=await response.json();
    const text=outputText(body);
    if(!text){diagnostics.status='FAILED';diagnostics.reason='EMPTY_OUTPUT';return stamp(productLines,diagnostics)}
    const parsed=JSON.parse(text);
    const candidates=Array.isArray(parsed?.discounts)?parsed.discounts:[];
    diagnostics.candidates=candidates.length;
    for(const candidate of candidates){
      const line=productLines[Number(candidate?.index||0)-1];
      if(!line)continue;
      const confidence=Number(candidate?.confidence||0);
      if(confidence<85){diagnostics.rejectedLowConfidence+=1;continue}
      const amounts=[safeAmount(candidate.discountAmount1),safeAmount(candidate.discountAmount2),safeAmount(candidate.discountAmount3)];
      if(!amounts.some(v=>v>0))continue;
      const converted=convertAmountsToPercents(line,amounts);
      if(!converted){diagnostics.rejectedMath+=1;continue}
      [line.discount1,line.discount2,line.discount3]=converted.percents;
      [line.discountAmount1,line.discountAmount2,line.discountAmount3]=converted.amounts;
      line.discountSource='AI_AMOUNT_TO_PERCENT_VERIFIED';
      line.discountConfidence=confidence;
      line.discountEvidence=String(candidate?.evidence||'').slice(0,180);
      diagnostics.accepted+=1;
    }
    diagnostics.status='OK';
    diagnostics.reason=diagnostics.accepted>0?'DISCOUNT_AMOUNTS_CONVERTED':'NO_CONFIDENT_DISCOUNT_AMOUNTS';
  }catch(error){
    diagnostics.status='FAILED';
    diagnostics.reason=error?.message||'UNKNOWN_ERROR';
    console.warn('Discount verifier error:',error?.message||error);
  }
  return stamp(productLines,diagnostics);
}
