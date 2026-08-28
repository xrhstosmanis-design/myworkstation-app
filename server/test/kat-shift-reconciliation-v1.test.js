import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildKatShiftReconciliation} from '../src/kat-shift-reconciliation.js';

const session=(id,terminalPos)=>({id,terminalPos,status:'CLOSED',cashSales:10,cardSales:5,eftposTotal:5,variance:0,cardVariance:0,closedAt:new Date()});

test('tests 52-57 reconcile two terminal closes and separate channel/payment/device totals',()=>{
  const sessions=[session('shift-1','POS-1'),session('shift-2','POS-2')];
  const auditEvents=[
    {details:{saleId:'sale-1',sessionId:'shift-1',terminalPos:'POS-1',total:10,payments:[{method:'CASH',amount:10}]}},
    {details:{saleId:'sale-2',sessionId:'shift-2',terminalPos:'POS-2',total:5,onlineOrderId:'order-2',payments:[{method:'CARD',amount:5}]}}
  ];
  const paymentAttempts=[{id:'attempt-2',saleId:'sale-2',sessionId:'shift-2',terminalPos:'POS-2',channel:'DELIVERY',role:'DELIVERY',status:'SUCCESS',eftposDeviceCode:'EFTPOS-2B',amount:5}];
  const result=buildKatShiftReconciliation({sessions,auditEvents,paymentAttempts,fiscalDocuments:[{saleId:'sale-1'},{saleId:'sale-2'}]});
  assert.equal(result.status,'AGREEMENT');
  assert.deepEqual(result.totals,{store:10,delivery:0,online:5,cash:10,cards:5,returns:0,voids:0,pendingFiscalizations:0,eftposByDevice:{'EFTPOS-2B':5}});
  assert.deepEqual(result.terminals.map(row=>row.terminalPos),['POS-1','POS-2']);
});

test('missing fiscal, unsettled EFTPOS and cross-terminal mismatches stay fail-closed',()=>{
  const result=buildKatShiftReconciliation({sessions:[session('shift-1','POS-1')],auditEvents:[{details:{saleId:'sale-1',sessionId:'shift-1',terminalPos:'POS-2',total:7,payments:[{method:'CARD',amount:7}]}}],paymentAttempts:[{id:'attempt-1',saleId:'sale-1',sessionId:'other-shift',terminalPos:'POS-1',status:'PLANNED',eftposDeviceCode:'EFTPOS-2A',amount:7}]});
  assert.equal(result.status,'NEEDS_REVIEW');
  for(const code of ['PENDING_FISCALIZATION','SHIFT_TERMINAL_MISMATCH','SHIFT_SESSION_MISMATCH','EFTPOS_TERMINAL_MISMATCH','EFTPOS_NOT_SETTLED'])assert.ok(result.issues.some(row=>row.code===code),code);
});

test('BackOffice exposes printable reconciliation totals and explicit alerts',()=>{
  const route=fs.readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8');
  const engine=fs.readFileSync(new URL('../src/kat-shift-reconciliation.js',import.meta.url),'utf8');
  const panel=fs.readFileSync(new URL('../../client/src/components/cloud/CashControlPanel.jsx',import.meta.url),'utf8');
  const commerce=fs.readFileSync(new URL('../../client/src/components/commerce/CommerceLauncher.jsx',import.meta.url),'utf8');
  const entry=fs.readFileSync(new URL('../../client/src/entry.jsx',import.meta.url),'utf8');
  for(const token of ['pendingFiscalizations','eftposByDevice'])assert.match(engine,new RegExp(token));
  assert.match(route,/buildKatShiftReconciliation/);
  for(const label of ['KAT RECONCILIATION 52-57','Store','Delivery','Online','Returns / Voids','Pending fiscalizations','Fail-closed alerts','EFTPOS ανά συσκευή'])assert.match(panel,new RegExp(label));
  assert.match(panel,/closedByName\|\|row\.openedByName/);
  assert.match(panel,/row\.terminalPos\|\|"MAIN"/);
  assert.match(panel,/row\.shiftLabel\|\|"Βάρδια"/);
  assert.doesNotMatch(panel,/<form className="cash-form" onSubmit=\{closeShift\}>/);
  assert.doesNotMatch(panel,/>Πρόσφατες βάρδιες</);
  assert.match(panel,/Οι βάρδιες ανοίγουν και κλείνουν αποκλειστικά από το POS \/ Store Mode/);
  assert.match(panel,/mws:commerce-open/);
  assert.match(panel,/BriefcaseBusiness\/>Εμπορική λειτουργία/);
  assert.match(commerce,/addEventListener\("mws:commerce-open"/);
  assert.doesNotMatch(commerce,/className="commerce-launcher"/);
  assert.doesNotMatch(entry,/PilotReportLauncherLive|pilot-report-root/);
});
