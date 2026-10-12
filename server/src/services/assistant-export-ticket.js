import crypto from "node:crypto";
import {z} from "zod";
import {parseAssistantSourceRead} from "./assistant-source-read.js";
const pair=z.object({companyId:z.string().min(1).max(160),storeId:z.string().min(1).max(160)}).strict();
const payloadSchema=z.object({purpose:z.literal("assistant-canonical-export-v1"),userId:z.string().min(1).max(160),sessionId:z.string().min(1).max(160),sessionVersion:z.number().int().nonnegative(),selection:pair.nullable(),allStores:z.boolean(),expiresAt:z.number().int().positive(),reads:z.array(z.unknown()).min(1).max(2)}).strict();
const ttl=5*60*1000;
const denied=()=>Object.assign(new Error("Η αναφορά δεν είναι πλέον διαθέσιμη για εξαγωγή. Ζήτησε ξανά την αναφορά στην ίδια ενεργή συνεδρία."),{status:403,code:"ASSISTANT_EXPORT_TICKET_DENIED"});
const mac=(content,secret)=>crypto.createHmac("sha256",secret).update(content).digest("base64url");
export function issueAssistantExportTicket(req,reads,evidence,{selection=null,allStores=false,secret=process.env.JWT_SECRET,now=Date.now()}={}){
 const u=req.user||{};
 if(!secret||!u.id||!u.sessionId||!Number.isInteger(u.sessionVersion)||!reads?.length)return null;
 const checked=reads.map((r,i)=>parseAssistantSourceRead(r.name==="cash_details"&&r.args.date===null?{...r,args:{date:evidence[i]?.date}}:r));
 const payload=payloadSchema.parse({purpose:"assistant-canonical-export-v1",userId:u.id,sessionId:u.sessionId,sessionVersion:u.sessionVersion,selection,allStores,expiresAt:now+ttl,reads:checked});
 const content=Buffer.from(JSON.stringify(payload)).toString("base64url");return content+"."+mac(content,secret);
}
export function readAssistantExportTicket(req,ticket,{secret=process.env.JWT_SECRET,now=Date.now()}={}){
 try{
  if(!secret||typeof ticket!=="string"||ticket.length>24000)throw denied();
  const parts=ticket.split(".");if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))throw denied();
  const expected=Buffer.from(mac(parts[0],secret)),actual=Buffer.from(parts[1]);if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw denied();
  const p=payloadSchema.parse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"))),u=req.user||{};
  if(p.userId!==u.id||p.sessionId!==u.sessionId||p.sessionVersion!==u.sessionVersion||p.expiresAt<=now||p.expiresAt>now+ttl||!p.selection&&!p.allStores)throw denied();
  return {...p,reads:p.reads.map(parseAssistantSourceRead)};
 }catch{throw denied()}
}
