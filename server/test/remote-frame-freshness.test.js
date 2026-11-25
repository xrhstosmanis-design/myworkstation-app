import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteFrameFreshness} from '../../client/src/lib/remote-frame-freshness.js';
import {createRemoteSessionStore} from '../src/lib/remote-agent-session.js';

test('browser clock skew never changes server-confirmed fresh frame eligibility',()=>{
 let browser=10000;
 const gate=createRemoteFrameFreshness({now:()=>browser});
 assert.equal(gate.observe({sequence:1,at:1730000000000},{serverAgeMs:100}),true);
 assert.equal(gate.isFresh(),true);
 browser+=4999;assert.equal(gate.isFresh(),true);
 browser+=1;assert.equal(gate.isFresh(),false);
});

test('unchanged sequence cannot renew input eligibility from repeated SSE ticks',()=>{
 let browser=0;const gate=createRemoteFrameFreshness({now:()=>browser});
 assert.equal(gate.observe({sequence:1},{serverAgeMs:200}),true);
 browser+=4000;
 assert.equal(gate.observe({sequence:1},{serverAgeMs:4200}),false);
 browser+=1001;assert.equal(gate.isFresh(),false);
 assert.equal(gate.observe({sequence:2},{serverAgeMs:100}),true);
 assert.equal(gate.isFresh(),true);
});

test('stale, unknown, invalid, unordered or future frames fail closed',()=>{
 let t=0;const gate=createRemoteFrameFreshness({now:()=>t});
 assert.equal(gate.observe({sequence:1},{serverAgeMs:5000}),false);
 assert.equal(gate.observe({sequence:2},{serverAgeMs:undefined}),false);
 assert.equal(gate.observe({sequence:3},{serverAgeMs:-1}),false);
 assert.equal(gate.observe({sequence:4},{serverAgeMs:NaN}),false);
 assert.equal(gate.observe({sequence:4},{serverAgeMs:0}),true);
 assert.equal(gate.observe({sequence:3},{serverAgeMs:0}),false);
 t=-1;assert.equal(gate.isFresh(),false);
 gate.reset();assert.equal(gate.isFresh(),false);
});

test('server computes frame age on its own clock independently of browser',()=>{
 let t=1000;
 const sessions=createRemoteSessionStore({now:()=>t,ttl:null,idle:15000});
 const job={id:'remote-frame-test',createdBy:'admin-1'};
 const {token}=sessions.start(job);
 const session=sessions.device(job.id,token);
 sessions.frame(session,{jpeg:'test',width:800,height:600});
 assert.equal(sessions.view(session,{touch:false}).frameAgeMs,0);
 t+=3000;assert.equal(sessions.view(session,{touch:false}).frameAgeMs,3000);
 t+=3000;const old=sessions.view(session,{touch:false});
 assert.equal(old.frameAgeMs,6000);
 let browser=900000000;const gate=createRemoteFrameFreshness({now:()=>browser});
 assert.equal(gate.observe(old.frame,{serverAgeMs:old.frameAgeMs}),false);
 t+=100;sessions.frame(session,{jpeg:'new',width:800,height:600});
 const fresh=sessions.view(session,{touch:false});
 assert.equal(fresh.frameAgeMs,0);
 assert.equal(gate.observe(fresh.frame,{serverAgeMs:fresh.frameAgeMs}),true);
});

test('server device liveness and idle expiry are unchanged by frame age metadata',()=>{
 let t=1000;const closed=[];
 const sessions=createRemoteSessionStore({now:()=>t,ttl:null,idle:15000,onExpire:(_s,reason)=>closed.push(reason)});
 const job={id:'remote-idle-test',createdBy:'admin-1'};
 const {token}=sessions.start(job);
 const s=sessions.device(job.id,token);
 sessions.frame(s,{jpeg:'abc',width:20,height:20});
 t+=15001;assert.throws(()=>sessions.device(job.id,token),/έληξε|χάθηκε/);
 assert.deepEqual(closed,['DEVICE_IDLE']);
});

test('V2 device command freshness is measured only on server clock at dequeue',()=>{
 let t=1000;
 const sessions=createRemoteSessionStore({now:()=>t,ttl:null,idle:15000});
 const {token}=sessions.start({id:'commands-server-clock',createdBy:'admin-1'});
 const session=sessions.device('commands-server-clock',token);
 sessions.command(session,{type:'key',key:'Enter'});
 t+=2750;
 const command=sessions.takeCommands(session)[0];
 assert.equal(command.ageMs,2750);
 assert.equal(command.at,1000);
 assert.equal(command.type,'key');
 assert.deepEqual(sessions.takeCommands(session),[]);
 t+=100;
 sessions.command(session,{type:'key',key:'Tab'});
 t+=3200;
 assert.ok(sessions.takeCommands(session)[0].ageMs>=3000);
});
