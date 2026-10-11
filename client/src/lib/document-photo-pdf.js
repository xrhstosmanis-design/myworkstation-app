// Keep several photos in one attachment for the existing single-file intake.
// JPEG streams are copied verbatim; no text extraction or financial operation.
export function photoPagesPdf(pages){
  if(!pages.length||pages.length>5)throw new Error("Επίλεξε από 1 έως 5 φωτογραφίες.");
  const encode=s=>new TextEncoder().encode(s),parts=[],offsets=[0];let size=0;
  const write=value=>{const bytes=typeof value==="string"?encode(value):value;parts.push(bytes);size+=bytes.length};
  const object=(id,body)=>{offsets[id]=size;write(`${id} 0 obj\n`);body();write("\nendobj\n")};
  write("%PDF-1.4\n");
  object(1,()=>write("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2,()=>write(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(" ")}] >>`));
  pages.forEach(({bytes,width,height},i)=>{
    if(!(bytes instanceof Uint8Array)||!bytes.length||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error("Δεν διαβάστηκε μία φωτογραφία.");
    const id=3+i*3,w=595.28,h=+(w*height/width).toFixed(2),content=encode(`q ${w} 0 0 ${h} 0 0 cm /Photo Do Q\n`);
    object(id,()=>write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Photo ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`));
    object(id+1,()=>{write(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);write(bytes);write("\nendstream")});
    object(id+2,()=>{write(`<< /Length ${content.length} >>\nstream\n`);write(content);write("endstream")});
  });
  const xref=size;write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset=>write(`${String(offset).padStart(10,"0")} 00000 n \n`));
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result;
}
const read=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Δεν διαβάστηκε η φωτογραφία."));reader.readAsDataURL(file)});
export function validatePhotoSelection(existing,incoming){
  if(existing.length+incoming.length>5)throw new Error("Μπορείς να προσθέσεις μέχρι 5 φωτογραφίες του ίδιου παραστατικού.");
  if(incoming.some(file=>!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)))throw new Error("Χρησιμοποίησε JPEG, PNG, WEBP ή PDF.");
  if([...existing,...incoming].some(file=>file.type==="application/pdf")&&existing.length+incoming.length>1)throw new Error("Επίλεξε ένα πολυσέλιδο PDF ή έως 5 φωτογραφίες. Δεν συνδυάζονται μαζί.");
}
export async function bundleDocumentPhotos(files,{maxBytes=3400000}={}){
  validatePhotoSelection([],files);
  if(!files.length)throw new Error("Επίλεξε παραστατικό.");
  let result=files[0];
  if(files.length>1){
    const pages=[];
    for(const file of files){
      const dataUrl=await read(file),image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Δεν διαβάστηκε μία φωτογραφία."));img.src=dataUrl});
      let jpeg=dataUrl;
      if(file.type!=="image/jpeg"){const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);jpeg=canvas.toDataURL("image/jpeg",.94)}
      const bytes=Uint8Array.from(atob(jpeg.split(",")[1]),char=>char.charCodeAt(0));pages.push({bytes,width:image.naturalWidth,height:image.naturalHeight});
    }
    result=new File([photoPagesPdf(pages)],"parastatiko-photos.pdf",{type:"application/pdf"});
  }
  if(result.size>maxBytes)throw new Error(`Οι φωτογραφίες μαζί υπερβαίνουν το όριο ${(maxBytes/1000000).toLocaleString("el-GR")} MB. Κράτησε τις επιλογές και χρησιμοποίησε μικρότερα αρχεία ή ένα μικρότερο PDF.`);
  return result;
}
