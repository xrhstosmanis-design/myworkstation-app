import {PrismaClient} from '@prisma/client';
import {provisionAiWalletRecovery} from '../src/services/ai-owner-wallet-schema.js';
// Ordinary deployment only: empty reviewed financial tables, never a wallet
// balance, receipt, trial grant, notification, enrollment or charging flag.
if(process.env.NODE_ENV==='production'){
 const db=new PrismaClient();
 try{console.log(JSON.stringify({event:'AI_WALLET_RECOVERY_SCHEMA',...await provisionAiWalletRecovery(db)}));}
 catch{console.error(JSON.stringify({event:'AI_WALLET_RECOVERY_SCHEMA',available:false,chargingEnabled:false}));process.exitCode=1;}
 finally{await db.$disconnect();}
}
