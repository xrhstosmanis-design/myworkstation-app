// A deliberately entered zero is valid; an absent amount is never zero.
export function declaredEftpos(value){
 if(typeof value!=="number"&&typeof value!=="string")return null;
 const text=String(value).trim().replace(",",".");
 if(!/^\d+(?:\.\d+)?$/.test(text))return null;
 const amount=Number(text);
 return Number.isFinite(amount)&&amount>=0&&amount<=999999999?amount:null;
}
