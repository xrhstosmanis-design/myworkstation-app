import {z} from "zod";
import {authorizePlatformAssistant,createPlatformAssistantSession} from "./platform-assistant-products.js";
import {readAssistantExportTicket} from "./assistant-export-ticket.js";
import {buildAssistantReportFile} from "./assistant-report-files.js";
const bodySchema=z.object({ticket:z.string().min(1).max(24000),format:z.enum(["xlsx","pdf","csv","docx"])}).strict();
export function createAssistantExportHandler({authorize=authorizePlatformAssistant,createSession=createPlatformAssistantSession,buildFile=buildAssistantReportFile,secret=()=>process.env.JWT_SECRET,makeSignal=()=>AbortSignal.timeout(60000)}={}){
 return async(req,res,next)=>{try{
  const body=bodySchema.parse(req.body||{});await authorize(req,null);
  const ticket=readAssistantExportTicket(req,body.ticket,{secret:secret()}),signal=makeSignal();
  const session=await createSession(req,ticket.selection,{signal,allStores:ticket.allStores}),evidence=await session.replay(ticket.reads);
  const artifact=await buildFile(body.format,evidence);await session.verify();signal.throwIfAborted();
  res.json({...artifact,sources:evidence.map(r=>r.source),scope:session.scope});
 }catch(e){next(e)}};
}
