// Internal bounded-memory recovery transport. Does not mount an executor or
// establish production storage, row ownership, schema recovery or write fencing.
import {createHash,randomUUID} from 'node:crypto';
import {open,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {STORE_RECOVERY_FORMAT,persistLifecycleRecovery,openLifecycleRecovery} from './store-lifecycle-recovery.js';

const STREAM_FORMAT='MWS_STORE_RECOVERY_STREAM_V1';
const fail=()=>{throw new Error('Invalid or incomplete streamed store recovery.')};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashRows=()=>createHash('sha256');
const addRow=(hash,row)=>hash.update(String(Buffer.byteLength(row))+':').update(row);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const snapshotHash=tables=>digest(Buffer.from(JSON.stringify(tables)));
const MAX_ROW_BYTES=8*1024*1024,MAX_CHUNKS=10000,MAX_ROWS=500000;

function validateTables(tables){
 if(!Array.isArray(tables)||!tables.length||tables.length>300)fail();
 const names=new Set();
 for(const t of tables){if(!t||typeof t.name!=='string'||!t.name||t.name.length>200||names.has(t.name)||!['KEEP','REMOVE'].includes(t.action))fail();names.add(t.name)}
}

export async function digestLifecycleRows(rows){
 const hash=hashRows();let rowCount=0,sourceBytes=0;
 for await(const row of rows){if(typeof row!=='string')fail();const size=Buffer.byteLength(row);if(size>MAX_ROW_BYTES||++rowCount>MAX_ROWS)fail();sourceBytes+=size;addRow(hash,row)}
 return {rowCount,sha256:hash.digest('hex'),sourceBytes};
}

export async function persistLifecycleRecoveryStream(descriptor,{readRows,chunkBytes=4*1024*1024,...options}){
 validateTables(descriptor?.tables);
 if(typeof readRows!=='function'||!Number.isSafeInteger(chunkBytes)||chunkBytes<1024||chunkBytes>8*1024*1024||!hex(descriptor.schemaSignature))fail();
 const streamId=randomUUID(),createdAt=new Date().toISOString();
 const common={format:STORE_RECOVERY_FORMAT,scope:descriptor.scope,manifestHash:descriptor.manifestHash,sourceRevision:descriptor.sourceRevision,createdAt,streamId,schemaSignature:descriptor.schemaSignature};
 const chunks=[],tables=[],created=[];let totalRows=0,indexSaved=false;
 try{
  for(const table of descriptor.tables){
   const tableHash=hashRows();let rows=[],bytes=0,rowCount=0;
   const flush=async()=>{
    if(!rows.length)return;
    if(chunks.length>=MAX_CHUNKS)fail();
    const sequence=chunks.length,firstRow=rowCount-rows.length;
    const saved=await persistLifecycleRecovery({...common,sequence,firstRow,tables:[{name:table.name,rows}]},options);
    created.push(saved.artifactPath);
    chunks.push({table:table.name,sequence,firstRow,rowCount:rows.length,filename:path.basename(saved.artifactPath),sha256:saved.sha256});
    rows=[];bytes=0;
   };
   // readRows must yield deterministic SQL row_to_json TEXT, never parsed JS
   // objects: bigint/numeric/timestamp precision belongs to PostgreSQL.
   for await(const row of readRows(table.name)){
    if(typeof row!=='string')fail();
    const size=Buffer.byteLength(row);if(size>MAX_ROW_BYTES||++totalRows>MAX_ROWS)fail();
    if(bytes+size>chunkBytes)await flush();
    rows.push(row);bytes+=size;rowCount++;addRow(tableHash,row);
   }
   await flush();tables.push({name:table.name,action:table.action,rowCount,sha256:tableHash.digest('hex')});
  }
  const value={...common,tables:[],streamFormat:STREAM_FORMAT,chunks,tableDigests:tables,rowCount:totalRows,snapshotHash:snapshotHash(tables)};
  // The final authenticated index is the commit marker. Orphan chunks alone
  // never establish a complete recovery artifact.
  const saved=await persistLifecycleRecovery(value,options);indexSaved=true;
  return {...saved,streamId,snapshotHash:value.snapshotHash,rowCount:totalRows,chunkCount:chunks.length,restoreVerified:false};
 }catch(error){if(!indexSaved)await Promise.all(created.map(filename=>unlink(filename).catch(()=>{})));throw error}
}

export async function* readLifecycleRecoveryStream(indexBytes,options){
 const index=openLifecycleRecovery(indexBytes,options);
 if(index.streamFormat!==STREAM_FORMAT||!Array.isArray(index.chunks)||index.chunks.length>MAX_CHUNKS||!hex(options.expectedSnapshotHash)||index.snapshotHash!==options.expectedSnapshotHash||!hex(options.expectedSchemaSignature)||index.schemaSignature!==options.expectedSchemaSignature)fail();
 validateTables(index.tableDigests);
 if(snapshotHash(index.tableDigests)!==index.snapshotHash)fail();
 const root=await realpath(options.directory),chunks=index.chunks;
 let sequence=0,totalRows=0;
 const filenames=new Set();
 for(const table of index.tableDigests){
  if(!Number.isSafeInteger(table.rowCount)||table.rowCount<0||!hex(table.sha256))fail();
  const hash=hashRows();let rowCount=0;
  while(sequence<chunks.length&&chunks[sequence].table===table.name){
   const c=chunks[sequence];
   if(c.sequence!==sequence||c.firstRow!==rowCount||!Number.isSafeInteger(c.rowCount)||c.rowCount<1||!hex(c.sha256)||typeof c.filename!=='string'||!/^[-a-f0-9]{36}\.mws-recovery$/.test(c.filename)||filenames.has(c.filename))fail();
   filenames.add(c.filename);
   const filename=path.join(root,c.filename);
   // Reject symlink redirection outside the configured private recovery root.
   if(await realpath(filename)!==filename)fail();
   const file=await open(filename,'r');let bytes;
   try{if((await file.stat()).size>46*1024*1024)fail();bytes=await file.readFile()}finally{await file.close()}
   if(digest(bytes)!==c.sha256)fail();
   const value=openLifecycleRecovery(bytes,options);
   if(value.streamId!==index.streamId||value.schemaSignature!==index.schemaSignature||value.sequence!==sequence||value.firstRow!==rowCount||value.tables.length!==1||value.tables[0].name!==table.name||value.tables[0].rows.length!==c.rowCount)fail();
   for(const row of value.tables[0].rows){if(Buffer.byteLength(row)>MAX_ROW_BYTES)fail();addRow(hash,row);rowCount++;if(++totalRows>MAX_ROWS)fail()}
   yield {table:table.name,action:table.action,firstRow:c.firstRow,rows:value.tables[0].rows};
   sequence++;
  }
  if(rowCount!==table.rowCount||hash.digest('hex')!==table.sha256)fail();
 }
 if(sequence!==chunks.length||totalRows!==index.rowCount)fail();
}

export async function verifyLifecycleRecoveryStream(indexBytes,options){
 // This is full authenticated readback, NOT proof of an isolated SQL restore.
 let rowCount=0,chunkCount=0;
 for await(const chunk of readLifecycleRecoveryStream(indexBytes,options)){rowCount+=chunk.rows.length;chunkCount++}
 return {storageReadbackVerified:true,restoreVerified:false,rowCount,chunkCount};
}
