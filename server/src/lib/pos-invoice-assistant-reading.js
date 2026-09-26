import {prisma} from "../prisma.js";
import {assessInvoicePages,normalizedAssistantPages} from "../routes/invoice-assistant-review.js";
import {rawRowSupportsStructuredLine} from "./invoice-line-review.js";
import {invoiceAssistantImageViews} from "./invoice-assistant-image-views.js";
import {invoiceAssistantDiscounts} from "./invoice-assistant-discounts.js";

const number=value=>Number(String(value??"").replace(",","."));
const responseText=value=>typeof value?.output_text==="string"?value.output_text:(value?.output||[]).flatMap(item=>item.content||[]).find(part=>part.type==="output_text")?.text||"";
const rowSchema={type:"object",additionalProperties:false,required:["page","rawText","code","description","quantity","unit","unitsPerPackage","unitCost","unitDiscountAmount","lineDiscountAmount","discount1","discount2","discount3","netAmount","exciseTotal","vatRate","grossAmount","confidence"],properties:Object.fromEntries(["page","rawText","code","description","quantity","unit","unitsPerPackage","unitCost","unitDiscountAmount","discount1","discount2","discount3","netAmount","exciseTotal","vatRate","grossAmount","confidence"].map(key=>[key,{type:"string"}]))};
const schema={type:"object",additionalProperties:false,required:["expectedPageCount","visiblePageNumbers","singlePageComplete","printedQuantityTotal","printedNetTotal","printedVatTotal","printedTotal","lines"],properties:{expectedPageCount:{type:"integer"},visiblePageNumbers:{type:"array",items:{type:"integer"}},singlePageComplete:{type:"boolean"},printedQuantityTotal:{type:"string"},printedNetTotal:{type:"string"},printedVatTotal:{type:"string"},printedTotal:{type:"string"},lines:{type:"array",items:rowSchema}}};

export function assistantRowsToProductLines(reading,{pageCount,totalGross}){
  const lines=Array.isArray(reading?.lines)?reading.lines.map((line,index)=>{
    const net=number(line.netAmount),excise=number(line.exciseTotal),vat=number(line.vatRate);
    if([line.netAmount,line.exciseTotal,line.vatRate].some(value=>String(value??"").trim()==="")||![net,excise,vat].every(Number.isFinite)||net<0||excise<0||![0,6,13,24].includes(vat))return line;
    const calculated=((net+excise)*(1+vat/100)).toFixed(2);
    const supplied=String(line.grossAmount??"").trim();
    if(supplied&&(!Number.isFinite(number(supplied))||Math.abs(number(supplied)-number(calculated))>0.05))throw new Error(`Η μικτή αξία της γραμμής ${index+1} διαφέρει από καθαρό, ΕΦΚ και ΦΠΑ. Το ίδιο πρόχειρο διατηρήθηκε για έλεγχο.`);
    return {...line,grossAmount:calculated};
  }):[];
  const reviewLines=lines.map(line=>({grossAmount:line.grossAmount,confidence:line.confidence}));
  const printedTotal=number(reading?.printedTotal);
  const pages=normalizedAssistantPages({...reading,sourcePageCount:pageCount});
  if(pages.expectedPageCount!==pageCount||!Array.isArray(pages.visiblePageNumbers)||pages.visiblePageNumbers.length!==pageCount||pages.visiblePageNumbers.some((page,index)=>page!==index+1))throw new Error(`Ο βοηθός δεν επιβεβαίωσε όλες τις φυσικές σελίδες (${reading.expectedPageCount||"άγνωστο"}, δόθηκαν ${pageCount}). Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.`);
  if(!Number.isFinite(printedTotal)||printedTotal<=0||Math.abs(printedTotal-Number(totalGross))>0.05)throw new Error(`Το τυπωμένο πληρωτέο δεν συμφωνεί με το ποσό POS (${Number(totalGross).toFixed(2)} €). Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.`);
  const printedQuantity=String(reading?.printedQuantityTotal??"").trim(),printedNet=String(reading?.printedNetTotal??"").trim();
  const quantitySum=lines.reduce((sum,line)=>sum+number(line.quantity),0),netSum=lines.reduce((sum,line)=>sum+number(line.netAmount),0);
  if(printedQuantity&&Number.isFinite(number(printedQuantity))&&Math.abs(quantitySum-number(printedQuantity))>0.001)throw new Error(`Οι τυπωμένες ποσότητες δεν συμφωνούν με τις φυσικές γραμμές (${quantitySum} αντί ${printedQuantity}). Έλεγξε και διαγραμμένες σειρές που συμμετέχουν στο σύνολο. Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.`);
  if(printedNet&&Number.isFinite(number(printedNet))&&Math.abs(netSum-number(printedNet))>0.05)throw new Error(`Οι καθαρές αξίες των φυσικών γραμμών δεν συμφωνούν με το τυπωμένο σύνολο (${netSum.toFixed(2)} αντί ${printedNet} €). Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.`);
  const printedVat=String(reading?.printedVatTotal??" ").trim();
  const vatSum=lines.reduce((sum,line)=>sum+number(line.grossAmount)-number(line.netAmount)-number(line.exciseTotal),0);
  if(printedVat&&Number.isFinite(number(printedVat))&&Math.abs(vatSum-number(printedVat))>0.05)throw new Error(`Ο ΦΠΑ των φυσικών γραμμών δεν συμφωνεί με το τυπωμένο σύνολο (${vatSum.toFixed(2)} αντί ${printedVat} €). Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.`);
  if(!assessInvoicePages({...pages,sourcePageCount:pageCount,printedLines:reviewLines,printedTotal}))throw new Error("Το άθροισμα των φυσικών γραμμών δεν συμφωνεί με το τυπωμένο πληρωτέο. Το ίδιο πρόχειρο διατηρήθηκε χωρίς αυτόματες γραμμές.");
  if(!lines.length||lines.length>500)throw new Error("Ο βοηθός δεν διάβασε ασφαλή πλήρη πίνακα προϊόντων.");
  const mapped=lines.map((line,index)=>{
    const page=number(line.page),quantity=number(line.quantity),unitCost=number(line.unitCost),netAmount=number(line.netAmount),exciseTotal=number(line.exciseTotal),vatRate=number(line.vatRate),grossAmount=number(line.grossAmount);
    const printedDiscounts=[line.discount1,line.discount2,line.discount3].map(number),unitDiscountAmount=number(line.unitDiscountAmount||0),lineDiscountAmount=number(line.lineDiscountAmount||0),unitsPerPackage=number(line.unitsPerPackage);
    if(unitDiscountAmount<0||unitDiscountAmount>=unitCost||lineDiscountAmount<0||lineDiscountAmount>=quantity*unitCost||unitDiscountAmount>0&&lineDiscountAmount>0||(unitDiscountAmount>0||lineDiscountAmount>0)&&printedDiscounts[2]>0)throw new Error(`Η έκπτωση της γραμμής ${index+1} χρειάζεται έλεγχο.`);
    if(lineDiscountAmount>0){const netAfterPrintedDiscount=(quantity*unitCost-lineDiscountAmount)*printedDiscounts.reduce((factor,discount)=>factor*(1-discount/100),1);if(Math.abs(netAfterPrintedDiscount-netAmount)>0.05)throw new Error(`Η τυπωμένη έκπτωση της γραμμής ${index+1} δεν συμφωνεί με την καθαρή αξία.`)}
    const discounts=invoiceAssistantDiscounts({quantity,unitCost,unitDiscountAmount:unitDiscountAmount||lineDiscountAmount/quantity,printedDiscounts,netAmount});
    const description=String(line.description||"").trim(),unit=String(line.unit||"").trim().toUpperCase();
    if(!Number.isInteger(page)||page<1||page>pageCount||!description||description.length>500||!(quantity>0)||!(unitCost>0)||![0,6,13,24].includes(vatRate)||![quantity,unitCost,unitDiscountAmount,lineDiscountAmount,netAmount,exciseTotal,grossAmount,unitsPerPackage,...discounts].every(Number.isFinite)||[netAmount,exciseTotal,grossAmount].some(value=>value<0)||discounts.some(value=>value<0||value>=100)||!(unitsPerPackage>=1)||!(["PIECE","PACKAGE"].includes(unit)))throw new Error(`Η γραμμή ${index+1} του βοηθού χρειάζεται έλεγχο.`);
    const calculated=quantity*unitCost*discounts.reduce((factor,discount)=>factor*(1-discount/100),1);
    if(Math.abs(calculated-netAmount)>0.05||Math.abs((netAmount+exciseTotal)*(1+vatRate/100)-grossAmount)>0.05)throw new Error(`Η αριθμητική της γραμμής ${index+1} δεν συμφωνεί με το έντυπο.`);
    const code=String(line.code||"").trim().slice(0,80),rawText=String(line.rawText||"").trim().slice(0,4000);
    const certain=line.confidence==="certain"&&rawRowSupportsStructuredLine({rawText,code,description,quantity});
    return {rawText,code,description,quantity,unit:unit==="PACKAGE"?"PACKAGE":"ΤΜΧ",unitsPerPackage,stockUnitsPerInvoiceUnit:unitsPerPackage,unitCost,discount1:discounts[0],discount2:discounts[1],discount3:discounts[2],initialAmount:quantity*unitCost,netAmount,exciseTotal,vatRate,grossAmount,confidence:certain?100:0,sourceColumnsVerified:certain,quantitySource:certain?"AI_COMPLETE_PRINTED_TABLE_VERIFIED":"ASSISTANT_UNCERTAIN_REVIEW",sourceFileIndex:page-1};
  });
  if(mapped.filter(line=>!line.sourceColumnsVerified).length>2)throw new Error("Πάνω από δύο γραμμές δεν επιβεβαιώθηκαν από την ίδια φυσική σειρά. Το πρόχειρο παραμένει για έλεγχο.");
  return mapped;
}

export async function readPosInvoiceWithAssistant({companyId,storeId,pageJobIds,totalGross}){
  if(!process.env.OPENAI_API_KEY)throw new Error("Δεν έχει ρυθμιστεί ο βοηθός τιμολογίου στον server.");
  if(!Array.isArray(pageJobIds)||pageJobIds.length<1||pageJobIds.length>5||new Set(pageJobIds).size!==pageJobIds.length)throw new Error("Λείπει η πλήρης λίστα σελίδων του τιμολογίου.");
  const pages=[];
  for(const jobId of pageJobIds){
    const rows=await prisma.$queryRaw`SELECT a."filename",a."mimeType",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId" WHERE j."id"=${jobId} AND j."companyId"=${companyId} AND j."storeId"=${storeId} LIMIT 1`;
    if(!rows[0]?.contentData)throw new Error("Λείπει φωτογραφία της υποβολής POS.");
    pages.push(rows[0]);
  }
  const instruction=`Διάβασε το πλήρες τιμολόγιο από ΟΛΕΣ τις ${pages.length} συνημμένες σελίδες, με μία εγγραφή ανά φυσική γραμμή προϊόντος, συμπεριλαμβανομένων ίδιων επαναλαμβανόμενων προϊόντων. Μην χρησιμοποιήσεις προηγούμενο OCR ή αποθηκευμένες γραμμές. Επέστρεψε φυσικό αριθμό σελίδας ανά γραμμή και expectedPageCount/visiblePageNumbers από τις τυπωμένες ενδείξεις. Αν η μοναδική φωτογραφία δεν γράφει συνολικό πλήθος σελίδων (είτε είναι αρίθμητη είτε γράφει μόνο «Σελίδα: 1»), βάλε expectedPageCount=0, visiblePageNumbers=[] ή [1] αντίστοιχα και singlePageComplete=true ΜΟΝΟ όταν φαίνονται ολόκληρα η κεφαλίδα, όλες οι σειρές και το τελικό πληρωτέο στο ίδιο φυσικό φύλλο, χωρίς ένδειξη συνέχειας. Αν γράφει 2/2, singlePageComplete=false. Για σελίδες με τυπωμένο συνολικό πλήθος singlePageComplete=false. Αν η πληρότητα δεν αποδεικνύεται, βάλε false. Το rawText είναι αυτολεξεί η ορατή φυσική σειρά, μαζί με κωδικό και ποσότητα, χωρίς αναδιατύπωση. Διάβασε τα τυπωμένα συνολικά ποσότητας, καθαρής αξίας και ΦΠΑ στα printedQuantityTotal, printedNetTotal, printedVatTotal (κενό string όταν δεν υπάρχουν). Πριν απαντήσεις άθροισε ξανά ΟΛΕΣ τις φυσικές γραμμές: αν μία είναι διαγραμμένη με στυλό αλλά η ποσότητα και η καθαρή αξία της περιλαμβάνονται στα τυπωμένα σύνολα, πρέπει να τη συμπεριλάβεις· μην τη θεωρήσεις αυτόματα ακυρωμένη. Αν δεν περιλαμβάνεται στα σύνολα, σήμανέ τη uncertain για έλεγχο και μην εφευρίσκεις ποσά. Δώσε τυπωμένο πληρωτέο και ξεχώρισε την αρχική τιμή unitCost, τη σταθερή έκπτωση ΑΝΑ ΜΟΝΑΔΑ στο unitDiscountAmount και τη συνολική «ΑΞΙΑ ΕΚΠΤΩΣΗΣ» ΟΛΟΚΛΗΡΗΣ ΓΡΑΜΜΗΣ στο lineDiscountAmount (0 όταν δεν τυπώνονται). Μην αντιγράφεις ποσό έκπτωσης γραμμής ως έκπτωση ανά μονάδα ή ως ποσοστό. Για 3 × 1,59 € = 4,77 €, έκπτωση γραμμής 1,91 € και καθαρό 2,86 €, lineDiscountAmount=1.91, unitDiscountAmount=0 και discount1/2/3=0. Επαλήθευσε ότι (quantity × unitCost − lineDiscountAmount) × τις τυπωμένες ποσοστιαίες εκπτώσεις ισούται με netAmount, τις τρεις τυπωμένες ποσοστιαίες εκπτώσεις discount1/discount2/discount3 (0 αν δεν τυπώνονται), καθαρό, ΕΦΚ, ΦΠΑ και τελικό μικτό ΜΕΤΑ τις εκπτώσεις και ΜΕ ΦΠΑ ανά γραμμή. Η τυπωμένη στήλη «ΜΙΚΤΗ ΑΞΙΑ» μπορεί να είναι πριν από την έκπτωση και χωρίς ΦΠΑ: δεν είναι αυτομάτως το grossAmount. Το grossAmount είναι (netAmount + exciseTotal) × (1 + vatRate/100), στρογγυλεμένο στη γραμμή. Έλεγξε ότι ποσότητες, καθαρό και τελικό μικτό συμφωνούν με τα τυπωμένα συνολικά ποσά. quantity είναι η ΤΥΠΩΜΕΝΗ ποσότητα· 48 πακέτα × 100 τεμάχια δίνει quantity=48, unit=PACKAGE, unitsPerPackage=100. Για τεμάχια unit=PIECE, unitsPerPackage=1. Όλοι οι αριθμοί είναι δεκαδικά strings χωρίς νόμισμα. confidence είναι certain μόνο όταν η φυσική γραμμή διαβάζεται ολόκληρη, διαφορετικά uncertain και κενό στα άγνωστα πεδία. Μην συμπληρώνεις αριθμούς από το ποσό κεφαλίδας. Το ποσό που επιβεβαίωσε ο χειριστής POS ήταν ${Number(totalGross).toFixed(2)} €, αλλά δεν είναι απόδειξη ορθότητας των γραμμών.`;
  const content=[{type:"input_text",text:instruction+" Κάθε πλήρης φωτογραφία ακολουθείται από μεγέθυνση του πίνακά της: χρησιμοποίησε τη μεγέθυνση για κωδικούς, ποσότητες και τιμές, χωρίς διπλές γραμμές."},...await invoiceAssistantImageViews(pages)];
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:process.env.OPENAI_INVOICE_ASSISTANT_MODEL||"gpt-5.6-sol",reasoning:{effort:"medium"},max_output_tokens:30000,input:[{role:"user",content}],text:{format:{type:"json_schema",name:"pos_invoice_assistant_reading",strict:true,schema}}})});
  if(!response.ok)throw new Error(`Ο βοηθός δεν απάντησε (${response.status}).`);
  return assistantRowsToProductLines(JSON.parse(responseText(await response.json())),{pageCount:pages.length,totalGross});
}
