import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/store-lifecycle-verify-copy.py',import.meta.url));
const block=(name,rows)=>`COPY public."${name}" (id, payload) FROM stdin;\n${rows}\\.\n`;
const sequence=value=>`SELECT pg_catalog.setval('public."A_id_seq"', ${value}, true);\n`;
const header='-- PostgreSQL data dump\n\\restrict TOKEN123\nSET statement_timeout = 0;\nSELECT pg_catalog.set_config(\'search_path\', \'\', false);\n';
function run(expected,restored){
 const dir=mkdtempSync(join(tmpdir(),'lifecycle-copy-'));
 try{
  const paths=['expected.sql','restored.sql'].map(n=>join(dir,n));
  writeFileSync(paths[0],expected);writeFileSync(paths[1],restored);
  const result=spawnSync('python3',[script,...paths],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);return result;
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test('COPY audit compares exact bigint/decimal/UTF8/escaped binary rows without printing payloads',()=>{
 const a=block('A','9007199254740993\tPRIVATE ΑΚΡΙΒΕΣ 1.123456789 \\\\x00ff\n'),b=block('B','');
 const result=run(header+a+b+sequence('9007199254740993')+'\\unrestrict TOKEN123\n',header.replace('TOKEN123','OTHER456')+b+a+sequence('9007199254740993')+'\\unrestrict OTHER456\n');
 assert.equal(result.status,0);const proof=JSON.parse(result.stdout);assert.equal(proof.tables,2);assert.equal(proof.rows,1);assert.equal(proof.sequences,1);assert.equal(proof.executionAuthorized,false);assert.match(proof.sha256,/^[a-f0-9]{64}$/);assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE|ΑΚΡΙΒΕΣ/);
});
test('COPY audit refuses changed precision, duplicate substitution, extra or missing tables and changed sequence state',()=>{
 const a=block('A','9007199254740993\tPRIVATE ONE\n2\tPRIVATE TWO\n'),expected=header+a+sequence('9007199254740993');
 for(const candidate of [expected.replace('9007199254740993\t','9007199254740992\t'),header+block('A','9007199254740993\tPRIVATE ONE\n9007199254740993\tPRIVATE ONE\n')+sequence('9007199254740993'),expected+block('Extra',''),header+block('Other','')+sequence('9007199254740993'),header+a+sequence('9007199254740992')]){
  const result=run(expected,candidate);assert.equal(result.status,1);assert.deepEqual(JSON.parse(result.stderr),{dataMatches:false,error:'ValueError'});assert.doesNotMatch(result.stderr,/PRIVATE|ONE|TWO/);
 }
});
test('COPY audit accepts SQL row reorder while preserving exact duplicate multiplicity and canonical digest',()=>{
 const a=header+block('A','2\tPRIVATE TWO\n1\tPRIVATE ONE\n2\tPRIVATE TWO\n');
 const b=header+block('A','2\tPRIVATE TWO\n2\tPRIVATE TWO\n1\tPRIVATE ONE\n');
 const same=run(a,a),reordered=run(a,b);assert.equal(reordered.status,0);assert.deepEqual(JSON.parse(same.stdout),JSON.parse(reordered.stdout));assert.equal(JSON.parse(reordered.stdout).rowOrder,'UNORDERED_MULTISET');
 assert.equal(run(a,b.replace('1\tPRIVATE ONE','2\tPRIVATE TWO')).status,1);
});
test('COPY audit fails closed on incomplete, duplicate and unsupported data formats',()=>{
 const valid=header+block('A','1\tPRIVATE\n');
 for(const invalid of [header,valid.slice(0,-3),valid+block('A',''),valid+sequence('1')+sequence('1'),valid+'INSERT INTO public."A" VALUES (2,\'PRIVATE\');\n',valid+'SELECT pg_catalog.lo_create(123);\n',valid+'\\connect other\n']){
  const result=run(invalid,invalid);assert.equal(result.status,1);assert.doesNotMatch(result.stderr,/PRIVATE|public|other/);
 }
});
test('COPY audit preserves a large row with bounded streaming input',()=>{
 const text=header+block('A','1\t'+('X'.repeat(2*1024*1024))+'\n');
 const result=run(text,text);assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).rows,1);assert.ok(result.stdout.length<500);
});
