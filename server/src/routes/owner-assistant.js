import {createNativeAssistantHistory,createAssistantHistoryHttp} from '../services/assistant-history-http.js';
import {assistantResponseDiagnostics} from "../services/assistant-answer-response.js";
import {Router} from "express";
import {auth} from "../middleware/auth.js";
import {authorizeOwnerAssistant} from "../services/owner-assistant-access.js";
import {createOwnerAssistantHandlers,ownerAnswerSchema} from "../services/owner-assistant-handlers.js";
import {aiCommandUsage} from "../services/ai-command-usage.js";

const requestProvider=async(settings,{signal,inputChannel})=>{
  const model=process.env.OPENAI_COMMAND_CENTER_MODEL||"gpt-5-mini";
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal,body:JSON.stringify({model,reasoning:{effort:"low"},max_output_tokens:1200,...settings,text:{format:{type:"json_schema",name:"owner_assistant_answer",strict:true,schema:ownerAnswerSchema}}})});
  const raw=await response.json().catch(()=>({}));
  console.info("AI_OWNER_ASSISTANT_USAGE",JSON.stringify({...aiCommandUsage(raw,inputChannel,model),...assistantResponseDiagnostics(raw),status:response.ok?"response_received":"provider_error"}));
  return {response,raw};
};
export function createOwnerAssistantRouter({authenticate=auth,historyTurns=createNativeAssistantHistory({mode:"owner"}),authorize=authorizeOwnerAssistant,provider=requestProvider,providerConfigured=()=>Boolean(process.env.OPENAI_API_KEY),readCash,readSales,readStock,authorizeSalesStores,readSalesStores}={}){
  const router=Router(),handlers=createOwnerAssistantHandlers({authorize,historyTurns,requestProvider:provider,providerConfigured,...(readCash?{readCash}:{}),...(readSales?{readSales}:{}),...(readStock?{readStock}:{}),...(authorizeSalesStores?{authorizeSalesStores}:{}),...(readSalesStores?{readSalesStores}:{})});
  router.use(authenticate);
  const history=createAssistantHistoryHttp({turns:historyTurns,mode:"owner"});
  router.get("/stores/:storeId/history",history.load);
  router.post("/stores/:storeId/history/reset",history.reset);
  router.get("/stores/:storeId/status",handlers.status);
  router.post("/stores/:storeId/ask",handlers.ask);
  return router;
}
export default createOwnerAssistantRouter();
