import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {printStaffShiftReport,staffShiftReportColumns} from '../../client/src/components/cloud/staff-shift-report-print.mjs';
import {staffCapabilities,staffRequestCapability,validStaffCapabilities} from '../../shared/backoffice-staff.mjs';

test('printing is a separate grant that needs the existing store shift read right',()=>{
  assert.ok(staffCapabilities.includes('shifts.print'));
  assert.equal(validStaffCapabilities(['shifts.print']),false);
  assert.equal(validStaffCapabilities(['shifts.read','shifts.print']),true);
  assert.equal(staffRequestCapability('GET','/api/cash-control/stores/store/reporting-overview'),'shifts.read');
  assert.equal(staffRequestCapability('POST','/api/cash-control/stores/store/reporting-overview'),null);
  const workspace=readFileSync(new URL('../../client/src/components/BackofficeStaffWorkspace.jsx',import.meta.url),'utf8');
  const report=readFileSync(new URL('../../client/src/components/cloud/StaffShiftReport.jsx',import.meta.url),'utf8');
  assert.match(workspace,/canPrint=\{capabilities.includes\("shifts.print"\)\}/);
  assert.match(report,/if\(!canPrint\|\|!result\?\.recent.length\)return/);
  assert.match(report,/loaded\.storeId===storeId&&loaded\.revision===revision/);
});

function printFixture(){
  const node=tag=>({tag,children:[],append(...children){this.children.push(...children)}});
  const doc={documentElement:node('html'),head:node('head'),body:node('body'),createElement:node};
  const listeners=new Map();
  let printed=0,closed=0;
  const popup={
    document:doc,opener:{},focus(){},print(){printed++},close(){closed++},
    addEventListener(name,handler,options){listeners.set(name,{handler,options})}
  };
  const browser={open(url,target){assert.equal(url,'');assert.equal(target,'_blank');return popup}};
  return {browser,popup,doc,listeners,printed:()=>printed,closed:()=>closed};
}

test('printing uses the same visible summary columns and treats displayed values as text',()=>{
  const f=printFixture();
  const shifts=[
    {openedByName:'<Χειριστής>',terminalPos:'A',openNote:'hidden audit',openedAt:'2026-11-22T08:00:00Z',
      status:'OPEN',eftposTotal:25,cardVariance:99,transactionCount:2},
    {status:'CLOSED',eftposTotal:25,cardVariance:-2,transactionCount:5}
  ];
  assert.equal(printStaffShiftReport(f.browser,'<Κατάστημα>',shifts),true);
  assert.equal(f.popup.opener,null);
  assert.equal(f.doc.body.children[1].textContent,'<Κατάστημα>');
  const table=f.doc.body.children[2];
  const [head,body]=table.children;
  assert.deepEqual(head.children[0].children.map(cell=>cell.textContent),staffShiftReportColumns.map(([label])=>label));
  assert.equal(body.children.length,2);
  const [open,closed]=body.children.map(row=>row.children.map(cell=>cell.textContent));
  assert.equal(open[0],'<Χειριστής>');
  assert.equal(open[1],'A');
  assert.match(open[3],/10:00/);
  assert.equal(open[4],'Ανοιχτή');
  assert.equal(open[7],'—');
  assert.equal(open[12],'—');
  assert.equal(open[13],'2');
  assert.match(closed[7],/25,00/);
  assert.match(closed[12],/-2,00/);
  assert.equal(closed[13],'5');
  assert.doesNotMatch(JSON.stringify(table),/hidden audit/);
  assert.equal(f.printed(),1);
  assert.equal(f.listeners.get('afterprint').options.once,true);
  f.listeners.get('afterprint').handler();
  assert.equal(f.closed(),1);
});

test('a blocked popup is reported without printing another page',()=>{
  assert.equal(printStaffShiftReport({open:()=>null},'Store',[]),false);
});
