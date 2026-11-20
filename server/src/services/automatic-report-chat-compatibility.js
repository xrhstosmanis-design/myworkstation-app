// Reports-only preservation metadata. This module does not create chat tables,
// install lifecycle guards, change chat behavior or authorize reset/deletion.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readOperationalReportCatalogue} from './automatic-report-source-compatibility.js';

const fixtureUrl=new URL('../../../ops/backup/lifecycle/report-chat-compatibility.proposed.json',import.meta.url);
const chatTables=['StoreChatGroup','StoreChatGroupMember','StoreChatGroupMessage','StoreChatMutedTopic'];
const chatNames=new Set(chatTables);
const document=()=>JSON.parse(readFileSync(fixtureUrl,'utf8'));
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const fail=()=>{throw Object.assign(new Error('Reviewed chat report catalogue differs.'),{code:'REPORT_OPERATIONAL_CHAT_CATALOGUE_CHANGED',status:409})};

export const reportChatCompatibilityDDL=()=>document().ddl;
export async function readReportChatCatalogue(tx,schema){
 const catalogue=await readOperationalReportCatalogue(tx,schema,chatTables);
 // The shared collector also observes the independent StoreProduct package
 // trigger. Its existing operational validator retains responsibility for it.
 return {...catalogue,triggers:catalogue.triggers.filter(trigger=>!(trigger.table==='StoreProduct'&&trigger.name==='mws_guard_package_stock_change'))};
}

function legacyMetadataKind(sql){
 if(sql.startsWith('SELECT c.relname AS name,c.relkind::text AS kind,c.relispartition AS partition,')&&sql.includes('FROM pg_class c'))return 'relations';
 if(sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,')&&sql.includes('FROM pg_attribute a'))return 'columns';
 if(sql.startsWith('SELECT child.relname AS child,parent.relname AS parent,')&&sql.includes('FROM pg_constraint c'))return 'fks';
 if(sql.startsWith('SELECT c.relname AS "table",ARRAY(SELECT a.attname::text FROM unnest(i.indkey)')&&sql.includes('FROM pg_index i'))return 'keys';
 if(sql.startsWith('SELECT c.relname AS "table",t.tgname AS name,t.tgenabled::text AS enabled,')&&sql.includes('p.prosrc AS body'))return 'triggers';
 if(sql.startsWith('SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,k.p::int AS position')&&sql.includes('FROM pg_index i'))return 'keys';
 return null;
}

export async function prepareReportChatInspection(tx,schema){
 if(typeof schema!=='string'||!schema||schema.length>128)fail();
 const fixture=document();
 if(canonical(fixture.knownTables)!==canonical(chatTables))fail();
 const catalogue=await readReportChatCatalogue(tx,schema);
 const catalogueHash=digest(catalogue);
 if(canonical(catalogue)!==canonical(fixture.catalogue)||catalogueHash!==fixture.catalogueHash)fail();
 const proxy=new Proxy(tx,{get(target,key){
  if(key!=='$queryRawUnsafe'){
   const value=Reflect.get(target,key);
   return typeof value==='function'?value.bind(target):value;
  }
  return async(sql,...args)=>{
   const result=await target.$queryRawUnsafe(sql,...args);
   if(args.length!==1||args[0]!==schema)return result;
   const kind=legacyMetadataKind(sql);
   if(!kind)return result;
   return result.filter(row=>{
    if(kind==='relations')return !chatNames.has(row.name);
    if(kind==='fks')return !((row.childSchema===schema&&chatNames.has(row.child))||(row.parentSchema===schema&&chatNames.has(row.parent)));
    return !chatNames.has(row.table);
   });
  };
 }});
 return {tx:proxy,evidence:{format:fixture.format,catalogueHash,preservedTables:[...chatTables],executionEnabled:false}};
}
