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
  if(!apiKey||!contentData||!Array.isArray(productLines)||!productLines.length)return productLines;
  if(productLines.some(line=>Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0))return productLines;

  const filePart=mimeType==='application/pdf'
    ? {type:'input_file',filename:filename||'invoice.pdf',file_data:String(contentData).split(',').pop()}
    : {type:'input_image',image_url:contentData,detail:'high'};

  const guide=productLines.map((line,index)=>`${index+1}. code=${line.code||''} | ${line.description||''} | qty=${line.quantity||0} | azurePrice=${line.unitCost||0} | azureNet=${line.netAmount||0}`).join('\n');
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
            evidence:{type:'string'},
            confidence:{type:'number',minimum:0,maximum:100}
          },
          required:['index','discount1','discount2','discount3','evidence','confidence']
        }
      }
    },
    required:['discounts']
  };

  const prompt=`Είσαι δεύτερος οπτικός ελεγκτής τιμολογίου. Διάβασε ΜΟΝΟ τις ορατές στήλες έκπτωσης για τις παρακάτω γραμμές προϊόντων. Οι τιμές Azure δίνονται μόνο για ταυτοποίηση γραμμής και ΔΕΝ πρέπει να χρησιμοποιηθούν για υπολογισμό ή συμπέρασμα έκπτωσης. Μην αλλάξεις ποσότητα, τιμή, καθαρή αξία ή ΦΠΑ. discount1/discount2/discount3 είναι ΜΟΝΟ τα ποσοστά που είναι τυπωμένα οπτικά στις αντίστοιχες στήλες έκπτωσης της ίδιας γραμμής. Αν μια στήλη είναι κενή ή δεν διαβάζεται καθαρά, βάλε 0. Στο evidence γράψε σύντομα το ακριβές ορατό κείμενο των εκπτώσεων της γραμμής (π.χ. "10% | 2% | -"). Αν δεν βλέπεις έκπτωση, evidence="none". Μην μετατρέψεις ποσότητες, τιμές, ΦΠΑ, καθαρές αξίες ή σύνολα σε έκπτωση.\n\nΓΡΑΜΜΕΣ AZURE:\n${guide}`;

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
      console.warn('Discount verifier failed:',response.status);
      return productLines;
    }
    const parsed=JSON.parse(outputText(await response.json())||'{}');
    for(const candidate of Array.isArray(parsed?.discounts)?parsed.discounts:[]){
      const line=productLines[Number(candidate?.index||0)-1];
      if(!line||Number(candidate?.confidence||0)<85)continue;
      const values=[safeDiscount(candidate.discount1),safeDiscount(candidate.discount2),safeDiscount(candidate.discount3)];
      if(!values.some(v=>v>0))continue;
      [line.discount1,line.discount2,line.discount3]=values;
      line.discountSource='AI_VISUAL_DISCOUNT_ONLY';
      line.discountEvidence=String(candidate.evidence||'').slice(0,120);
      line.discountConfidence=Number(candidate.confidence||0);
    }
  }catch(error){
    console.warn('Discount verifier error:',error?.message||error);
  }
  return productLines;
}
