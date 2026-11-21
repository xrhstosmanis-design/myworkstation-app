import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReportSecurityCatalogue,projectReportSecurityCatalogue} from '../src/services/automatic-report-security-compatibility.js';
export const canonical=()=>({schema:'public',name:'StoreChatAccessRevocation',notNullConstraintAnomalies:0,kind:'r',persistence:'p',ownerEqualsStore:true,rls:false,forced:false,partition:false,inherited:false,rewritten:false,policies:0,triggers:0,dropped:0,acl:null,options:null,replica:'d',tablespace:0,columns:['companyId','storeId','userId'].map((name,i)=>({name,position:i+1,type:'text',notNull:true,default:null,identity:'',generated:'',acl:null,collation:'default',collationSchema:'pg_catalog'})),constraints:[{name:'StoreChatAccessRevocation_pkey',kind:'p',definition:'PRIMARY KEY ("companyId", "storeId", "userId")',validated:true,deferrable:false,deferred:false}],indexes:[{name:'StoreChatAccessRevocation_pkey',method:'btree',primary:true,unique:true,valid:true,ready:true,live:true,immediate:true,exclusion:false,keys:['companyId','storeId','userId'],expression:null,predicate:null,options:null,sameOwner:true,opclasses:['text_ops','text_ops','text_ops'],opclassSchemas:['pg_catalog','pg_catalog','pg_catalog'],collations:['default','default','default'],collationSchemas:['pg_catalog','pg_catalog','pg_catalog'],indoptions:[0,0,0],keyCount:3,totalCount:3,acl:null,tablespace:0}]});
test('standalone projection retains security evidence and rejects unknown relations without mutation',()=>{
 const input={schema:'public',relations:[{name:'Store'},{name:'StoreChatAccessRevocation',catalogue:canonical()}],security:canonical()},before=JSON.stringify(input);
 const result=projectReportSecurityCatalogue(input,{knownTables:['Store']});assert.deepEqual(result.relations,[{name:'Store'}]);assert.deepEqual(result.preservedSecurity,input.security);assert.equal(JSON.stringify(input),before);
 assert.throws(()=>projectReportSecurityCatalogue({...input,relations:[...input.relations,{name:'Unknown'}]},{knownTables:['Store']}));
});
test('closed metadata refuses drift including dependencies and security ownership',()=>{
 for(const mutate of [c=>c.ownerEqualsStore=false,c=>c.ownerEqualsStore='false',c=>delete c.rls,c=>c.indexes[0].opclasses[0]='text_pattern_ops',c=>c.indexes[0].indoptions[0]=1,c=>c.rls=true,c=>c.triggers=1,c=>c.dropped=1,c=>c.columns[0].default="'x'::text",c=>c.columns.reverse(),c=>c.constraints.push({...c.constraints[0],kind:'f'}),c=>c.indexes[0].keys.push('userId'),c=>c.policies=1,c=>c.acl='{}']){const c=canonical();mutate(c);assert.throws(()=>validateReportSecurityCatalogue(c),{code:'REPORT_SECURITY_CATALOGUE_CHANGED'});}
});
test('projection binds the exact descriptor and schema, not a free-floating approved table name',()=>{
 const security=canonical(),input={schema:'public',relations:[{name:'StoreChatAccessRevocation',catalogue:structuredClone(security)}],security};
 input.relations[0].catalogue.rls=true;assert.throws(()=>projectReportSecurityCatalogue(input,{knownTables:[]}));
 input.relations[0].catalogue=security;input.schema='foreign';assert.throws(()=>projectReportSecurityCatalogue(input,{knownTables:[]}));
});
test('proof is explicitly snapshot-only, binds immutable definition and never grants execution',()=>{
 const evidence=validateReportSecurityCatalogue(canonical());assert.equal(evidence.kind,'SNAPSHOT_ONLY');assert.equal(evidence.integrationRequiresFreshLockedValidation,true);assert.equal(evidence.productionWiring,false);assert.match(evidence.definitionSha256,/^[a-f0-9]{64}$/);
});
test('missing or additional closed fields cannot silently weaken security validation',()=>{
 const c=canonical();delete c.ownerEqualsStore;assert.throws(()=>validateReportSecurityCatalogue(c));
 const d=canonical();d.unreviewed=true;assert.throws(()=>validateReportSecurityCatalogue(d));
 const e=canonical();e.notNullConstraintAnomalies=1;assert.throws(()=>validateReportSecurityCatalogue(e));
});

test('projection output cannot mutate its source and extra relation metadata refuses',()=>{
 const security=canonical(),input={schema:'public',relations:[{name:'Store'},{name:'StoreChatAccessRevocation',catalogue:security}],security},before=JSON.stringify(input);
 const out=projectReportSecurityCatalogue(input,{knownTables:['Store']});out.preservedSecurity.columns[0].name='altered';out.relations[0].name='changed';assert.equal(JSON.stringify(input),before);
 input.relations[1].unreviewed=true;assert.throws(()=>projectReportSecurityCatalogue(input,{knownTables:['Store']}));
});
