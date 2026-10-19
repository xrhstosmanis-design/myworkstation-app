import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';

const failure=message=>Object.assign(new Error(message),{code:'WHOLESALE_LAB_ISOLATION_REQUIRED'});
export function assertLabConfiguration(env=process.env){
  if(env.WHOLESALE_LAB!=='1'||!/^[a-f0-9]{64}$/.test(env.LAB_BOOT_NONCE||''))throw failure('Explicit disposable wholesale laboratory configuration is required.');
  let url;try{url=new URL(env.DATABASE_URL)}catch{throw failure('The laboratory requires its own loopback PostgreSQL database.')}
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='5432'||url.username!=='whlab_runtime'||url.pathname!=='/wholesale_lab'||url.hash)throw failure('External or non-laboratory database targets are forbidden.');
  const allowed=new Map([['schema','public'],['connection_limit','4'],['pool_timeout','10']]);
  for(const [key,value] of url.searchParams)if(allowed.get(key)!==value||url.searchParams.getAll(key).length!==1)throw failure('Unexpected laboratory database connection options.');
  for(const key of ['DIRECT_URL','SHADOW_DATABASE_URL','JWT_SECRET','PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGPASSFILE','PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGSSLMODE','PGSSLROOTCERT'])if(env[key])throw failure('Inherited database or authentication configuration is forbidden.');
  for(const key of Object.keys(env))if(key!=='DATABASE_URL'&&env[key]&&/(?:DATABASE|POSTGRES|SUPABASE).*(?:URL|KEY|PASSWORD)$/i.test(key))throw failure('Inherited external database credentials are forbidden.');
  for(const key of Object.keys(env))if(env[key]&&/^(?:SMTP_|SENDGRID_|MAILGUN_|NETLINK_|RBS_|MYDATA_|STRIPE_|OPENAI_API_KEY|AZURE_OPENAI_|VAPID_PRIVATE)/i.test(key))throw failure('Provider credentials do not belong in this laboratory.');
  return Object.freeze({databaseUrl:url.toString(),bootNonce:env.LAB_BOOT_NONCE,bootId:crypto.randomUUID()});
}

export async function initializeLabMarker(db,config){
  const rows=await db.$queryRaw`SELECT current_database() AS name`;
  if(rows[0]?.name!=='wholesale_lab')throw failure('The laboratory database identity does not match.');
  await db.$executeRawUnsafe('CREATE TABLE "LabRuntimeMarker" ("id" TEXT PRIMARY KEY CHECK ("id"=\'wholesale-lab\'),"bootNonce" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await db.$executeRaw`INSERT INTO "LabRuntimeMarker" ("id","bootNonce") VALUES ('wholesale-lab',${config.bootNonce})`;
}
export function labIsolationAssertion(config){
  return async db=>{
    const rows=await db.$queryRaw`SELECT current_database() AS name,"bootNonce" FROM "LabRuntimeMarker" WHERE "id"='wholesale-lab'`;
    if(rows.length!==1||rows[0].name!=='wholesale_lab'||rows[0].bootNonce!==config.bootNonce)throw failure('The disposable laboratory marker is absent or belongs to another boot.');
    return true;
  };
}
export async function assertEmptyLabDatabase(db){
  const rows=await db.$queryRaw`SELECT current_database() AS name,(SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','f')) AS tables`;
  if(rows[0]?.name!=='wholesale_lab'||rows[0].tables!==0)throw failure('Initialization requires a completely empty disposable laboratory database. Existing databases are never reset.');
}

const loopback=host=>['127.0.0.1','::1','localhost'].includes(String(host||'localhost').replace(/^\[|\]$/g,''));
// The dedicated entrypoint never imports the production server, jobs or provider
// routes. This fence is installed BEFORE importing even the allowed routers.
export function installLabOutboundFence(){
  let blocked=0;const originals=[];
  const deny=()=>{blocked++;const error=Object.assign(new Error('External transports are disabled in the wholesale laboratory.'),{code:'WHOLESALE_LAB_OUTBOUND_BLOCKED'});error.safeTrace=error.stack.split('\n').slice(1,7).map(line=>line.match(/(?:node:[\w/.-]+|[^/\s()]+\.m?js):\d+:\d+/)?.[0]||'internal transport');throw error};
  const replace=(object,key,fn)=>{originals.push([object,key,object[key]]);object[key]=fn};
  const socketConnect=net.Socket.prototype.connect;
  replace(net.Socket.prototype,'connect',function(...args){
    const input=Array.isArray(args[0])?args[0]:args,first=input[0];
    if(typeof first==='object'&&first!==null){if(first.path||!loopback(first.host))return deny()}
    else if(typeof first==='number'||/^\d+$/.test(String(first))){if(!loopback(typeof input[1]==='string'?input[1]:'localhost'))return deny()}
    else return deny();
    return socketConnect.apply(this,args);
  });
  const httpRequest=http.request;
  replace(http,'request',function(...args){
    const first=args[0],options=typeof first==='string'||first instanceof URL?new URL(first):first||{};
    if(!loopback(options.hostname||String(options.host||'localhost').split(':')[0])||options.socketPath)return deny();
    return httpRequest.apply(this,args);
  });
  for(const [object,key] of [[tls,'connect'],[https,'request'],[https,'get'],[http2,'connect'],[dgram,'createSocket']])replace(object,key,deny);
  const lookup=dns.lookup;
  // Node Server.listen resolves even the numeric wildcard before binding. Its
  // lookup is local (no DNS dispatch); outbound sockets to it remain forbidden.
  replace(dns,'lookup',function(host,...args){if(!loopback(host)&&host!=='0.0.0.0')return deny();return lookup.call(this,host,...args)});
  for(const key of Object.keys(dns))if(/^(?:resolve|reverse$|lookupService$)/.test(key)&&typeof dns[key]==='function')replace(dns,key,deny);
  const promiseLookup=dns.promises.lookup;
  replace(dns.promises,'lookup',async function(host,...args){if(!loopback(host))return deny();return promiseLookup.call(this,host,...args)});
  for(const key of Object.keys(dns.promises))if(/^(?:resolve|reverse$|lookupService$)/.test(key)&&typeof dns.promises[key]==='function')replace(dns.promises,key,async()=>deny());
  const originalFetch=globalThis.fetch;
  replace(globalThis,'fetch',function(input,options={}){
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.protocol!=='http:'||!loopback(url.hostname)||url.username||url.password)return Promise.reject((()=>{try{deny()}catch(error){return error}})());
    return originalFetch(input,{...options,redirect:'error'});
  });
  syncBuiltinESMExports();
  return {get blocked(){return blocked},restore(){for(const [object,key,value] of originals.reverse())object[key]=value;syncBuiltinESMExports()}};
}

// The only child is the local Prisma schema CLI. Disable its optional update
// network and install the same transport fence before its imports, too.
if(process.env.WHOLESALE_LAB_PRISMA_CHILD==='1')installLabOutboundFence();
