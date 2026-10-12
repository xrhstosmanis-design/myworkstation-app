export function renderOnlineStoreQRPrint(doc,{format='sign',storeName,url,image}){
 const cards=format==='cards';
 doc.title=`QR ${storeName}`;
 const style=doc.createElement('style');
 style.textContent=`@page{size:${cards?'A4':'A5'};margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#115e59}.sheet{${cards?'display:grid;grid-template-columns:repeat(2,90mm);gap:5mm;':'width:100%;'}}.qr-print{${cards?'width:90mm;height:125mm;border:1px dashed #777;padding:5mm;':'padding:5mm;'}text-align:center;break-inside:avoid}h1{font-size:${cards?'18':'28'}px;margin:4mm 0}img{display:block;width:${cards?'55':'85'}mm;height:${cards?'55':'85'}mm;margin:5mm auto}p{font-size:${cards?'13':'18'}px;margin:3mm 0}small{display:block;color:#333;font-size:${cards?'10':'12'}px;overflow-wrap:anywhere}.brand{font-weight:bold}@media print{.qr-print{print-color-adjust:exact}}`;
 doc.head.append(style);
 const sheet=doc.createElement('main');sheet.className='sheet';
 for(let i=0;i<(cards?4:1);i++){
  const card=doc.createElement('section');card.className='qr-print';
  const title=doc.createElement('h1');title.textContent=storeName;
  const prompt=doc.createElement('p');prompt.textContent='Σκάναρε και παράγγειλε από το κινητό σου';
  const qr=doc.createElement('img');qr.src=image;qr.alt='QR online καταστήματος';
  const delivery=doc.createElement('p');delivery.textContent='Για παράδοση στο δωμάτιο, συμπλήρωσε όροφο, κλινική και δωμάτιο.';
  const link=doc.createElement('small');link.textContent=url;
  const brand=doc.createElement('p');brand.className='brand';brand.textContent='MyWorkStation';
  card.append(title,prompt,qr,delivery,link,brand);sheet.append(card);
 }
 doc.body.replaceChildren(sheet);
 return [...sheet.querySelectorAll('img')];
}
