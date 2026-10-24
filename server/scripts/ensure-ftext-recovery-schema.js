import {PrismaClient} from '@prisma/client';
import {provisionFtextRecoverySchema} from '../src/services/ftext-cash-schema.js';
// Ordinary deployment only. This creates an empty reviewed queue, never a
// device, pairing, payment, receipt or lifecycle enrollment. Failure prevents
// starting an app whose canonical recovery profile requires a missing table.
if(process.env.NODE_ENV==='production'){
 const db=new PrismaClient();
 try{console.log(JSON.stringify({event:'FTEXT_RECOVERY_SCHEMA',...await provisionFtextRecoverySchema(db)}));}
 catch{console.error(JSON.stringify({event:'FTEXT_RECOVERY_SCHEMA',available:false,checkoutEnabled:false}));process.exitCode=1;}
 finally{await db.$disconnect();}
}
