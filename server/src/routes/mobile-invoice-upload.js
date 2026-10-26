import {isCustomerDemoTenant} from "../customer-demo-runtime.js";
import {Router} from "express";
const router=Router();
export const mobileUploads=new Map();
router.get("/:id/:token",(req,res)=>{const session=mobileUploads.get(req.params.id);if(!session||session.token!==req.params.token||session.expires<Date.now()||isCustomerDemoTenant(session))return res.status(404).send("Το QR έληξε.");const maxFiles=session.maxFiles||1;return res.type("html").send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;max-width:560px;margin:28px auto;padding:0 16px;color:#123f5b}button{padding:12px 16px;border:0;border-radius:8px;background:#07877b;color:#fff;font-weight:800;font-size:16px}input{width:100%;margin:16px 0}#s{padding:10px;border-radius:8px;background:#eef5f9;white-space:pre-wrap}</style><h2>Ανέβασε τιμολόγιο</h2><p>Φωτογράφισε όλες τις σελίδες του ίδιου παραστατικού με καλό φωτισμό. Έως ${maxFiles} φωτογραφίες ή ένα PDF. Κράτησε το κινητό παράλληλα στο χαρτί και βάλε όλες τις άκρες στο πλάνο.</p><label>Λήψη φωτογραφίας<input id=f type=file accept="image/*" capture=environment></label><label>Φωτογραφίες / PDF από αρχεία<input id=gallery type=file accept="image/*,application/pdf" multiple></label><div id=pages></div><button id=send onclick="go()" disabled>Αποστολή όλων</button><p id=s>Επίλεξε φωτογραφία ή PDF.</p><script>
const maxFiles=${maxFiles},files=[];let busy=false,batchId=null,completed=false;
const status=t=>document.querySelector("#s").textContent=t;
const read=f=>new Promise((ok,no)=>{const r=new FileReader;r.onload=()=>ok(String(r.result||""));r.onerror=no;r.readAsDataURL(f)});
async function prepare(file){
  if(!file.type.startsWith("image/"))return file;
  const src=await read(file),img=await new Promise((ok,no)=>{const i=new Image;i.onload=()=>ok(i);i.onerror=no;i.src=src});
  const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
  if(Math.max(width,height)<900||Math.min(width,height)<550)throw new Error("Η φωτογραφία έχει χαμηλή ανάλυση. Φωτογράφισε ξανά ολόκληρο το έγγραφο, σταθερά και με καλό φωτισμό.");
  if(file.size<1400000)return file;
  const scale=Math.min(1,3000/Math.max(width,height));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(width*scale));c.height=Math.max(1,Math.round(height*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  let blob=await new Promise(ok=>c.toBlob(ok,"image/jpeg",.92));
  if(blob&&blob.size>3200000)blob=await new Promise(ok=>c.toBlob(ok,"image/jpeg",.84));
  return blob?new File([blob],"timologio-kinito.jpg",{type:"image/jpeg"}):file;
}
function render(){
  const list=document.querySelector("#pages");list.replaceChildren();
  const count=document.createElement("b");count.textContent=files.length+"/"+maxFiles+" φωτογραφίες / αρχεία";list.append(count);
  files.forEach((file,index)=>{const row=document.createElement("div");row.style.margin="8px 0";const label=document.createElement("span");label.textContent=(index+1)+". "+file.name;row.append(label);
    const action=(text,disabled,fn)=>{const button=document.createElement("button");button.type="button";button.textContent=text;button.disabled=busy||completed||disabled;button.onclick=()=>{fn();batchId=null;render()};row.append(button)};
    action("↑",index===0,()=>{[files[index-1],files[index]]=[files[index],files[index-1]]});action("↓",index===files.length-1,()=>{[files[index+1],files[index]]=[files[index],files[index+1]]});action("Αφαίρεση",false,()=>files.splice(index,1));list.append(row);
  });
  document.querySelectorAll("input").forEach(input=>input.disabled=busy||completed||files.length>=maxFiles||files.some(file=>file.type==="application/pdf"));document.querySelector("#send").disabled=busy||completed||!files.length;
}
function add(event){
  const incoming=Array.from(event.target.files||[]);event.target.value="";if(busy||completed||!incoming.length)return;
  if(incoming.length+files.length>maxFiles)return status("Μπορείς να προσθέσεις μέχρι "+maxFiles+" φωτογραφίες. Αφαίρεσε μία για να την αντικαταστήσεις.");
  if([...files,...incoming].some(file=>file.type==="application/pdf")&&files.length+incoming.length>1)return status("Επίλεξε ένα PDF ή φωτογραφίες, χωρίς ανάμιξη.");
  if(incoming.some(file=>!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)))return status("Χρησιμοποίησε JPEG, PNG, WEBP ή PDF.");
  files.push(...incoming);batchId=null;render();status("Έλεγξε τη σειρά και πάτησε Αποστολή όλων.");
}
document.querySelector("#f").onchange=add;document.querySelector("#gallery").onchange=add;render();
async function go(){
  if(busy||completed||!files.length)return;
  busy=true;render();status("Προετοιμασία και συμπίεση φωτογραφιών…");
  try{
    const ready=[];for(const file of files){const next=await prepare(file),dataUrl=await read(next);if(dataUrl.length>4600000)throw new Error("Ένα αρχείο είναι πολύ μεγάλο. Χρησιμοποίησε μικρότερη φωτογραφία / PDF.");ready.push({dataUrl,filename:next.name,mimeType:next.type||"image/jpeg"})}
    batchId=batchId||crypto.randomUUID();
    for(let index=0;index<ready.length;index++){
      status("Αποστολή "+(index+1)+" από "+ready.length+"…");
      const payload=maxFiles===1?ready[index]:{...ready[index],batchId,index,total:ready.length};
      const r=await fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.error||("Σφάλμα "+r.status));
    }
    completed=true;status("✓ Ολοκληρώθηκε. Στάλθηκαν "+ready.length+" αρχεία μαζί. Μπορείς να επιστρέψεις στον υπολογιστή.");
  }catch(error){status("❌ "+(error.message||"Η αποστολή απέτυχε.")+" Οι επιλογές σου διατηρούνται. Πάτησε ξανά για επανάληψη της ίδιας αποστολής.")}
  finally{busy=false;render()}
}
</script>`)});

router.post("/:id/:token",(req,res)=>{
  const x=mobileUploads.get(req.params.id),f=req.body||{};
  if(!x||x.token!==req.params.token||x.expires<Date.now()||isCustomerDemoTenant(x))return res.status(404).json({error:"Το QR έληξε."});
  if(!/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(f.dataUrl||"")||String(f.dataUrl).length>4600000)return res.status(400).json({error:"Μη έγκυρο αρχείο."});
  const file={dataUrl:f.dataUrl,filename:String(f.filename||"timologio").slice(0,180),mimeType:String(f.dataUrl).slice(5,String(f.dataUrl).indexOf(";"))};
  // Legacy single-file clients keep their existing payload and response.
  if(!f.batchId){if(x.files)return res.status(409).json({error:"Το παραστατικό έχει ήδη σταλεί."});Object.assign(x,file);return res.json({ok:true})}
  const maxFiles=x.maxFiles||1;
  if(typeof f.batchId!=="string"||f.batchId.length<8||f.batchId.length>100||!Number.isInteger(f.total)||f.total<1||f.total>maxFiles||!Number.isInteger(f.index)||f.index<0||f.index>=f.total)return res.status(400).json({error:"Μέχρι 5 φωτογραφίες στην ίδια αποστολή."});
  if(file.mimeType==="application/pdf"&&f.total!==1)return res.status(400).json({error:"Επίλεξε ένα PDF ή φωτογραφίες, χωρίς ανάμιξη."});
  if(x.files&&x.batchId!==f.batchId)return res.status(409).json({error:"Το παραστατικό έχει ήδη σταλεί."});
  if(x.staging?.batchId!==f.batchId){if(f.index!==0||x.files)return res.status(409).json({error:"Στείλε τις σελίδες με τη σειρά."});x.staging={batchId:f.batchId,total:f.total,files:[]}}
  const staging=x.staging;
  if(staging.total!==f.total)return res.status(409).json({error:"Η αποστολή άλλαξε. Ξεκίνα ξανά από την πρώτη φωτογραφία."});
  if(staging.files[f.index]){const previous=staging.files[f.index];if(previous.dataUrl!==file.dataUrl||previous.filename!==file.filename)return res.status(409).json({error:"Η φωτογραφία της ίδιας αποστολής άλλαξε."})}
  else{if(f.index!==staging.files.length)return res.status(409).json({error:"Στείλε τις σελίδες με τη σειρά."});staging.files.push(file)}
  if(staging.files.length===staging.total){x.files=[...staging.files];x.batchId=f.batchId;Object.assign(x,x.files[0])}
  return res.json({ok:true,complete:Boolean(x.files),received:staging.files.length});
});
export default router;
