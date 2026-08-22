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

function mathMatches(line,values){
  const q=Number(line?.quantity||0);
  const price=Number(line?.unitCost||0);
  const net=Number(line?.netAmount||0);
  if(q<=0||price<=0||net<=0)return false;
  const [d1,d2,d3]=values.map(safeDiscount);
  const expected=q*price*(1-d1/100)*(1-d2/100)*(1-d3/100);
  return Math.abs(expected-net)<=Math.max(0.03,net*0.015);
}

export async function verifyInvoiceDiscounts({contentData,mimeType,filename,productLines,apiKey,model}){
  if(!apiKey||!contentData||!Array.isArray(productLines)||!productLines.length)return productLines;
  if(productLines.some(line=>Number(line?.discount1||0)>0||Number(line?.discount2||0)>0||Number(line?.discount3||0)>0))return productLines;

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
            confidence:{type:'number',minimum:0,maximum:100}
          },
          required:['index','discount1','discount2','discount3','confidence']
        }
      }
    },
    required:['discounts']
  };

  const prompt=`Διάβασε ΜΟΝΟ τις ορατές στήλες έκπτωσης του πρωτότυπου τιμολογίου για τις παρακάτω γραμμές. Μην αλλάξεις ποσότητα, τιμή, καθαρή αξία ή ΦΠΑ. discount1/discount2/discount3 είναι ποσοστά. Βάλε 0 όταν δεν υπάρχει σαφής έκπτωση ή δεν είσαι βέβαιος. Μην χρησιμοποιήσεις άλλον αριθμό ως έκπτωση.\n\nΓΡΑΜΜΕΣ:\n${guide}`;

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
      if(!line||Number(candidate?.confidence||0)<80)continue;
      const values=[safeDiscount(candidate.discount1),safeDiscount(candidate.discount2),safeDiscount(candidate.discount3)];
      if(!values.some(v=>v>0)||!mathMatches(line,values))continue;
      [line.discount1,line.discount2,line.discount3]=values;
      line.discountSource='AI_DISCOUNT_VERIFIED';
      line.discountConfidence=Number(candidate.confidence||0);
    }
  }catch(error){
    console.warn('Discount verifier error:',error?.message||error);
  }
  return productLines;
}
