import {walletError} from './ai-owner-wallet-contract.js';

const COUNT_URL='https://api.openai.com/v1/responses/input_tokens';
// Mutable remote URLs, conversations and tool-driven contexts can change
// between counting and generation. Those requests keep the full-model hold.
function immutableInput(input){
  if(typeof input==='string')return true;
  if(!Array.isArray(input)||!input.length)return false;
  return input.every(message=>message&&['user','system','developer'].includes(message.role)&&
    (!message.type||message.type==='message')&&
    (typeof message.content==='string'||Array.isArray(message.content)&&message.content.every(part=>{
      if(part?.type==='input_text')return typeof part.text==='string';
      if(part?.type==='input_image')return typeof part.image_url==='string'&&/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(part.image_url)&&!part.file_id;
      if(part?.type==='input_file')return typeof part.file_data==='string'&&part.file_data.startsWith('data:application/pdf;base64,')&&!part.file_id&&!part.file_url;
      return false;
    })));
}
export async function countInvoiceInput(settings,options,transport){
  if(settings.previous_response_id||settings.conversation||settings.prompt||settings.tools?.length||
    settings.truncation==='auto'||!immutableInput(settings.input))return null;
  const body={};
  // Current input-count API fields affecting the exact self-contained request.
  for(const key of ['model','input','instructions','reasoning','text','personality','truncation','parallel_tool_calls','tool_choice','tools']){
    if(settings[key]!==undefined)body[key]=settings[key];
  }
  try{
    options.signal?.throwIfAborted();
    const response=await transport(COUNT_URL,{...options,body:JSON.stringify(body)});
    if(!response.ok)throw Error('count unavailable');
    const result=await response.json();
    if(result?.object!=='response.input_tokens'||!Number.isSafeInteger(result.input_tokens)||result.input_tokens<0)throw Error('invalid count');
    options.signal?.throwIfAborted();
    return result.input_tokens;
  }catch{
    // No generation, reservation, automatic retry or paid fallback on failure.
    throw walletError('AI_WALLET_INPUT_COUNT_REQUIRED',409);
  }
}
