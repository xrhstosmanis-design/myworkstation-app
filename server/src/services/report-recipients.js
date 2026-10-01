import { z } from "zod";

export function normalizeReportRecipients(value){
  return [...new Set((Array.isArray(value)?value:[value]).flatMap(item=>String(item||"").split(/[,;]/)).map(item=>item.trim().toLowerCase()).filter(Boolean))];
}

export const reportRecipientListSchema=z.string().trim().max(1000).refine(value=>{
  if(/[\r\n]/.test(value))return false;
  if(!value)return true;
  const parts=value.split(/[,;]/).map(item=>item.trim());
  return parts.length<=10&&parts.every(item=>z.string().email().safeParse(item).success);
},"Συμπληρώστε έως 10 έγκυρα email, χωρισμένα με κόμμα.").transform(value=>normalizeReportRecipients(value).join(", "));
