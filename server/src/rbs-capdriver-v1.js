const PAYMENT_LABELS={CASH:"ΜΕΤΡΗΤΑ",CARD:"ΚΑΡΤΑ"};
const FINAL_OUTCOMES=new Set(["CONFIRMED","DECLINED","REQUIRES_CHECK"]);
export const RBS_CAP_DRIVER_KIOSK_VAT_PROFILES=new Map([
  ["1",{department:1,vatRate:13}],
  ["42",{department:2,vatRate:13}],
  ["7",{department:4,vatRate:13}],
  ["15",{department:6,vatRate:24}],
  ["227",{department:6,vatRate:24}],
  ["45",{department:7,vatRate:0}],
  ["104",{department:8,vatRate:6}],
  ["17",{department:13,vatRate:24}],
  ["228",{department:14,vatRate:24}],
  ["63",{department:21,vatRate:0}]
]);

export function resolveRbsCapDriverFiscalProfile({vatCode,department,vatRate}={}){
  const profile=RBS_CAP_DRIVER_KIOSK_VAT_PROFILES.get(String(vatCode??"").trim());
  if(!profile||Number(department)!==profile.department||Math.abs(Number(vatRate)-profile.vatRate)>0.001)throw new Error("Kiosk VAT code, register department and VAT rate do not match the confirmed register profile");
  return profile;
}
const cp1253Decoder=new TextDecoder("windows-1253",{fatal:true});
const cp1253EncodeMap=new Map();
for(let byte=0;byte<256;byte++){
  try{
    const decoded=cp1253Decoder.decode(Uint8Array.of(byte));
    if(decoded.length===1&&!cp1253EncodeMap.has(decoded))cp1253EncodeMap.set(decoded,byte);
  }catch{}
}

function field(value,label,{required=true,maxLength=80}={}){
  const result=String(value??"").trim();
  if(required&&!result)throw new Error(`${label} is required`);
  if(result.length>maxLength||/[\/\r\n]/.test(result))throw new Error(`${label} contains an unsupported CAP Driver character`);
  return result;
}

function fixed(value,places,label){
  const number=Number(value);
  if(!Number.isFinite(number)||number<0)throw new Error(`${label} must be a non-negative number`);
  return number.toFixed(places);
}

function cp1253Bytes(text){
  // Windows-1253 is single-byte for Greek text. Reject unsupported characters
  // rather than silently replacing part of a receipt description.
  const bytes=[];
  for(const character of text){
    const byte=cp1253EncodeMap.get(character);
    if(byte===undefined)throw new Error(`Character ${character} is not supported by Windows-1253`);
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

export function buildRbsCapDriverV1Command({items,paymentMethod,total,paymentCode,paymentLabel,codePage="1253"}={}){
  if(codePage!=="1253")throw new Error("CAP Driver v1 requires the explicitly configured code page 1253");
  if(!Array.isArray(items)||items.length===0)throw new Error("At least one sale line is required");
  if(!["CASH","CARD"].includes(paymentMethod))throw new Error("CAP Driver v1 first stage supports only cash or card");
  const code=String(paymentCode??"").trim();
  if(!/^\d{1,2}$/.test(code))throw new Error("The register payment code must be explicitly mapped");
  const label=field(paymentLabel||PAYMENT_LABELS[paymentMethod],"payment label",{maxLength:24});
  const lines=["HL/"];
  for(const item of items){
    const description=field(item.description,"line description");
    const barcode=field(item.barcode,"barcode",{required:false,maxLength:32});
    const quantity=fixed(item.quantity,3,"quantity");
    const unitPrice=fixed(item.unitPrice,2,"unit price");
    const department=String(item.fiscalDepartment??"").trim();
    if(!/^\d{1,2}$/.test(department))throw new Error(`Fiscal department mapping is missing for ${description}`);
    const vatRate=fixed(item.vatRate,1,"VAT rate");
    if(item.registerVatRate!==undefined&&item.registerVatRate!==null&&Math.abs(Number(item.registerVatRate)-Number(vatRate))>0.001)throw new Error(`Fiscal department VAT does not match ${description}`);
    lines.push(`SL/${description}/${barcode}/${quantity}/${unitPrice}/${department}/${vatRate}`);
  }
  // Keep one final CR command in the file. No CL/ER or second payment is added.
  lines.push(`CR/${code}/${fixed(total,2,"total")}/${label}`);
  const text=lines.join("\r\n");
  return {text,bytes:cp1253Bytes(text+"\r\n"),paymentMethod,externalExecution:true};
}

export function transitionRbsFiscalRequest(currentStatus,outcome){
  if(currentStatus!=="DISPATCHED")throw new Error("Operator result is accepted only after the one-shot command was dispatched");
  if(!["YES","NO","UNCERTAIN"].includes(outcome))throw new Error("Unsupported operator result");
  if(outcome==="YES")return {status:"CONFIRMED",allowSaleCommit:true,allowResend:false};
  if(outcome==="NO")return {status:"DECLINED",allowSaleCommit:false,allowResend:false};
  return {status:"REQUIRES_CHECK",allowSaleCommit:false,allowResend:false};
}

export function mayDispatchRbsFiscalRequest(status){
  return status==="PREPARED";
}

export function claimRbsCapDriverV1Request(status){
  if(status!=="PREPARED")throw new Error("Only a prepared CAP Driver request can be claimed");
  return {status:"CLAIMED",allowResend:false};
}

export function transitionRbsCapDriverV1OperatorOutcome(status,paymentMethod,outcome){
  if(!["CASH","CARD"].includes(paymentMethod))throw new Error("Unsupported payment method for a CAP Driver request");
  if(outcome==="UNCERTAIN"&&["CLAIMED","DISPATCHED"].includes(status))return {status:"REQUIRES_CHECK",allowSaleCommit:false,allowResend:false};
  if(["CLAIMED","REQUIRES_CHECK"].includes(status)&&outcome==="YES")return {status:"OPERATOR_CONFIRMED",allowSaleCommit:true,allowResend:false,manuallyReviewed:true};
  if(["CLAIMED","REQUIRES_CHECK"].includes(status)&&outcome==="NO")return {status:"DECLINED",allowSaleCommit:false,allowResend:false,manuallyReviewed:true};
  if(paymentMethod!=="CARD")throw new Error("Operator Yes/No applies to card transactions unless an uncertain result is under manual review");
  if(status!=="DISPATCHED")throw new Error("Card result is accepted only after one-shot dispatch");
  if(outcome==="YES")return {status:"OPERATOR_CONFIRMED",allowSaleCommit:true,allowResend:false};
  if(outcome==="NO")return {status:"DECLINED",allowSaleCommit:false,allowResend:false};
  throw new Error("Unsupported operator result");
}

export function isFinalRbsFiscalRequestStatus(status){
  return FINAL_OUTCOMES.has(status);
}
