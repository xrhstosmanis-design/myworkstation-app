import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {provisionAutomaticReportDispatchSchema} from '../src/services/automatic-report-dispatch-schema.js';
import {assertDispatchStorageAbsent,captureDispatchCatalog,assertDispatchCatalog,schemaIdentifier} from '../src/services/automatic-report-provision-catalog.js';

export const REVIEWED_DDL_SHA256='9b58b81fe64a7972ddadef73f62f4b81fc2417619fab0943fd3da42dc2612c6f';
const SERVICE='srv-d9isenfavr4c73bdh52g';
export function validateProvisionConnection(value,expected){
  let u;try{u=new URL(value);}catch{throw new Error('PROVISION_CONNECTION_INVALID');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hash||!u.username||!u.hostname||!expected?.host||!expected?.database||u.hostname!==expected.host||decodeURIComponent(u.pathname)!=='/'+expected.database)throw new Error('PROVISION_CONNECTION_IDENTITY');
  if(!Number.isInteger(expected.port)||expected.port<1||expected.port>65535||Number(u.port||5432)!==expected.port)throw new Error('PROVISION_CONNECTION_PORT');
  schemaIdentifier(expected.schema);
  const seen=new Set();
  for(const [key,v]of u.searchParams){
    if(seen.has(key))throw new Error('PROVISION_CONNECTION_OVERRIDE');seen.add(key);
    if(key==='schema'&&v===expected.schema)continue;
    if(key==='sslmode'&&['require','verify-full','verify-ca','prefer'].includes(v))continue;
    if(key==='connection_limit'&&/^[1-9][0-9]?$/.test(v))continue;
    if(key==='pool_timeout'&&/^[0-9]{1,2}$/.test(v))continue;
    throw new Error('PROVISION_CONNECTION_OVERRIDE');
  }
  if((u.searchParams.get('schema')||'public')!==expected.schema)throw new Error('PROVISION_CONNECTION_SCHEMA');
  return true;
}
function assertRuntime(options,env){
  if(env.RENDER_SERVICE_ID!==SERVICE||options.serviceId!==SERVICE||! /^[0-9a-f]{40}$/.test(options.revision||'')||env.RENDER_GIT_COMMIT!==options.revision)throw new Error('PROVISION_RUNTIME_IDENTITY');
  // This first-install tranche authorizes missing-control OFF only. Later OFF
  // control enrollment is a separately reviewed operation.
  if(env.AUTOMATIC_REPORT_ACTIVATION_CONTROL)throw new Error('PROVISION_CONTROL_NOT_MISSING_OFF');
  if(options.exclusiveMaintenance!==true)throw new Error('PROVISION_EXCLUSIVE_MAINTENANCE_REQUIRED');
  if(options.ddlSha256!==REVIEWED_DDL_SHA256)throw new Error('PROVISION_SOURCE_IDENTITY');
  validateProvisionConnection(env.DATABASE_URL,options);
}
async function identity(tx,options){
  const [r]=await tx.$queryRawUnsafe('SELECT current_database() AS database,current_schema() AS schema,inet_server_port() AS port,current_setting(\'server_version_num\')::int AS version');
  if(r.database!==options.database||r.schema!==options.schema||r.port!==options.port||Math.floor(r.version/10000)!==18)throw new Error('PROVISION_DATABASE_IDENTITY');
}
export async function runProvision(db,options,env=process.env){
  assertRuntime(options,env);
  const bytes=await readFile(new URL('../src/services/automatic-report-dispatch-schema.js',import.meta.url));
  if(createHash('sha256').update(bytes).digest('hex')!==REVIEWED_DDL_SHA256)throw new Error('PROVISION_SOURCE_CHANGED');
  if(options.execute){
    if(options.ack!=='PROVISION_SIX_EMPTY_DISPATCH_TABLES_OFF')throw new Error('PROVISION_ACK_REQUIRED');
    if(options.oracle?.serverMajor!==18)throw new Error('PROVISION_PG18_ORACLE_REQUIRED');
    assertDispatchCatalog(options.oracle,options.oracle);
  }
  return db.$transaction(async tx=>{
    if(!options.execute)await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 1000');
    await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 5000');
    assertRuntime(options,env);await identity(tx,options);
    const [events]=await tx.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_catalog.pg_event_trigger WHERE evtenabled <> 'D'");
    if(events?.count!==0)throw new Error('PROVISION_EVENT_TRIGGER_PRESENT');
    if(options.execute){
      const [lock]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(2704,3075) AS acquired');
      if(lock.acquired!==true)throw new Error('PROVISION_MAINTENANCE_BUSY');
    }
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${schemaIdentifier(options.schema)}, pg_temp`);
    await assertDispatchStorageAbsent(tx,options.schema);
    if(!options.execute)return {mode:'READ_ONLY_PREFLIGHT',dispatch:'OFF',storage:'ALL_SIX_ABSENT',revision:options.revision};
    await provisionAutomaticReportDispatchSchema({$transaction:fn=>fn(tx)});
    const actual=await captureDispatchCatalog(tx,options.schema);
    assertDispatchCatalog(actual,options.oracle);
    assertRuntime(options,env);
    return {mode:'PROVISIONED_SIX_EMPTY_TABLES',dispatch:'OFF',catalogSha256:createHash('sha256').update(JSON.stringify(actual)).digest('hex'),revision:options.revision};
  },{maxWait:5000,timeout:15000});
}

async function main(){
  const args=process.argv.slice(2);
  if(args.some(a=>a!=='--execute'))throw new Error('PROVISION_UNKNOWN_ARGUMENT');
  const execute=args.includes('--execute');
  const options={execute,serviceId:process.env.MWS_PROVISION_SERVICE_ID,revision:process.env.MWS_PROVISION_REVISION,host:process.env.MWS_PROVISION_DATABASE_HOST,port:Number(process.env.MWS_PROVISION_DATABASE_PORT),database:process.env.MWS_PROVISION_DATABASE_NAME,schema:process.env.MWS_PROVISION_SCHEMA,ddlSha256:process.env.MWS_PROVISION_DDL_SHA256,exclusiveMaintenance:process.env.MWS_PROVISION_EXCLUSIVE_MAINTENANCE==='true',ack:process.env.MWS_PROVISION_ACK};
  assertRuntime(options,process.env);
  if(execute){
    // A missing independently captured PG18 fixture must stop before opening DB.
    options.oracle=JSON.parse(await readFile(new URL('../test/fixtures/automatic-report-provision-catalog-pg18.json',import.meta.url),'utf8'));
  }
  const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
  try{console.log(JSON.stringify(await runProvision(db,options)));}finally{await db.$disconnect();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  console.error(JSON.stringify({error:/^PROVISION_[A-Z0-9_]+$/.test(error.message)?error.message:'PROVISION_FAILED',code:/^[A-Z0-9]{4,8}$/.test(error.code||'')?error.code:undefined}));process.exitCode=1;
});
