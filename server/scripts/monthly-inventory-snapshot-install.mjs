// Unmounted install-only operator. This purpose acknowledgement does not grant
// production approval: the named, reviewed execution packet is a separate step.
// No startup script invokes this command; existing KAT/reset tooling is separate.
import {pathToFileURL} from 'node:url';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
const serviceId='srv-d9isenfavr4c73bdh52g';
const purpose='MONTHLY-INVENTORY-INSTALL-ONLY';
const capturePurpose='MONTHLY-INVENTORY-CAPTURE3-INSTALL-ONLY';
const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'MONTHLY_INSTALL_OPERATOR_REFUSED'})};
const exactText=(value,limit)=>typeof value==='string'&&value.length>0&&value.trim()===value&&!/[\u0000-\u001f\u007f]/u.test(value)&&Buffer.byteLength(value,'utf8')<=limit;

export function monthlyInventorySnapshotInstallRequest(argv,env=process.env){
 if(!Array.isArray(argv)||argv.some(value=>typeof value!=='string'))fail('Explicit operator arguments required.');
 const [action,...args]=argv;
 if(!['describe','inspect','install'].includes(action)||args.length%2)fail('Explicit describe, inspect or install action required.');
 const sourceRevision=env.RENDER_GIT_COMMIT||env.GIT_COMMIT;
 if(typeof sourceRevision!=='string'||sourceRevision.length!==40||!/^[a-f0-9]{40}$/u.test(sourceRevision))fail('Exact running source revision required.');
 const options=Object.create(null);
 for(let index=0;index<args.length;index+=2){
  const key=args[index],value=args[index+1];
  if(!['--company','--store','--packet','--approval'].includes(key)||Object.hasOwn(options,key)||!exactText(value,key==='--packet'?4096:160))fail('Invalid operator arguments.');
  options[key]=value;
 }
 if(action==='describe'){
  if(Object.keys(options).length)fail('Describe accepts no scope or execution arguments.');
  return Object.freeze({action,sourceRevision,enabled:false});
 }
 if(env.NODE_ENV!=='production'||env.RENDER_SERVICE_ID!==serviceId)fail('Only the reviewed application service may inspect or install.');
 if(!options['--company']||!options['--store'])fail('Explicit selected company and store required.');
 if(action==='inspect'&&(options['--packet']!==undefined||options['--approval']!==undefined))fail('Inspection accepts no execution arguments.');
 const enabled=env.MWS_MONTHLY_INVENTORY_INSTALL_ENABLED==='true';
 if(action==='install'&&(!enabled||!options['--packet']||options['--approval']!==purpose))fail('Installation requires explicit enablement, purpose and reviewed packet.');
 return Object.freeze({action,sourceRevision,enabled,scope:Object.freeze({companyId:options['--company'],storeId:options['--store']}),actor:Object.freeze({id:'service-operator:render:'+purpose,platformRole:'SUPER_ADMIN'}),...(action==='install'?{packetPath:options['--packet']}: {})});
}

// CAPTURE3 is an explicit separate operator purpose. The legacy parser remains
// unchanged and still rejects profile flags when invoked directly.
export function monthlyInventoryCaptureInstallRequest(argv,env=process.env){
 if(!Array.isArray(argv)||argv.some(value=>typeof value!=='string'))fail('Explicit operator arguments required.');
 const locations=argv.flatMap((value,index)=>index%2===1&&value==='--profile'?[index]:[]);
 if(locations.length!==1||locations[0]<1||locations[0]%2!==1||argv[locations[0]+1]!=='CAPTURE3')fail('Explicit closed CAPTURE3 profile required.');
 const stripped=argv.filter((value,index)=>index!==locations[0]&&index!==locations[0]+1);
 const approval=stripped.indexOf('--approval');
 if(approval!==-1){if(stripped[approval+1]!==capturePurpose)fail('Separate CAPTURE3 installation purpose required.');stripped[approval+1]=purpose;}
 const request=monthlyInventorySnapshotInstallRequest(stripped,{NODE_ENV:env.NODE_ENV,RENDER_SERVICE_ID:env.RENDER_SERVICE_ID,RENDER_GIT_COMMIT:env.RENDER_GIT_COMMIT,GIT_COMMIT:env.GIT_COMMIT,MWS_MONTHLY_INVENTORY_INSTALL_ENABLED:env.MWS_MONTHLY_INVENTORY_CAPTURE_INSTALL_ENABLED});
 return Object.freeze({...request,installationProfile:'CAPTURE3',...(request.actor?{actor:Object.freeze({id:'service-operator:render:'+capturePurpose,platformRole:'SUPER_ADMIN'})}:{})});
}

async function readPacket(file){
 // Read at most 64 KiB + one byte from one opened, non-symlink regular file.
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const info=await handle.stat();if(!info.isFile()||info.size<2||info.size>65536)fail('Installation packet size is invalid.');
  const buffer=Buffer.alloc(65537);let length=0;
  while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(!result.bytesRead)break;length+=result.bytesRead;}
  if(length<2||length>65536)fail('Installation packet size is invalid.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)));
 }finally{await handle.close();}
}

export async function runMonthlyInventorySnapshotInstall(argv,env=process.env){
 const request=Array.isArray(argv)&&argv.some((value,index)=>index%2===1&&value==='--profile')?monthlyInventoryCaptureInstallRequest(argv,env):monthlyInventorySnapshotInstallRequest(argv,env);
 const {createMonthlyInventorySnapshotInstallation,createMonthlyInventoryCaptureInstallation}=await import('../src/services/monthly-inventory-snapshot-installation.js');
 const create=request.installationProfile==='CAPTURE3'?createMonthlyInventoryCaptureInstallation:createMonthlyInventorySnapshotInstallation;
 if(request.action==='describe')return create(null,{sourceRevision:request.sourceRevision}).describe();
 // Argument and bounded-file admission happen before importing the DB client.
 const packet=request.action==='install'?await readPacket(request.packetPath):undefined;
 const {prisma}=await import('../src/prisma.js');
 try{
  const installer=create(prisma,{sourceRevision:request.sourceRevision,enabled:request.enabled});
  return request.action==='inspect'?await installer.inspect(request.actor,request.scope):await installer.install(request.actor,{...request.scope,packet});
 }finally{await prisma.$disconnect();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runMonthlyInventorySnapshotInstall(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
  process.stderr.write(JSON.stringify({ok:false,error:error.status?'MONTHLY_INSTALLATION_CHECK_REFUSED':'MONTHLY_INSTALLATION_OPERATOR_FAILED',status:error.status||null})+'\n');process.exitCode=1;
 });
}
