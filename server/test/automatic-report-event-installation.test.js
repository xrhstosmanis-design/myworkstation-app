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
