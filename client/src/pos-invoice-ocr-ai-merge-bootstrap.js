const originalFetch=window.fetch.bind(window);
const jobs=new Map();

const normMoney=value=>{
  const s=String(value||'').replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.').replace(/[^0-9.]/g,'');
  const n=Number(s);return Number.isFinite(n)?n:null;
};
const isoDate=raw=>{
  const m=String(raw||'').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);if(!m)return '';
  let y=Number(m[3]);if(y<100)y+=2000;return `${String(y).padStart(4,'0')}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
};
function fromOcr(rawText){
  const text=String(rawText||''),lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let documentNumber='';
  for(const line of lines){
    const m=line.match(/(?:ΤΙΜΟΛΟΓΙΟ|ΤΙΜ\.?|INVOICE|ΠΑΡΑΣΤΑΤΙΚΟ).{0,40}?(?:ΑΡ\.?|ΑΡΙΘΜ(?:ΟΣ)?|NO\.?|#)?\s*[:\-]?\s*([A-ZΑ-Ω0-9][A-ZΑ-Ω0-9\-/]{2,})/i)
      ||line.match(/(?:ΑΡ\.?\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|ΑΡΙΘΜΟΣ\s*(?:ΤΙΜΟΛΟΓΙΟΥ)?|INVOICE\s*NO\.?)\s*[:\-]?\s*([A-ZΑ-Ω0-9\-/]{3,})/i);
    if(m){documentNumber=m[1].trim();break}
  }
  let documentDate='';for(const line of lines){const d=isoDate(line);if(d){documentDate=d;break}}
  let totalGross=null;
  const totalRx=/(ΓΕΝΙΚΟ\s*ΣΥΝΟΛΟ|ΠΛΗΡΩΤΕΟ|ΤΕΛΙΚΟ\s*ΣΥΝΟΛΟ|ΣΥΝΟΛΟ\s*ΜΕ\s*ΦΠΑ|TOTAL\s*DUE|GRAND\s*TOTAL|TOTAL)/i;
  for(const line of lines.filter(x=>totalRx.test(x)).reverse()){
    const nums=(line.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[]).map(normMoney).filter(n=>n&&n>0);
    if(nums.length){totalGross=nums.at(-1);break}
  }
  if(totalGross==null){const nums=(text.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})/g)||[]).map(normMoney).filter(n=>n&&n>0&&n<100000000);if(nums.length)totalGross=Math.max(...nums)}
  const taxId=(text.match(/(?:ΑΦΜ|VAT)\s*[:\-]?\s*([0-9]{9,12})/i)||[])[1]||'';
  return {documentNumber,documentDate,totalGross,taxId};
}
function mergeResult(aiData,ocrJob){
  if(!aiData||!ocrJob)return aiData;
  const fallback=fromOcr(ocrJob.result?.rawText||'');
  const r={...(aiData.result||{})};
  r.documentNumber=r.documentNumber||fallback.documentNumber||'';
  r.documentDate=r.documentDate||fallback.documentDate||'';
  r.totalGross=Number(r.totalGross||0)>0?Number(r.totalGross):Number(fallback.totalGross||0);
  r.supplier={name:r.supplier?.name||'',taxId:r.supplier?.taxId||fallback.taxId||'',email:r.supplier?.email||'',phone:r.supplier?.phone||'',address:r.supplier?.address||'',city:r.supplier?.city||''};
  if(!Array.isArray(r.lines)||!r.lines.length)r.lines=(ocrJob.result?.lines||[]).map(x=>({text:String(x.text||''),confidence:Number(x.confidence||ocrJob.localConfidence||0)})).filter(x=>x.text.trim());
  if(!r.rawText)r.rawText=ocrJob.result?.rawText||r.lines.map(x=>x.text).join('\n');
  const aiConf=Number(aiData.confidence||r.aiConfidence||0),ocrConf=Number(ocrJob.localConfidence||0);
  if(aiConf<=0)r.aiConfidence=ocrConf;
  const merged={...aiData,result:r,confidence:aiConf>0?aiConf:ocrConf,mergedWithOcr:true};
  if(!merged.supplierCandidate||!merged.supplierCandidate.name)merged.supplierCandidate=r.supplier;
  return merged;
}

window.fetch=async function(input,init){
  const url=typeof input==='string'?input:String(input?.url||'');
  const response=await originalFetch(input,init);
  try{
    if(/\/api\/commerce\/ai-reader\/jobs$/.test(url)&&String(init?.method||'GET').toUpperCase()==='POST'&&response.ok){
      const clone=response.clone(),data=await clone.json();const body=JSON.parse(init?.body||'{}');if(data?.id)jobs.set(String(data.id),body);
      return response;
    }
    const m=url.match(/\/api\/commerce\/ai-reader\/jobs\/([^/]+)\/ai-recheck$/);
    if(m&&response.ok){
      const data=await response.clone().json();const merged=mergeResult(data,jobs.get(decodeURIComponent(m[1])));if(merged!==data){
        return new Response(JSON.stringify(merged),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json'}});
      }
    }
  }catch(error){console.warn('OCR/AI merge compatibility skipped',error)}
  return response;
};
