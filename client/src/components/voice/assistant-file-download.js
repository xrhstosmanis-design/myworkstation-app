const types={xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",csv:"text/csv;charset=utf-8",pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
export function downloadAssistantFile(file,{doc=document,urls=URL,decode=atob}={}){
 const match=typeof file?.filename==="string"&&file.filename.match(/^myworkstation-report-\d{14}\.(xlsx|csv|pdf|docx)$/);
 if(!match||file.mimeType!==types[match[1]]||typeof file.base64!=="string"||!Number.isInteger(file.size)||file.size<=0||file.size>10*1024*1024||file.base64.length>14*1024*1024)throw new Error("Δεν παραλήφθηκε έγκυρο αρχείο αναφοράς.");
 const raw=decode(file.base64);if(raw.length!==file.size)throw new Error("Το αρχείο αναφοράς είναι ελλιπές.");
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),url=urls.createObjectURL(new Blob([bytes],{type:file.mimeType})),a=doc.createElement("a");
 try{a.href=url;a.download=file.filename;doc.body.appendChild(a);a.click()}finally{a.remove();setTimeout(()=>urls.revokeObjectURL(url),1000)}
}
export function assistantRequestedFile(question){const q=String(question).toLowerCase();return /\b(excel|xlsx)\b/.test(q)?"xlsx":/\bpdf\b/.test(q)?"pdf":/\bcsv\b/.test(q)?"csv":/\b(word|docx)\b/.test(q)?"docx":null;}
