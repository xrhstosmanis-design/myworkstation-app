import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticReportEventInstallation} from '../src/services/automatic-report-event-installation.js';
const actor={id:'admin',isSuperAdmin:true};
test('event transition describes exact reviewed BASE and CAPTURE hashes without database work',()=>{
 const db={$transaction(){throw Error('unexpected database')}};
 const base=createAutomaticReportEventInstallation(db,{sourceRevision:'a'.repeat(40)}).describe();
 const capture=createAutomaticReportEventInstallation(db,{sourceRevision:'a'.repeat(40),profile:'CAPTURE'}).describe();
 assert.equal(capture.oldPlanHash,'59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2');
 assert.equal(capture.targetPlanHash,'03f580521f0337e50336cc25331d2955db185791553f6084aee9f5d2342509ba');
 assert.notEqual(base.oldPlanHash,capture.oldPlanHash);
 assert.equal(base.productionActivated,false);
});
test('installation is explicit and disabled before any database access',()=>{
 const db={$transaction(){throw Error('unexpected database')}};
 const off=createAutomaticReportEventInstallation(db,{sourceRevision:'a'.repeat(40)});
 assert.throws(()=>off.install(actor,{}),{code:'REPORT_EVENT_INSTALL_DISABLED'});
 const on=createAutomaticReportEventInstallation(db,{sourceRevision:'a'.repeat(40),enabled:true});
 assert.throws(()=>on.install(actor,{companyId:'c',storeId:'s'}),{code:'REPORT_EVENT_INSTALL_AUTHORIZATION_REQUIRED'});
 assert.throws(()=>createAutomaticReportEventInstallation(db,{sourceRevision:'a'.repeat(40),profile:'unknown'}),{code:'REPORT_EVENT_INSTALL_REFUSED'});
});
test('explicit V3 to V4 transition binds immutable old hash and distinct security target without database work',()=>{
 const service=createAutomaticReportEventInstallation({$transaction(){throw Error('unexpected')}},{sourceRevision:'a'.repeat(40),profile:'REPORTS_ONLY_V3_TO_V4'});
 const d=service.describe();assert.equal(d.oldPlanHash,'54ceb10a4383faf7367d07bd3b8ad1c066b85c025a23e937c610d1f473423828');assert.equal(d.targetPlanHash,'e349bf37597939d918b098aaa434ce4dfd686b653b0fe013d8c4df83420ec68f');assert.equal(d.targetProfile,'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4');assert.throws(()=>service.install(actor,{}),{code:'REPORT_EVENT_INSTALL_DISABLED'});
});
