import {paperError,rawPaperSchema,normalizePaper} from './cash-paper-contract.js';

export function createCashPaperReader({repository,provider,maxActive=2}){
  let active=0;
  async function read(scope,actor,{messageId,checksum}){
    if(await repository.generation(scope)!==scope.generation)throw paperError('STORE_LIFECYCLE_STALE_GENERATION');
    const source=await repository.source(scope,messageId,checksum);
    const existing=await repository.get(scope,checksum);
    if(existing.status!=='NOT_READ')return {...existing,reused:true};
    provider.configuration();
    if(active>=maxActive)throw paperError('CASH_PAPER_BUSY',429);
    active++;
    try{
      // Preparation can fail safely before intent/provider dispatch.
      const content=await provider.prepare(source);
      const claimed=await repository.claim(scope,actor,messageId,checksum);
      if(!claimed.claimed)return {...claimed.state,reused:true};
      let result;
      try{const raw=rawPaperSchema.parse(await provider.read(scope,content));normalizePaper(raw);result={status:'EXTRACTED_UNVERIFIED',raw};}
      catch{result={status:'REQUIRES_REVIEW'};}
      // Commit separately with the ORIGINAL generation. A lost completion is
      // still a durable intent, never permission for another paid dispatch.
      return await repository.complete(scope,actor,messageId,checksum,result);
    }finally{active--;}
  }
  return {read};
}
