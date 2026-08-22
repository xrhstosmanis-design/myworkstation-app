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

function safeDiscount(value){
  const n=Number(value||0);
  return Number.isFinite(n)&&n>0&&n<100?money4(n):0;
}

export async function verifyInvoiceDiscounts({contentData,mimeType,filename,productLines,apiKey,model}){
  const diagnostics={called:false,status:'SKIPPED',reason:'',candidates:0,accepted:0,rejectedLowConfidence:0};
  if(!apiKey){diagnostics.reason='NO_OPENAI_KEY';return diagnostics}
  if(!contentData){diagnostics.reason='NO_DOCUMENT';return diagnostics}
  if(!Array.isArray(productLines)||!productLines.length){diagnostics.reason='NO_PRODUCT_LINES';return diagnostics}
  if(productLines.some(line=>Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0)){
    diagnostics.reason='DISCOUNTS_ALREADY_PRESENT';
    return diagnostics;
  }

  diagnostics.called=true;
  const filePart=mimeType==='application/pdf'
    ? {type:'input_file',filename:filename||'invoice.pdf',file_data:String(contentData).split(',').pop()}
    : {type:'input_image',image_url:contentData,detail:'high'};

  const guide=productLines.map((line,index)=>`${index+1}. ${line.code||''} | ${line.description||''} | qty=${line.quantity||0} | price=${line.unitCost||0} | net=${line.netAmount||0}`).join('\n');
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
            discount1:{type:'number',minimum:0,maximum:99.99},
            discount2:{type:'number',minimum:0,maximum:99.99},
            discount3:{type:'number',minimum:0,maximum:99.99},
            confidence:{type:'number',minimum:0,maximum:100},
            evidence:{type:'string'}
          },
          required:['index','discount1','discount2','discount3','confidence','evidence']
        }
      }
    },
    required:['discounts']
  };

  const prompt=`Διάβασε ΜΟΝΟ τις ορατές στήλες έκπτωσης του πρωτότυπου τιμολογίου για τις παρακάτω γραμμές. Μην αλλάξεις ποσότητα, τιμή, καθαρή αξία ή ΦΠΑ. discount1/discount2/discount3 είναι ποσοστά. Βάλε 0 όταν δεν υπάρχει σαφής έκπτωση ή δεν είσαι βέβαιος. Μην χρησιμοποιήσεις άλλον αριθμό ως έκπτωση. Στο evidence γράψε πολύ σύντομα τι ακριβώς είδες στη γραμμή.\n\nΓΡΑΜΜΕΣ:\n${guide}`;

  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:model||'gpt-5',
        input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],
        text:{format:{type:'json_schema',name:'invoice_discounts',strict:true,schema}}
      })
    });
    if(!response.ok){
      diagnostics.status='FAILED';
      diagnostics.reason=`HTTP_${response.status}`;
      console.warn('Discount verifier failed:',response.status,await response.text().catch(()=>''));
      return diagnostics;
    }
    const body=await response.json();
    const text=outputText(body);
    if(!text){diagnostics.status='FAILED';diagnostics.reason='EMPTY_OUTPUT';return diagnostics}
    const parsed=JSON.parse(text);
    const candidates=Array.isArray(parsed?.discounts)?parsed.discounts:[];
    diagnostics.candidates=candidates.length;
    for(const candidate of candidates){
      const line=productLines[Number(candidate?.index||0)-1];
      if(!line)continue;
      const confidence=Number(candidate?.confidence||0);
      if(confidence<85){diagnostics.rejectedLowConfidence+=1;continue}
      const values=[safeDiscount(candidate.discount1),safeDiscount(candidate.discount2),safeDiscount(candidate.discount3)];
      if(!values.some(v=>v>0))continue;
      [line.discount1,line.discount2,line.discount3]=values;
      line.discountSource='AI_DISCOUNT_VERIFIED';
      line.discountConfidence=confidence;
      line.discountEvidence=String(candidate?.evidence||'').slice(0,180);
      diagnostics.accepted+=1;
    }
    diagnostics.status='OK';
    diagnostics.reason=diagnostics.accepted>0?'DISCOUNTS_ACCEPTED':'NO_CONFIDENT_DISCOUNTS';
  }catch(error){
    diagnostics.status='FAILED';
    diagnostics.reason=error?.message||'UNKNOWN_ERROR';
    console.warn('Discount verifier error:',error?.message||error);
  }
  return diagnostics;
}
