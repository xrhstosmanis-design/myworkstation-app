import sharp from "sharp";

// Match the Mini reader's two views: one complete page and one enlarged table.
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
    const oriented=await sharp(source).rotate().toBuffer();
    const {width,height}=await sharp(oriented).metadata();
    if(!width||!height)throw new Error("Η φωτογραφία του τιμολογίου δεν έχει έγκυρες διαστάσεις.");
    const full=await sharp(oriented).resize({width:3000,height:3000,fit:"inside",withoutEnlargement:true}).flatten({background:"#fff"}).jpeg({quality:83}).toBuffer();
    const left=Math.round(width*.06),top=Math.round(height*.32),cropWidth=Math.round(width*.88),cropHeight=Math.round(height*.38);
    const table=await sharp(oriented).extract({left,top,width:Math.min(cropWidth,width-left),height:Math.min(cropHeight,height-top)}).resize({width:Math.min(2200,Math.max(cropWidth,1400))}).jpeg({quality:90}).toBuffer();
    content.push({type:"input_text",text:`Σελίδα ${index+1} από ${pages.length}: πλήρης φωτογραφία και αμέσως μετά μεγέθυνση του ίδιου πίνακα. Μη διπλασιάσεις τις γραμμές.`});
    content.push({type:"input_image",image_url:`data:image/jpeg;base64,${full.toString("base64")}`,detail:"high"});
    content.push({type:"input_image",image_url:`data:image/jpeg;base64,${table.toString("base64")}`,detail:"high"});
  }
  return content;
}
