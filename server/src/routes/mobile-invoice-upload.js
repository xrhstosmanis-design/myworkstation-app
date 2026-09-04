import {Router} from "express";
const router=Router();
export const mobileUploads=new Map();
router.get("/:id/:token",(req,res)=>res.type("html").send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;max-width:560px;margin:28px auto;padding:0 16px;color:#123f5b}button{padding:12px 16px;border:0;border-radius:8px;background:#07877b;color:#fff;font-weight:800;font-size:16px}input{width:100%;margin:16px 0}#s{padding:10px;border-radius:8px;background:#eef5f9;white-space:pre-wrap}</style><h2>Ανέβασε τιμολόγιο</h2><p>Φωτογράφισε όλο το τιμολόγιο με καλό φωτισμό.</p><input id=f type=file accept="image/*,application/pdf" capture=environment><button onclick="go()">Αποστολή</button><p id=s>Επίλεξε φωτογραφία ή PDF.</p><script>
const status=t=>document.querySelector("#s").textContent=t;
const read=f=>new Promise((ok,no)=>{const r=new FileReader;r.onload=()=>ok(String(r.result||""));r.onerror=no;r.readAsDataURL(f)});
async function prepare(file){
  if(!file.type.startsWith("image/")||file.size<900000)return file;
  const src=await read(file),img=await new Promise((ok,no)=>{const i=new Image;i.onload=()=>ok(i);i.onerror=no;i.src=src});
  const scale=Math.min(1,2200/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise(ok=>c.toBlob(ok,"image/jpeg",.82));
  return blob?new File([blob],"timologio-kinito.jpg",{type:"image/jpeg"}):file;
}
async function go(){
  const input=document.querySelector("#f"),button=document.querySelector("button"),file=input.files[0];
  if(!file)return status("Επίλεξε πρώτα φωτογραφία ή PDF.");
  button.disabled=true;status("Προετοιμασία και συμπίεση φωτογραφίας…");
  try{
    const ready=await prepare(file),dataUrl=await read(ready);
    status("Αποστολή…");
    const r=await fetch(location.pathname,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({dataUrl,filename:ready.name,mimeType:ready.type||"image/jpeg"})});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||("Σφάλμα "+r.status));
    status("✓ Ολοκληρώθηκε. Μπορείς να επιστρέψεις στον υπολογιστή.");
  }catch(error){status("❌ "+(error.message||"Η αποστολή απέτυχε."));button.disabled=false}
}
</script>`));
router.post("/:id/:token",(req,res)=>{const x=mobileUploads.get(req.params.id),f=req.body||{};if(!x||x.token!==req.params.token||x.expires<Date.now())return res.status(404).json({error:"Το QR έληξε."});if(!/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(f.dataUrl||"")||String(f.dataUrl).length>4600000)return res.status(400).json({error:"Μη έγκυρο αρχείο."});Object.assign(x,{dataUrl:f.dataUrl,filename:String(f.filename||"timologio"),mimeType:String(f.mimeType||"image/jpeg")});res.json({ok:true})});
export default router;
