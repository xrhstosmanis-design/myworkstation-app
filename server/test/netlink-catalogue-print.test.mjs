import test from 'node:test';
import assert from 'node:assert/strict';
import {netlinkCatalogueGroups} from '../../client/src/components/commerce/netlink-catalogue.mjs';
import {printNetlinkReport} from '../../client/src/components/commerce/netlink-report-print.mjs';
import {JSDOM} from 'jsdom';

test('production tabbed catalogue retains products and flags across tabs and supports legacy groups',()=>{
 const tabs=[{title:'airtime',groups:[{title:'Mobile',products:[{productId:'p1',title:'Card 10',disabled:false},{productId:'p2',title:'Unavailable',disabled:true}]}]},{title:'quick-access',groups:[{title:'Mobile',products:[{productId:'p3',title:'Card 20'}]}]},{disabled:true,groups:[{title:'hidden',products:[{productId:'hidden'}]}]}];
 for(const menu of [{tabs},{data:{tabs}},{data:{data:{tabs}}}]){
  const groups=netlinkCatalogueGroups(menu);assert.equal(groups.length,2);assert.deepEqual(groups.flatMap(g=>g.products.map(p=>p.productId)),['p1','p2','p3']);assert.notEqual(groups[0].catalogueKey,groups[1].catalogueKey);assert.equal(groups[0].products[1].disabled,true);
 }
 assert.equal(netlinkCatalogueGroups({groups:[{name:'Mock',products:[{id:'M',name:'Mock card'}]}]})[0].products[0].title,'Mock card');
 assert.deepEqual(netlinkCatalogueGroups({data:{tabs:[]}}),[]);
 assert.throws(()=>netlinkCatalogueGroups({data:{unexpected:[]}}),/μορφή καταλόγου/);
});

test('selected report printing is text-safe and includes period/store, totals and only selected report fields',()=>{
 for(const tab of ['detail','summary','weekly']){
  const dom=new JSDOM('<html><head></head><body></body></html>');let printed=0;
  const popup={document:dom.window.document,focus(){},print(){printed++},close(){},addEventListener(){}};
  const detail={totals:{completed:1,cardAmount:15,customerTotal:15.5,cancellationRequests:0},items:[{productId:'<script>alert(1)</script>',operatorName:'Operator A',amount:15,status:'COMPLETED',providerReference:'REF-A',createdAt:'2026-11-25T08:00:00Z',secret:'DO-NOT-PRINT'}]};
  const summary={days:[{date:'2026-11-25',transactions:1,grossAmount:15,commissionAmount:0.15}]};
  const settlement={dailyBreakdown:summary.days,settlement:{transactions:1,grossAmount:15,serviceFees:0.5,customerTotal:15.5,commissionAmount:0.15}};
  assert.equal(printNetlinkReport({open:()=>popup},{storeId:'synthetic-store',storeName:'Synthetic Store',from:'2026-11-19',to:'2026-11-25',tab,detail,summary,settlement}),true);
  assert.equal(printed,1);assert.equal(popup.opener,null);const body=dom.window.document.body;
  assert.match(body.textContent,/Synthetic Store/);assert.match(body.textContent,/2026-11-19 — 2026-11-25/);assert.match(body.textContent,/δεν αποτελεί statement/);assert.match(body.textContent,/15,00/);
  assert.doesNotMatch(body.textContent,/DO-NOT-PRINT/);assert.equal(body.querySelector('script'),null);
  if(tab==='detail'){assert.match(body.textContent,/REF-A/);assert.match(body.textContent,/15,50/)}else assert.doesNotMatch(body.textContent,/REF-A/);
  dom.window.close();
 }
 assert.equal(printNetlinkReport({open:()=>null},{storeId:'S',from:'2026-11-19',to:'2026-11-25',tab:'detail',detail:{items:[]}}),false);
 assert.equal(printNetlinkReport({open(){throw Error('must not open')}},{storeId:'',from:'x',to:'y',tab:'detail',detail:{}}),false);
});
