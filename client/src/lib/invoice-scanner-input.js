// Recover only physical Greek-layout key events in the dedicated QR field.
// Pasted URLs and ordinary Latin input retain their exact original bytes.
export function invoiceScannerAsciiKey(event){
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return null;
  const key=event.key||"",code=event.code||"";
  if(!/[\u0370-\u03ff]/.test(key)&&!(code==="KeyQ"&&key===";")&&key!=="Dead")return null;
  if(/^Key[A-Z]$/.test(code)){
    const letter=code.slice(3);
    const upper=key!==key.toLocaleLowerCase("el-GR")||Boolean(event.shiftKey)!==Boolean(event.getModifierState?.("CapsLock"));
    return upper?letter:letter.toLowerCase();
  }
  if(code==="Semicolon")return event.shiftKey?":":";";
  return null;
}

export function invoiceScannerInputError(value){
  const text=String(value||"").trim();
  if(!text)return "";
  if(text.length>4096)return "Το QR είναι πολύ μεγάλο. Χρησιμοποίησε φωτογραφία ή PDF.";
  if(/^\d+$/.test(text))return "Ο scanner έστειλε μόνο αριθμό, όχι το QR τιμολογίου. Σκάναρε το τετράγωνο QR και έλεγξε ότι εμφανίζεται ολόκληρος σύνδεσμος https://.";
  if(/[\u0370-\u03ff]/.test(text))return "Το κείμενο του scanner περιέχει ελληνικούς χαρακτήρες. Καθάρισε και σκάναρε ξανά ή επικόλλησε τον πρωτότυπο σύνδεσμο.";
  let url;try{url=new URL(text)}catch{return "Δεν παραλήφθηκε ολόκληρος σύνδεσμος QR. Καθάρισε και σκάναρε ξανά."}
  if(url.protocol!=="https:"||!url.hostname||url.pathname==="/")return "Δεν παραλήφθηκε ολόκληρος σύνδεσμος QR τιμολογίου. Καθάρισε και σκάναρε ξανά.";
  if(["einvoice.impact.gr","einvoice.s1ecos.gr"].includes(url.hostname)){
    const canonical=/^\/p\/EL\d{9}\/[a-f0-9]{40}\/[a-f0-9]{32}\/?$/i.test(url.pathname);
    const view=url.hostname==="einvoice.impact.gr"&&/^\/v\/EL\d{9}-\d{1,20}-[a-f0-9]{40}-[a-f0-9]{32}\/?$/i.test(url.pathname);
    if(!canonical&&!view)return "Ο σύνδεσμος QR είναι ελλιπής ή έχει διαφορετική μορφή. Καθάρισε και σκάναρε ξανά· αν επιμένει, χρησιμοποίησε φωτογραφία ή PDF.";
  }
  return "";
}
