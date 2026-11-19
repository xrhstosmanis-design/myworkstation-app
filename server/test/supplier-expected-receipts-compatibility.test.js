import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {
 EXPECTED_RECEIPT_COMPATIBILITY_DEFINITION as definition,
 EXPECTED_RECEIPT_COMPATIBILITY_HASH as definitionHash,
 canonicalCompatibilityJSON
} from '../src/services/supplier-expected-receipts-compatibility-definition.js';
import {validateExpectedReceiptCompatibility as validate} from '../src/services/supplier-expected-receipts-compatibility.js';

const fixture=JSON.parse(await readFile(new URL('./fixtures/supplier-expected-receipts-compatibility.json',import.meta.url),'utf8'));
const lineTable='SupplierExpectedReceiptLine';
const allocationTable='SupplierExpectedReceiptAllocation';
const operationTable='SupplierExpectedReceiptOperation';
const clone=()=>structuredClone(fixture);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sortedPayload(value){
 if(Array.isArray(value))return value.map(sortedPayload);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortedPayload(value[key])]));
 return value;
}
function refreshOperation(input,index){
 const evidence=input.operationEvidence[index];
 input.rows[operationTable][index].payloadDigest=digest({
  actorId:evidence.actorId,action:evidence.action,expectedId:evidence.expectedId,body:sortedPayload(evidence.body)
 });
}
function refreshSource(input){
 const sourceDigest=digest(input.entities.sourceEvidence[0].snapshot);
 input.rows[allocationTable][0].sourceDigest=sourceDigest;
 input.operationEvidence[1].body.sourceDigest=sourceDigest;
 refreshOperation(input,1);
}
function check(input){
 const before=JSON.stringify(input);
 const result=validate(input);
 assert.equal(JSON.stringify(input),before,'validator must preserve every supplied byte/value');
 assert.equal(result.activationReady,false);
 return result;
}
function invalidData(mutator){
 const input=clone();
 mutator(input);
 const result=check(input);
 assert.equal(result.compatible,false,mutator.toString());
 assert.ok(result.dataStatus==='INVALID'||result.replayStatus==='INVALID',JSON.stringify(result));
 assert.ok(result.issues.length>0);
 return result;
}

test('immutable definition has a stable reviewed hash and keeps execution disabled',()=>{
 assert.equal(definitionHash,'19f6f2ab25445c8f9d84e95333623ea8b6d572a66374ab16604cbbcf4395e15a');
 assert.equal(definitionHash,createHash('sha256').update(canonicalCompatibilityJSON(definition)).digest('hex'));
 assert.equal(definition.activation,false);
 assert.equal(definition.executionDisabled,true);
 assert.deepEqual(definition.ownership.restoreOrder,[lineTable,allocationTable,operationTable]);
 assert.throws(()=>{definition.tables[0].columns[0].name='changed'},TypeError);
 assert.throws(()=>{definition.tables.push({})},TypeError);
});

test('independent schema snapshot, historical operation chain and rejected receipt match without activation',()=>{
 const result=check(clone());
 assert.equal(result.schemaStatus,'MATCH');
 assert.equal(result.dataStatus,'VERIFIED');
 assert.equal(result.replayStatus,'VERIFIED');
 assert.equal(result.compatible,true);
 assert.equal(result.evidenceBoundary,'SUPPLIED_EVIDENCE_MATCH_ONLY');
 assert.deepEqual(result.issues,[]);
 // Current remaining is zero after cancellation. The older link result still records eight.
 assert.equal(fixture.rows[lineTable][0].cancelledQuantity,'8');
 assert.equal(fixture.rows[operationTable][1].result.remainingQuantity,'8');
 assert.equal(fixture.rows[operationTable][2].result.remainingQuantity,'0');
 assert.deepEqual(Object.keys(fixture.rows[operationTable][3].result).sort(),['message','rejected']);
});

test('receipt digests match the real existing writer algorithm, including raw envelope order',async()=>{
 const service=await readFile(new URL('../src/services/supplier-expected-receipts.js',import.meta.url),'utf8');
 const start=service.indexOf('function canonicalPayload(value)');
 const end=service.indexOf('export async function mutateExpectedReceipt',start);
 assert.ok(start>=0&&end>start);
 const writerDigest=new Function('digest',service.slice(start,end)+'\nreturn operationDigest;')(digest);
 for(const [index,evidence] of fixture.operationEvidence.entries()){
  const actual=writerDigest({user:{id:evidence.actorId},body:evidence.body},evidence.action,evidence.expectedId);
  assert.equal(actual,fixture.rows[operationTable][index].payloadDigest);
 }
 const evidence=fixture.operationEvidence[0];
 const reordered=createHash('sha256').update(canonicalCompatibilityJSON({
  actorId:evidence.actorId,action:evidence.action,expectedId:evidence.expectedId,body:evidence.body
 })).digest('hex');
 assert.notEqual(reordered,fixture.rows[operationTable][0].payloadDigest);
});

test('missing schema and incomplete evidence cannot certify compatibility',()=>{
 const missing=clone();missing.catalog.tables=[];missing.catalog.incomingReferences=[];
 assert.equal(check(missing).status,'UNINSTALLED');
 const partial=clone();partial.catalog.tables.pop();
 assert.equal(check(partial).schemaStatus,'INCOMPATIBLE');
 const schemaOnly=check({catalog:fixture.catalog});
 assert.equal(schemaOnly.dataStatus,'NOT_PROVIDED');
 assert.equal(schemaOnly.replayStatus,'NOT_PROVIDED');
 assert.equal(schemaOnly.compatible,false);
 for(const field of ['entities','operationEvidence']){
  const input=clone();delete input[field];
  const result=check(input);
  assert.equal(result.compatible,false);
  assert.ok(result.dataStatus==='UNVERIFIED'||result.replayStatus==='UNVERIFIED');
 }
 const noSource=clone();delete noSource.entities.sourceEvidence;
 assert.equal(check(noSource).dataStatus,'UNVERIFIED');
});

test('type, precision, nullability, defaults, constraints, indexes and incoming references are exact',()=>{
 const mutations=[
  input=>{input.catalog.tables[0].columns[5].type='numeric(23,6)'},
  input=>{input.catalog.tables[0].columns[4].notNull=false},
  input=>{input.catalog.tables[0].columns[10].default='1'},
  input=>{input.catalog.tables[0].columns.push({name:'unreviewed',type:'text',notNull:false,default:null})},
  input=>{input.catalog.tables[0].checks.pop()},
  input=>{input.catalog.tables[1].foreignKeys[0].onDelete='CASCADE'},
  input=>{input.catalog.tables[1].foreignKeys[0].referencedSchema='other_schema'},
  input=>{input.catalog.tables[0].indexes[1].columns.reverse()},
  input=>{input.catalog.tables[0].indexes[1].predicate='true'},
  input=>{input.catalog.tables[0].unsupportedMetadata=true},
  input=>{input.catalog.tables[0].triggers.push({name:'unexpected',definition:'trigger'})},
  input=>{input.catalog.incomingReferences.push({...input.catalog.incomingReferences[0],table:'OutsideTable'})}
 ];
 for(const mutate of mutations){
  const input=clone();mutate(input);
  const result=check(input);
  assert.equal(result.schemaStatus,'INCOMPATIBLE',JSON.stringify(result));
  assert.equal(result.compatible,false);
 }
});

test('malformed catalog, row and evidence entries return structured findings',()=>{
 for(const value of [null,3,'invalid']){
  const catalog=clone();catalog.catalog.tables[0]=value;
  assert.equal(check(catalog).compatible,false);
  const rows=clone();rows.rows[lineTable][0]=value;
  assert.equal(check(rows).dataStatus,'INVALID');
  const evidence=clone();evidence.operationEvidence[0]=value;
  assert.equal(check(evidence).compatible,false);
 }
 const missingRows=clone();missingRows.rows=null;
 assert.equal(check(missingRows).dataStatus,'INVALID');
 const malformedSource=clone();malformedSource.entities.sourceEvidence[0].snapshot=null;
 assert.equal(check(malformedSource).compatible,false);
});

test('tenant, store, supplier, product and allocation links retain their owned identities',()=>{
 const mutations=[
  input=>{input.rows[lineTable][0].companyId='other-company'},
  input=>{input.rows[allocationTable][0].storeId='other-store'},
  input=>{input.rows[allocationTable][0].expectedLineId='missing'},
  input=>{input.rows[allocationTable][0].productId='other-product'},
  input=>{input.entities.PurchaseOrder[0].supplierId='other-supplier'},
  input=>{input.entities.PurchaseOrder[0].storeId='other-store'},
  input=>{input.entities.Product[0].companyId='other-company'},
  input=>{input.rows[operationTable].push(structuredClone(input.rows[operationTable][0]))}
 ];
 for(const mutate of mutations)invalidData(mutate);
});

test('exact quantities and versions reject corruption without Number rounding',()=>{
 for(const mutate of [
  input=>{input.rows[lineTable][0].expectedStockQuantity='13'},
  input=>{input.rows[lineTable][0].invoiceQuantity='2.0000001'},
  input=>{input.rows[lineTable][0].version=1.5},
  input=>{input.rows[lineTable][0].cancelledQuantity='13'},
  input=>{input.rows[allocationTable][0].quantity='9'},
  input=>{input.rows[allocationTable][0].quantity=4},
  input=>{input.rows[allocationTable][0].quantity='0.0000000000001'}
 ])invalidData(mutate);
});

test('source snapshots bind hash, order, supplier and stock unit rather than a hex string alone',()=>{
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.order.supplierId='other';refreshSource(input)});
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.order.id='other';refreshSource(input)});
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.order.unit='KG';refreshSource(input)});
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.moves[0].movementType='OTHER';refreshSource(input)});
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.moves[0].quantity='0';refreshSource(input)});
 invalidData(input=>{input.entities.sourceEvidence[0].snapshot.moves[0].quantity='3';refreshSource(input)});
 invalidData(input=>{input.rows[allocationTable][0].sourceDigest='b'.repeat(64)});
});

test('historical scoped actor evidence permits global Super Admin and distinguishes absence from contradiction',()=>{
 const input=clone(),actor='global-admin';
 for(const row of input.rows[lineTable]){row.confirmedBy=actor;row.cancelledBy=actor}
 for(const row of input.rows[allocationTable])row.actorId=actor;
 for(const [index,row] of input.rows[operationTable].entries()){
  row.actorId=actor;
  input.operationEvidence[index].actorId=actor;
  if(input.operationEvidence[index].body.intentActorId)input.operationEvidence[index].body.intentActorId=actor;
  refreshOperation(input,index);
 }
 input.entities.User=[{id:actor,companyId:null,role:'SUPER_ADMIN'}];
 input.entities.actorScopes=[{companyId:input.scope.companyId,storeId:input.scope.storeId,actorId:actor}];
 assert.equal(check(input).compatible,true);
 delete input.entities.actorScopes;
 assert.equal(check(input).dataStatus,'UNVERIFIED');
 const absent=clone();delete absent.entities.actorScopes;delete absent.entities.User;
 assert.equal(check(absent).dataStatus,'UNVERIFIED');
 invalidData(other=>{
  delete other.entities.actorScopes;
  other.entities.User[0].companyId='other-company';other.entities.User[0].historicalAuthority=true;
 });
});

test('operation evidence binds the actual action, expected id and payload even with a self-consistent digest',()=>{
 for(const mutate of [
  input=>{input.operationEvidence[0].action='cancel';refreshOperation(input,0)},
  input=>{input.operationEvidence[0].expectedId='line-a';refreshOperation(input,0)},
  input=>{input.operationEvidence[0].body.productId='other-product';refreshOperation(input,0)},
  input=>{input.operationEvidence[1].expectedId='other-line';refreshOperation(input,1)},
  input=>{input.operationEvidence[1].body.orderId='other-order';refreshOperation(input,1)},
  input=>{input.operationEvidence[1].body.quantity='3';refreshOperation(input,1)},
  input=>{input.operationEvidence[1].body.version=1;refreshOperation(input,1)},
  input=>{input.operationEvidence[2].body.reason='Changed cancellation';refreshOperation(input,2)},
  input=>{input.operationEvidence[0].body.extra='unknown';refreshOperation(input,0)},
  input=>{Object.assign(input.operationEvidence[0].body,{intentActorId:'other',intentCompanyId:input.scope.companyId,intentGeneration:'0'});refreshOperation(input,0)},
  input=>{Object.assign(input.operationEvidence[0].body,{intentActorId:input.rows[lineTable][0].confirmedBy,intentCompanyId:'other',intentGeneration:'0'});refreshOperation(input,0)},
  input=>{input.operationEvidence[0].body.intentActorId=input.rows[lineTable][0].confirmedBy;refreshOperation(input,0)},
  input=>{input.rows[operationTable][0].result.extra='unknown'},
  input=>{input.rows[operationTable][3].result.id='not-a-rejected-field'}
 ])invalidData(mutate);
});

test('journal restoration requires exactly one confirm, each allocation and the complete committed version chain',()=>{
 const removeOperation=(input,index)=>{input.rows[operationTable].splice(index,1);input.operationEvidence.splice(index,1)};
 invalidData(input=>{input.rows[operationTable]=[];input.operationEvidence=[]});
 invalidData(input=>removeOperation(input,0));
 invalidData(input=>removeOperation(input,1));
 invalidData(input=>removeOperation(input,2));
 invalidData(input=>{input.rows[lineTable][0].version=3});
 invalidData(input=>{input.rows[lineTable][0].cancelledBy='other-actor'});
 invalidData(input=>{
  const operation=structuredClone(input.rows[operationTable][0]);
  const evidence=structuredClone(input.operationEvidence[0]);
  operation.key='10000000-0000-4000-8000-000000000099';
  evidence.key=operation.key;evidence.body.idempotencyKey=operation.key;
  input.rows[operationTable].push(operation);input.operationEvidence.push(evidence);
  refreshOperation(input,input.rows[operationTable].length-1);
 });
 invalidData(input=>{
  input.rows[operationTable][1].result.remainingQuantity='7';
  input.operationEvidence[1].result.remainingQuantity='7';
 });
 invalidData(input=>{
  input.rows[operationTable][2].result.version=1;
  input.operationEvidence[2].result.version=1;
 });
});

test('raw numeric quantities and trimmed successful fields retain the real writer digest',()=>{
 const input=clone();
 input.operationEvidence[0].body.invoiceQuantity=2;
 input.operationEvidence[0].body.stockUnitsPerInvoiceUnit=6;
 input.operationEvidence[0].body.invoiceUnit=' PACKAGE ';
 input.operationEvidence[1].body.quantity=4;
 input.operationEvidence[2].body.reason=' '+input.rows[lineTable][0].cancellationReason+' ';
 for(let index=0;index<input.operationEvidence.length;index++)refreshOperation(input,index);
 const result=check(input);
 assert.equal(result.compatible,true,JSON.stringify(result));
});

test('supported extreme and sub-unit snapshots preserve all exact NUMERIC digits',()=>{
 for(const [quantity,factor,expected] of [
  ['999999999.999999','999999999.999999','999999999999998000.000000000001'],
  ['0.000001','0.000001','0.000000000001']
 ]){
  const input=clone(),line=input.rows[lineTable][0];
  Object.assign(line,{invoiceQuantity:quantity,stockUnitsPerInvoiceUnit:factor,expectedStockQuantity:expected,
   cancelledQuantity:'0',version:0,cancelledBy:null,cancelledAt:null,cancellationReason:null});
  input.rows[allocationTable]=[];
  input.rows[operationTable]=[input.rows[operationTable][0]];
  input.operationEvidence=[input.operationEvidence[0]];
  input.entities.sourceEvidence=[];
  Object.assign(input.operationEvidence[0].body,{invoiceQuantity:quantity,stockUnitsPerInvoiceUnit:factor});
  input.rows[operationTable][0].result.expectedStockQuantity=expected;
  input.operationEvidence[0].result.expectedStockQuantity=expected;
  refreshOperation(input,0);
  assert.equal(check(input).compatible,true,'exact quantity '+expected);
 }
});
