# POS order proposal activation admission — 25/11/2026

ASSIGNED /root · fix/pos-order-suggestions-module-admission-20261125 · existing4193owner retained. SOURCE NOT STARTED. Scope: one ORDER_SUGGESTIONS catalog entry and regression tests; no other modules, price defaults, user grants, fiscal or schema changes.

User screenshot: correct menu Λειτουργίες POS, LAB POS2, no proposal. Read-only DB confirms active employee/credential/posAccess/orderSuggestionsPos=true; active LAB license/store; CompanyModuleORDER_SUGGESTIONS=false with no store override. Actual SuperAdmin UI confirms proposal module disabled ΥΠΟ ΑΝΑΠΤΥΞΗ. Installed4197/4204 source cannot be normally activated. Need complete the installed read-only module catalog availability, remaining opt-in and owner-restricted, no default plan inclusion or automatic charge. Existing routes retain explicit license and operator checks. No UI/DB workaround of disabled control. Future activation confined to LAB; no business writes or blanket user grants. Full CI/deploy and real UI verification required. Weekly alarm remains separate BLOCKED4194.

## Source ready

Claim4208 merged b74db8ac0353e8de5a7ed21f6c4178bdc4dde78d before source. Sourcebranch fix/pos-order-suggestions-module-release-20261125. Only ORDER_SUGGESTIONS entry becomes available for normal explicit activation; ownerOnly, category, all plan defaults, price defaults and every other module unchanged. Description limits scope to read-only quantity proposal/POS with explicit operator permission; weeklyalarm not included. No entitlement or user grant is created by this source change.

Node20 tests:12PASS/0FAIL/0SKIP,1.09s. Actual production CommercialLicensePanel renders enabled opt-in proposal control, toggles only that module and preserves every other module activation, monthly price and setup fee in submitted request. Actual POS grant/revoke/stale-store regression remains passing. Lucide dependency bundled in test harness because shared local package exports are mixed CJS/ESM. Catalog tests prove defaultOFF, ownerOnly,0defaultprices, no defaultplan inclusion, explicit ON/OFF entitlement mapping. diff-check PASS. Full CI/release/realLAB activation pending, no manualPASS.

## 25/11/2026 11:58 Europe/Athens — source live and LAB entitlement enabled

FullCI45586988201 all5jobsSUCCESS on eb0d7a6926c25ae19d9a07beb6d3e8e522052970;4209merged7adad64f35518ff8bfdc501acd487f25a27df81c. Renderdep-dc3b0afavr4c73eso270LIVE09:55:26Z, independentapi/healthok=true/exact7adad64f. Existing concurrentb74db8deployment completed before this trigger, not canceled.

User securely signed in+2FA through browserAuth; no credentials read/extracted/reset. Actual SuperAdmin UI now permits normal explicit ORDER_SUGGESTIONS activation. Saved only that toggle for MYWORKSTATION LAB company cmtpopbgk000prhb5qc60zxus (shared company license for3LABstores); no other companies enabled and no operator permissions changed. Reopened persisted module shows ΕΝΕΡΓΟ; companymoduleactive, LAB POS2 profileorderSuggestionsPos/posAccess/credentialactive remaintrue. Modulemonthly/setup both0; total104.70unchanged. AuditCOMMERCIAL_LICENSE_UPDATED09:58:03Z.

Before/after controls identical across3LABstores: selectedLAB218stockrows,93sales,74purchases; labelLAB2stockrows/0sales/purchases; N40zero. Sorted stockquantity/minimum hashes and wholeSale hashes equal. Existing module financial terms hash equal after excluding newly materialized CONNECTOR_FTEXT inactive0price/0setup row; existing effective active states unchanged except ORDER_SUGGESTIONSfalse→true. Inactive missing→false FTEXT row is not an activation or deactivation. Expected timestamp updates from normal bulk license save are not described as zero database writes.

This proves installed module availability and actual SuperAdmin configuration with measured controls, not physical operator/scanner/Owner/full proposal arithmetic acceptance. User should close/reopen Λειτουργίες POS and allow15s polling. Original commonLAB acceptance plan retained. Weeklyalarm4194 remains BLOCKEDNo7/No14schema/runtimeadmission, not enabled by this action.
