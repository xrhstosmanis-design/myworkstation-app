import QRCode from 'qrcode';
const euro=v=>Number(v).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export async function printNetlinkVoucher(browser,receipt,storeName,{beforePrint}={}){
 if(!receipt?.transactionId||!Array.isArray(receipt.lines)||!receipt.lines.every(x=>typeof x==='string'))return false;
 const popup=browser.open('','_blank');if(!popup)return false;
 try{
  popup.opener=null;const d=popup.document,el=(tag,value)=>{const n=d.createElement(tag);if(value!==undefined)n.textContent=String(value);return n};
  d.documentElement.lang='el';d.title=receipt.title||'Κάρτα Netlink';
  d.head.append(el('style','@page{size:58mm 297mm;margin:3mm}body{width:52mm;margin:0;font:10pt Arial,sans-serif;color:#000}h1{font-size:12pt}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}img{display:block;max-width:100%;margin:auto}.qr{width:38mm;height:38mm}.footer{border-top:1px dashed #000;padding-top:4px;font-size:9pt}'));
  d.body.append(el('h1',receipt.title),el('p',storeName||''));
  const images=[];
  for(const line of receipt.lines){
   const qr=[...line.matchAll(/\[qrcode\]([^]*?)\[\/qrcode\]/gi)];
   const text=line.replace(/\[qrcode\][^]*?\[\/qrcode\]/gi,'').replace(/\[\/?(?:b|center|left|right|size(?:=\d+)?)\]/gi,'');
   if(text){const p=el('p',text);if(/\[center\]/i.test(line))p.style.textAlign='center';else if(/\[right\]/i.test(line))p.style.textAlign='right';if(/\[b\]/i.test(line))p.style.fontWeight='bold';const size=line.match(/\[size=(\d+)\]/i);if(size)p.style.fontSize=Math.max(8,Math.min(18,Number(size[1])))+'pt';d.body.append(p)}
   for(const match of qr){if(match[1].length>3000)throw Error('QR too long');const img=el('img');img.className='qr';img.alt='QR κάρτας';const ready=new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject});img.src=await QRCode.toDataURL(match[1],{errorCorrectionLevel:'M',margin:1,width:300});d.body.append(img);images.push(ready)}
  }
  const footer=el('section');footer.className='footer';footer.append(el('p',`Παροχή υπηρεσίας: ${euro(receipt.serviceFeeAmount)}`),el('p',`Σύνολο κάρτας και παροχής: ${euro(receipt.customerTotal)}`),el('p',`Συναλλαγή Netlink: ${receipt.transactionId}`),el('p',`Απόδειξη: ${receipt.fiscalNumber||'—'}`));d.body.append(footer);
  await Promise.all(images);if(d.fonts?.ready)await d.fonts.ready;
  popup.addEventListener('afterprint',()=>popup.close(),{once:true});popup.focus();if(beforePrint&&beforePrint()!==true){popup.close();return false;}popup.print();return true;
 }catch{popup.close();return false}
}
