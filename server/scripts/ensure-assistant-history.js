import {PrismaClient} from '@prisma/client';
import {provisionAssistantHistory} from '../src/services/assistant-history-provision.js';

// The ordinary application startup invokes this reviewed, additive provisioning.
// A refusal leaves history unavailable and preserves POS/application startup.
if(process.env.NODE_ENV==='production'){
 const db=new PrismaClient();
 try{console.log(JSON.stringify({event:'ASSISTANT_HISTORY_PROVISION',...await provisionAssistantHistory(db)}))}
 catch{console.error(JSON.stringify({event:'ASSISTANT_HISTORY_PROVISION',available:false,code:'ASSISTANT_HISTORY_PROVISION_UNAVAILABLE'}))}
 finally{await db.$disconnect()}
}
