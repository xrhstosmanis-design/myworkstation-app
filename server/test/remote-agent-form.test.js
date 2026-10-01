import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('deployment form is retained across async submit and resets without creating a second job',async()=>{
 const source=fs.readFileSync(new URL('../../client/src/components/platform/DeviceOperationsCenter.jsx',import.meta.url),'utf8');
 const start=source.indexOf('const plan=async event=>{');
 const end=source.indexOf('\n\n  return <>',start);
 const body=source.slice(start,end).replace('const plan=','return ');
 let reset=0,requests=0,remote,error;
 const event={preventDefault(){},currentTarget:{reset(){reset++}}};
 const FakeFormData=class{constructor(element){assert.equal(element,event.currentTarget)}get(key){return {terminalId:'t',jobType:'REMOTE_ASSIST'}[key]}};
 const request=async()=>{requests++;event.currentTarget=null;return {id:'j',supportCode:'123456'}};
 const plan=new Function('FormData','request','base','setRemote','load','setError',body)(FakeFormData,request,'/test',x=>remote=x,async()=>{},x=>error=x);
 await plan(event);assert.equal(reset,1);assert.equal(requests,1);assert.equal(error,undefined);assert.equal(remote.terminalId,'t');
});
