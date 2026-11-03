const CHUNK=256*1024,MAX=25*1024*1024;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
export async function sendSupportFile(request,base,file,signal){
 if(!file||file.size<1||file.size>MAX)throw Error('Επίλεξε αρχείο έως 25 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(signal?.aborted)throw Error('Η μεταφορά ακυρώθηκε.');
 const transfer=await request(`${base}/files`,{method:'POST',signal,body:JSON.stringify({name:file.name,size:bytes.length,sha256:await hash(bytes)})});
 try{for(let offset=0;offset<bytes.length;offset+=CHUNK){if(signal?.aborted)throw Error('Η μεταφορά ακυρώθηκε.');await request(`${base}/files/${transfer.id}/chunk`,{method:'POST',signal,body:JSON.stringify({offset,data:encode(bytes.subarray(offset,offset+CHUNK))})});}}catch(e){await request(`${base}/files/${transfer.id}/finish`,{method:'POST',body:'{}'}).catch(()=>{});throw e;}
 return transfer;
}
export async function receiveSupportFile(request,base,file,signal){
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX)throw Error('Μη έγκυρο αρχείο.');
 const bytes=new Uint8Array(file.size);if(signal?.aborted)throw Error('Η μεταφορά ακυρώθηκε.');
 for(let offset=0;offset<bytes.length;offset+=CHUNK){const part=await request(`${base}/files/${file.id}/chunk?offset=${offset}`,{signal});if(part.id!==file.id||part.offset!==offset||part.size!==file.size||part.sha256!==file.sha256)throw Error('Το αρχείο δεν συμφωνεί με την επιλεγμένη μεταφορά.');if(signal?.aborted)throw Error('Η μεταφορά ακυρώθηκε.');const data=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));if(data.length!==Math.min(CHUNK,bytes.length-offset))throw Error('Ελλιπής μεταφορά.');bytes.set(data,offset);}
 if(await hash(bytes)!==file.sha256)throw Error('Το αρχείο αλλοιώθηκε.');
 if(signal?.aborted)throw Error('Η μεταφορά ακυρώθηκε.');
 const url=URL.createObjectURL(new Blob([bytes]));try{const link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
 await request(`${base}/files/${file.id}/finish`,{method:'POST',body:'{}'});
}
