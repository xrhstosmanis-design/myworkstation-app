import {z} from "zod";
import {assistantSalesPeriodClarification} from "./assistant-conversation-context.js";

export const ASSISTANT_OUTPUT_TOKENS=4096;
export const ASSISTANT_RECOVERY_TOKENS=6144;
const answer=z.object({answer:z.string().max(16000),highlights:z.array(z.string().max(1000)).max(5),sources:z.array(z.string().max(250)).max(8).optional(),limitations:z.string().max(4000)}).strict();
const fail=(message,code,status=502)=>{throw Object.assign(new Error(message),{status,code})};
export function assistantResponseText(raw){
 if(typeof raw?.output_text==="string"&&raw.output_text.trim())return raw.output_text;
 return (Array.isArray(raw?.output)?raw.output:[]).flatMap(item=>Array.isArray(item.content)?item.content:[]).filter(item=>item.type==="output_text"&&typeof item.text==="string").map(item=>item.text).join("");
}
export function assistantResponseDiagnostics(raw){
 const status=["completed","incomplete","failed","cancelled","queued","in_progress"].includes(raw?.status)?raw.status:"unknown";
 const reason=["max_output_tokens","content_filter"].includes(raw?.incomplete_details?.reason)?raw.incomplete_details.reason:null;
 const reasoning=raw?.usage?.output_tokens_details?.reasoning_tokens;
 return {responseStatus:status,incompleteReason:reason,hasOutputText:Boolean(assistantResponseText(raw).trim()),toolCallCount:Array.isArray(raw?.output)?raw.output.filter(i=>i.type==="function_call").length:0,reasoningTokens:Number.isSafeInteger(reasoning)&&reasoning>=0?reasoning:null};
}
export function mayRetryAssistantResponse(raw){return raw?.status==="incomplete"&&raw.incomplete_details?.reason==="max_output_tokens";}
export function assistantAnswerFromResponse(raw,evidence=[],{providerOK=true,requireEvidence=false,question=""}={}){
 const refusal=(Array.isArray(raw?.output)?raw.output:[]).some(item=>(Array.isArray(item?.content)?item.content:[]).some(c=>c?.type==="refusal"));
 if(refusal||raw?.incomplete_details?.reason==="content_filter")fail("Ο βοηθός δεν μπορεί να απαντήσει στο συγκεκριμένο αίτημα. Διατύπωσέ το ως αναζήτηση αναφοράς.","AI_RESPONSE_REFUSED",422);
 const text=assistantResponseText(raw);
 if(providerOK&&(!raw?.status||raw.status==="completed")&&text.length<=65536){
  try{const parsed=answer.parse(JSON.parse(text));if(requireEvidence&&!evidence.length)return assistantSalesPeriodClarification(question)||{answer:"Δεν ολοκληρώθηκε η ανάγνωση της αναφοράς. Δοκίμασε ξανά την ίδια αναζήτηση.",highlights:[],sources:[],limitations:"Μη συνδεδεμένη ή μη αναγνωσμένη πηγή δεν αποδεικνύει ότι δεν υπάρχουν εγγραφές.",sourceUnavailable:true};return {...parsed,...(evidence.length?{sources:[...new Set(evidence.map(r=>r.source).filter(v=>typeof v==="string"))].slice(0,8)}:{})};}catch{}
 }
 // The callers have reauthorized and checked the canonical reports before this
 // fallback. No model text, partial JSON or old conversation amounts are used.
 if(evidence.length&&evidence.every(r=>r&&Array.isArray(r.rows)&&[undefined,"product_sales","product_stock","sales_by_store","consumption","business_records"].includes(r.kind)))return {
  answer:"Τα πραγματικά στοιχεία της αναφοράς είναι διαθέσιμα στους πίνακες παρακάτω.",highlights:[],sources:[...new Set(evidence.map(r=>r.source).filter(v=>typeof v==="string"))].slice(0,8),
  limitations:"Η σύνοψη του AI δεν ολοκληρώθηκε. Εμφανίζονται μόνο τα στοιχεία και οι περιορισμοί των πραγματικών πηγών, χωρίς εκτιμήσεις ή συμπεράσματα αιτίας.",sourceOnly:true
 };
 if(!providerOK||raw?.status==="failed")fail("Η υπηρεσία AI δεν ολοκλήρωσε την αναζήτηση. Δοκίμασε ξανά χωρίς να καταχωρίσεις νέα συναλλαγή.","AI_PROVIDER_ERROR");
 fail("Δεν ολοκληρώθηκε η απάντηση και δεν διαβάστηκε αναφορά. Δοκίμασε μία συγκεκριμένη ερώτηση με κατάστημα και ημερομηνίες.",raw?.status==="incomplete"?"AI_RESPONSE_INCOMPLETE":"AI_INVALID_RESPONSE");
}
