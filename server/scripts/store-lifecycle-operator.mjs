// Reviewed service-operator entry point for the explicitly authorized KAT task.
// Uses the SAME controller/guards/recovery as the UI; never mints a human token.
import {pathToFileURL} from 'node:url';
const fail=message=>{throw Error(message)};
export function lifecycleOperatorRequest(argv,env){
 const [action,...rest]=argv;if(!['inspect','start','status','prepare','execute','abort','reopen'].includes(action))fail('Explicit lifecycle action required.');
 if(env.NODE_ENV!=='production'||env.RENDER_SERVICE_ID!=='srv-d9isenfavr4c73bdh52g')fail('Only the authorized production application service may run this operator.');
 const options={};for(let i=0;i<rest.length;i+=2){const key=rest[i];if(!['--approval','--company','--store','--operation','--snapshot','--confirmation','--reports','--attestation'].includes(key)||options[key]!==undefined||typeof rest[i+1]!=='string')fail('Invalid operator arguments.');options[key]=rest[i+1]}
 if(options['--approval']!=='STORE-LIFECYCLE-01'||options['--company']!=='pilot-company'||options['--store']!=='kat-store')fail('Only the explicitly authorized KAT scope is supported.');
 if(['status','prepare','execute','abort','reopen'].includes(action)&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(options['--operation']||''))fail('Exact operation required.');
 if(action==='execute'&&(!/^[a-f0-9]{64}$/.test(options['--snapshot']||'')||options['--confirmation']!=='ΚΑΤ'&&options['--confirmation']!=='KAT'))fail('Exact prepared snapshot and KAT confirmation required.');
 if(action==='prepare'&&(!options['--reports']||!options['--attestation']))fail('Actual bound reports and explicit technician attestation are required.');
 return {action,options,scope:{companyId:'pilot-company',storeId:'kat-store'},actor:{id:'service-operator:render:STORE-LIFECYCLE-01',platformRole:'SUPER_ADMIN'}};
}
export async function runLifecycleOperator(argv,env=process.env){
 const request=lifecycleOperatorRequest(argv,env);const {prisma}=await import('../src/prisma.js'),{createLifecycleController}=await import('../src/services/store-lifecycle-controller.js');
 try{
  const controller=createLifecycleController(prisma),{action,actor,scope,options}=request,operationId=options['--operation'];
  if(action==='inspect'||action==='start')return await controller[action](actor,scope);
  if(action==='status')return await controller.status(actor,scope,operationId);
  if(action==='prepare'){
   const {readFile,stat}=await import('node:fs/promises');const paths=options['--reports'].split(',');if(paths.length!==2)fail('Reports from BOTH KAT registers are required.');
   const load=async path=>{const info=await stat(path);if(!info.isFile()||info.size>32000)fail('Report limit exceeded.');const bytes=await readFile(path);if(bytes.length>32000)fail('Report limit exceeded.');return JSON.parse(bytes.toString('utf8'))};
   const reports=await Promise.all(paths.map(load)),attestation=await load(options['--attestation']);return await controller.prepare(actor,scope,{operationId,reports,attestation});
  }
  return await controller[action](actor,scope,{operationId,snapshotHash:options['--snapshot'],confirmation:options['--confirmation']});
 }finally{await prisma.$disconnect()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runLifecycleOperator(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:error.status?'LIFECYCLE_CHECK_REFUSED':'OPERATOR_FAILED',status:error.status||null})+'\n');process.exitCode=1});
}
