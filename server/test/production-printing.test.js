import test from 'node:test';
import assert from 'node:assert/strict';
import {printerSchema,printableText,productionTicket} from '../src/services/production-printing.js';
import {pendingPreparationLines,prepareDispatch} from '../../client/src/components/store/production-dispatch.js';
const memory=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
test('mixed cart excludes retail, returns and previously sent coffees; retains distinct prepared rows',()=>{
 const rows=[{id:'coffee',preparation:{}},{id:'water'},{id:'tobacco'},{id:'sent',preparation:{},productionSent:true},{id:'return',preparation:{},exchangeReturn:true},{id:'coffee',preparation:{note:'different'}}];
 assert.deepEqual(pendingPreparationLines(rows),[rows[0],rows[5]]);
});
test('lost reply/reopened modal retries original durable identity, different basket refuses, stores isolate',()=>{
 const storage=memory(),body={items:[{productId:'coffee',quantity:1}]};
 const a=prepareDispatch(storage,'kat',body,()=> 'first');
 assert.equal(prepareDispatch(storage,'kat',body,()=> 'second').request.requestId,'first');
 assert.throws(()=>prepareDispatch(storage,'kat',{items:[]},()=> 'third'),/αβέβαιο/);
 assert.equal(prepareDispatch(storage,'daily',body,()=> 'other').request.requestId,'other');
 storage.removeItem(a.key);assert.equal(prepareDispatch(storage,'kat',body,()=> 'new').request.requestId,'new');
});
test('storage failure prevents sending and printer binding requires explicit valid local endpoint/selection',()=>{
 assert.throws(()=>prepareDispatch({getItem:()=>null,setItem:()=>{throw Error('Quota')}},'kat',{},()=> 'id'),/Quota/);
 const settings={enabled:true,name:'Coffee',transport:'NETWORK',host:'192.168.1.87',productIds:['coffee']};assert.equal(printerSchema.parse(settings).port,9100);
 for(const host of ['8.8.8.8','192.168.999.87','localhost','192.168.1.87\n'])assert.equal(printerSchema.safeParse({...settings,host}).success,false);
 assert.equal(printerSchema.safeParse({...settings,productIds:[]}).success,false);
 assert.equal(printerSchema.safeParse({...settings,transport:'WINDOWS',windowsName:''}).success,false);
});
test('thermal text strips printer control injection and keeps Greek/options/allergens without fiscal amounts',()=>{
 assert.equal(printableText('Καφές\x1b@\n'),'Καφές @ ');
 const [ticket]=productionTicket([{productId:'p',quantity:2,note:'ζεστό',modifiers:[{description:'χωρίς ζάχαρη'}],allergens:['ΓΑΛΑ']}],[{id:'p',name:'Καφές'}]);
 assert.equal(ticket.name,'Καφές');assert.equal(ticket.quantity,2);assert.deepEqual(ticket.allergens,['ΓΑΛΑ']);assert.equal(ticket.note,'ζεστό');assert.deepEqual(ticket.modifiers,['χωρίς ζάχαρη']);assert.equal(ticket.price,undefined);
});
