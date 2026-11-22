import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parse} from '@babel/parser';
import {createMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
import {createMonthlyInventoryCaptureSchema} from '../src/services/monthly-inventory-capture-schema.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sources=[
 'server/src/backoffice-staff-bootstrap.js',
 'server/src/services/ai-owner-wallet-schema.js',
 'server/src/services/ftext-cash-schema.js',
 'server/src/chat-interactions.mjs',
 'server/src/services/monthly-inventory-snapshot-schema.js',
 'server/src/services/monthly-inventory-capture-schema.js'
];
const expected=['BackofficeStaffAccount','BackofficeStaffGrant','BackofficeStaffAudit','BackofficeStaffLoginGuard','AiOwnerWallet','AiOwnerWalletEntry','AiOwnerWalletNotice','AiOwnerWalletAudit','FtextCashRequest','StoreChatDelivery','StoreChatReaction','MonthlyInventorySnapshot','MonthlyInventoryCaptureGrant','MonthlyInventoryCaptureJob'];
const sha=value=>createHash('sha256').update(value).digest('hex');
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(item=>walk(item,visit));else if(value&&typeof value==='object')walk(value,visit)}}
function splitColumns(text){const result=[];let start=0,depth=0,quote=null;for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote){if(text[i+1]===quote)i++;else quote=null}continue}if(c==="'"||c==='"'){quote=c;continue}if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){result.push(text.slice(start,i).trim());start=i+1}}result.push(text.slice(start).trim());return result}
function defaultSql(definition){const found=/\bDEFAULT\s+/i.exec(definition);if(!found)return null;const tail=definition.slice(found.index+found[0].length);let quote=null,depth=0,end=tail.length;for(let i=0;i<tail.length;i++){const c=tail[i];if(quote){if(c===quote){if(tail[i+1]===quote)i++;else quote=null}continue}if(c==="'"||c==='"'){quote=c;continue}if(c==='(')depth++;else if(c===')')depth--;if(depth===0&&/^(?:\s+)(?:CHECK|REFERENCES|CONSTRAINT|PRIMARY\s+KEY|UNIQUE|NOT\s+NULL|GENERATED)\b/i.test(tail.slice(i))){end=i;break}}
 const value=tail.slice(0,end).trim();if(/^(?:true|false)$/i.test(value))return value.toLowerCase();if(/^(?:now|clock_timestamp)\(\)$/i.test(value))return value.toLowerCase();if(/^CURRENT_TIMESTAMP$/i.test(value))return 'CURRENT_TIMESTAMP';if(/^-?\d+(?:\.\d+)?$/.test(value))return value;if(/^'(?:[^']|'')*'::(?:jsonb|text|bigint|integer|numeric|boolean)$/i.test(value))return value;if(/^'(?:[^']|'')*'$/.test(value)&&/\bTEXT\b/i.test(definition))return value+'::text';throw new Error('Unreviewed source DEFAULT expression: '+value)
}
export async function buildCurrentDefaultReview(){
 const provenance=[],statements=[];for(const path of sources){const source=await readFile(resolve(root,path),'utf8');provenance.push({path,sha256:sha(source)});walk(parse(source,{sourceType:'module'}),node=>{let value;if(node.type==='StringLiteral')value=node.value;else if(node.type==='TemplateLiteral'&&node.expressions.length===0)value=node.quasis[0].value.cooked;if(typeof value==='string'&&/^\s*CREATE TABLE\s/i.test(value))statements.push({source:path,sql:value})})}
 const recorder={async $executeRawUnsafe(sql){if(/^\s*CREATE TABLE\s/i.test(sql))statements.push({source:recorder.source,sql});return 0},async $queryRawUnsafe(sql){if(sql==='SELECT current_schema() AS schema')return[{schema:'public'}];throw new Error('Unexpected recorder query: '+sql)}};
 recorder.source=sources[4];await createMonthlyInventorySnapshotSchema(recorder);recorder.source=sources[5];await createMonthlyInventoryCaptureSchema(recorder);
 const tables={};for(const entry of statements){const match=/^\s*CREATE TABLE(?: IF NOT EXISTS)?\s+(?:"public"\.)?"([^"]+)"\s*\(/i.exec(entry.sql);if(!match||!expected.includes(match[1]))continue;const name=match[1];if(tables[name])throw new Error('Duplicate canonical table '+name);const body=entry.sql.slice(match[0].length,entry.sql.lastIndexOf(')'));const columns=[];for(const definition of splitColumns(body)){const column=/^"([^"]+)"\s+/.exec(definition);if(!column)continue;if(/\bGENERATED\b|\bIDENTITY\b/i.test(definition))throw new Error('New generated/identity source needs review');columns.push({name:column[1],defaultExpression:defaultSql(definition),identity:'',generated:''})}tables[name]={source:entry.source,createSqlSha256:sha(entry.sql),columns}}
 if(JSON.stringify(Object.keys(tables).sort())!==JSON.stringify([...expected].sort()))throw new Error('Exact14 canonical table sources required');return{format:'MWS_COMPANY_CURRENT_CAPTURE_DEFAULT_REVIEW_V1',policy:'SOURCE_DERIVED_DEFAULTS_ONLY_NO_LIVE_ROW_OR_SCHEMA_ADMISSION',sourceFiles:provenance,tables:Object.fromEntries(Object.entries(tables).sort(([a],[b])=>a.localeCompare(b)))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const document=await buildCurrentDefaultReview();const target=resolve(root,'ops/backup/lifecycle/backoffice-company-current-defaults.proposed.json');if(process.argv.includes('--write'))await writeFile(target,JSON.stringify(document,null,2)+'\n');else{const stored=JSON.parse(await readFile(target,'utf8'));if(JSON.stringify(stored)!==JSON.stringify(document))throw new Error('Reviewed canonical defaults artifact drift')}console.log(JSON.stringify({tables:Object.keys(document.tables).length,columns:Object.values(document.tables).reduce((n,t)=>n+t.columns.length,0),mode:process.argv.includes('--write')?'prepared-from-source':'verified-from-source'}))}
