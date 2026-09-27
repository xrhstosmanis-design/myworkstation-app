import sharp from "sharp";

// A camera photo of a narrow receipt may be stored sideways with EXIF=1.
// Restrict this to a wide, bright paper strip against a darker background;
// ordinary landscape invoices retain their original orientation.
async function sidewaysReceipt(image,width,height){
  if(width/height<1.6)return false;
  const {data,info}=await sharp(image).resize({width:80,height:45,fit:"fill"}).greyscale().raw().toBuffer({resolveWithObject:true});
  const bright=(x0,x1,y0,y1)=>{
    let count=0,total=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      count+=data[y*info.width+x]>175?1:0;
      total++;
    }
    return count/total;
  };
  return bright(8,72,10,29)>.70&&bright(8,72,35,44)<.25;
}

// Keep the complete page for the header/footer and overlapping enlarged bands
// for small product codes across the entire printed table.
// These are only model inputs; the original attachment remains untouched.
export async function invoiceAssistantImageViews(pages){
  const content=[];
  for(const [index,page] of pages.entries()){
    if(page.mimeType==="application/pdf"){
      content.push({type:"input_text",text:`Σελίδα ${index+1} από ${pages.length}: πλήρες αρχείο`});
      content.push({type:"input_file",filename:page.filename||`page-${index+1}.pdf`,file_data:String(page.contentData).split(",").pop()});
      continue;
    }
    if(!/^image\/(?:jpeg|png|webp)$/.test(page.mimeType||""))throw new Error("Μη υποστηριζόμενη φωτογραφία τιμολογίου.");
    const encoded=String(page.contentData||"").split(",").pop();
    const source=Buffer.from(encoded,"base64");
    if(!source.length||source.length>8_000_000)throw new Error("Η φωτογραφία του τιμολογίου δεν μπορεί να αναγνωστεί με ασφάλεια.");
    let oriented=await sharp(source).rotate().toBuffer();
    let {width,height}=await sharp(oriented).metadata();
    if(!width||!height)throw new Error("Η φωτογραφία του τιμολογίου δεν έχει έγκυρες διαστάσεις.");
    if(await sidewaysReceipt(oriented,width,height)){
      // Both directions are supplied because dimensions alone cannot tell
      // which edge of the photographed receipt contains its heading.
      const opposite=await sharp(oriented).rotate(90).toBuffer();
      oriented=await sharp(oriented).rotate(270).toBuffer();
      ({width,height}=await sharp(oriented).metadata());
      const alternate=await sharp(opposite).resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).jpeg({quality:80}).toBuffer();
      content.push({type:"input_text",text:`Σελίδα ${index+1}: η φωτογραφία ήταν πλάγια. Οι δύο περιστροφές απεικονίζουν ΤΟ ΙΔΙΟ παραστατικό. Επίλεξε μόνο εκείνη όπου οι λέξεις διαβάζονται όρθιες· αγνόησε την ανάποδη. Μη διπλομετρήσεις καμία σειρά.`});
      content.push({type:"input_image",image_url:`data:image/jpeg;base64,${alternate.toString("base64")}`,detail:"high"});
    }
    const full=await sharp(oriented).resize({width:3000,height:3000,fit:"inside",withoutEnlargement:true}).flatten({background:"#fff"}).jpeg({quality:83}).toBuffer();
    const left=Math.round(width*.04),cropWidth=Math.min(Math.round(width*.92),width-left);
    content.push({type:"input_text",text:`Σελίδα ${index+1} από ${pages.length}: πλήρης φωτογραφία και τρεις επικαλυπτόμενες μεγεθύνσεις του ίδιου φύλλου από πάνω προς τα κάτω. Ανάγνωσε κωδικούς και ονομασίες από τη σχετική μεγέθυνση, και μέτρησε κάθε φυσική γραμμή μόνο μία φορά.`});
    content.push({type:"input_image",image_url:`data:image/jpeg;base64,${full.toString("base64")}`,detail:"high"});
    for(const [band,start,end] of [["επάνω",.17,.43],["μέση",.40,.66],["κάτω",.63,.89]]){
      const top=Math.round(height*start),cropHeight=Math.min(Math.round(height*(end-start)),height-top);
      const table=await sharp(oriented).extract({left,top,width:cropWidth,height:cropHeight}).resize({width:Math.min(2400,Math.max(cropWidth,1600))}).jpeg({quality:90}).toBuffer();
      content.push({type:"input_text",text:`Σελίδα ${index+1}, ${band} ζώνη του ίδιου πίνακα. Οι επικαλύψεις δεν είναι νέες γραμμές.`});
      content.push({type:"input_image",image_url:`data:image/jpeg;base64,${table.toString("base64")}`,detail:"high"});
    }
  }
  return content;
}
