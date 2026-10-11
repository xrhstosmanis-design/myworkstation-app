# POS header brightness and resize — item 2

## 11/10/2026 17:00 Athens - POS-HEADER-LIGHT-RESIZE-02 / ASSIGNED / NOT TESTED

Owner/source `codex/pos-header-bright-resize-20261011`. User11Oct16:53 Athens says continue after delivery of item1; this explicitly authorizes item2 without declaring item1 USER PASS. Item1 calculator remains AWAITING USER; prior instruction to wait is superseded only for proceeding to item2. Items3–9 remain queued.

Original supplied image(20261011-095504).png recovered and visually inspected (1920x203): dark green two-row POS header with primary controls plus wireless ordering/Chat/Barcode/work-card/radio. Target is header brightness and its lower edge, not an unidentified modal or all-system theme. Main3e37a194 preserves current Audit/voice owners and calculator sourceae7c8cc4. Existing08–09Oct auxiliary-header USER PASS remains protected: all same authorized launchers inside the header, wireless ordering uses existing module, modal portals and radio behavior unchanged.

Bounded client presentation: light MyWorkStation header, clearly contrasting text/buttons; visible bottom resize handle for mouse/touch and keyboard; vertical sizing respects natural content minimum so controls never get clipped, protects remaining cart/payment area, and safely remembers browser-local size per store if available. No catalogue/price/permission/API/schema/auth/fiscal/stock/shift/payment change. No production/LAB business action or accepted transaction replay. New physical resize/brightness acceptance NOT TESTED; CI is not USER/LAB PASS.

Require real rendered isolated POS before/after at1920x1080/1366x768/1280x600, relevant font sizes, compact/expanded/viewport-wrap behavior, pointer/touch/keyboard/reset, calculator and scanner regressions; no forbidden API writes from resizing. Node20 build/full source+main CI/invariants/isolated E2E, merge and ordinary guarded exact release before user test. Manual stays unchanged until actual acceptance. Single next action: publish green claim on main before source. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-header-bright-resize.md`.


## 11/10/2026 — POS-HEADER-LIGHT-RESIZE-02 / SOURCE READY / AWAITING USER

Owner `codex/pos-header-bright-resize-20261011`; claim PR2252 CI38146237037 success merged1371933d before source. Header-only light background #e7f3ee, dark text/white buttons and bottom height separator. Natural wrapped control minimum, extra height0..120px bounded by96px cart reserve; mouse/touch capture, cancel, keyboard arrows/Home/End/Enter, double-click compact, browser-local company/store preference with denied-storage fallback. Existing header launcher handlers/modules/placement, calculator per operator, scanner, checkout/queue/fiscal and other owners preserved. Node20 frontend build PASS; mounted header test plus calculator test2PASS/0FAIL/0SKIP; scanner regression result follows. Actual Chromium before/after geometry at1920x1080/1366x768/1280x600 FONT12/20 runs in full CI using an isolated synthetic fixture and records screenshots/geometry, no business writes. Work sandbox Chromium launch denied socket(), so local rendered browser NOT TESTED. Added only test fixture/harness + CI rendering/evidence step; deployment guard unchanged. New physical brightness/resize USER/LAB NOT TESTED, manual unchanged; items3–9 queued, item1 awaiting separate USER acceptance. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-header-bright-resize.md`. Next: full source CI, guarded exact release then user screen/drag test.


CI38146742662 infrastructure FAIL before checkout/tests: ECR PostgreSQL16 mirror toomanyrequests Data limit exceeded. CI-only service uses same official PostgreSQL16 from primary Docker Hub registry; no production configuration/DB change. Current shared documentation preserved and source status appended to avoid concurrent top-entry conflicts.

## Item2 compact minimum follow-up / SOURCE READY / AWAITING USER

Same assigned owner `codex/pos-header-bright-resize-20261011`; bounded follow-up branch `codex/pos-header-bright-resize-compact-20261011`. SourcePR2256/headccc7f474 fullCI38148178128 SUCCESS2332PASS/0FAIL/0SKIP (native PG, real HTTP E2E, exact Chromium geometry/Windows/contracts), mergedaf6c3e45. MainCI38148522988 cancelled when concurrent docsPR2263 merged2f937ea4; newer docs-only CI38148675640 passed but deploy38148718080 correctly skipped. Header NOT LIVE from that attempt; no guard bypass/manual deployment.

Actual geometry at1366x768/1280x600 showed the new22px grip plus original content gaps added10px to the compact header floor. Reduce only header internal padding/gaps7/6/6 to3/3/3, keeping all44px auxiliary buttons,22px grip and handlers. This recovers10px, preserving the previous compact minimum while brightening/resizing it; wide screens gain space. Existing source state/tenant preference/cart bounds/scanner/payment unchanged. Follow-up only CSS, with the same exact browser fixture before/after/full CI and ordinary guarded main release required. Original supplied header screenshot/user requirement expressly includes shrinking; this remains the same assigned scope. USER/LAB NOT TESTED, manual unchanged; item1 separate acceptance/items3–9queued.


## 11/10/2026 18:05 Athens — final guarded release / SOURCE LIVE / AWAITING USER

Claim PR2252 CI38146237037 success merged1371933d before source. Source PR2256/headccc7f474 full CI38148178128 SUCCESS2332PASS/0FAIL/0SKIP mergedaf6c3e45; compact follow-up PR2264/head2f8fe003 full CI38148921019 SUCCESS2332/0/0 mergedab7171c2de9f8ba7b1e59374bea193faf08511b2. Exact final main CI38149267494 SUCCESS2332/0/0, including native PG/HTTP E2E/Windows/contracts and exact Chromium geometry. Ordinary guarded Render38149554271/deployjob114499990008 SUCCESS, expected revision healthy11Oct18:04:08Athens; independent public health and actually served JS/CSS verified18:05:33Athens on exactab7171c2de9f8ba7b1e59374bea193faf08511b2. Light header #e7f3ee, full-width22px bottom height grip, natural control minimum, optional0..120px extra space bounded by96px cart reserve, mouse/touch/keyboard/reset and browser-local company/store preference. Compact padding restores previous compact header floor; same existing44px auxiliary controls/handlers. Actual isolated1920x1080/1366x768/1280x600 FONT12/20 before/after controls remain contained and payments retain their existing bottom position; inherited1280x600 FONT20 cart collapse is unchanged and outside this header scope. Resizing probes add zero API writes. New physical USER/LAB brightness/drag/persistence NOT TESTED; CI is not acceptance. Manual unchanged, item1 awaiting separate acceptance, items3–9 queued. Single next action: user empty-cart Ctrl+F5, drag bottom «Ύψος μπάρας» down then up, double-click compact, refresh to check remembered store/browser size. Stop at natural minimum to keep controls readable; wait for user feedback before item3. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-header-bright-resize.md`.

Independent public release receipt (no authenticated session or business action):

```json
{
  "status": "VERIFIED",
  "time": "2026-10-11T18:05:33.357777+03:00",
  "health": {
    "ok": true,
    "version": "0.22.0+kat-test-pos",
    "revision": "ab7171c2de9f8ba7b1e59374bea193faf08511b2"
  },
  "assets": [
    {
      "path": "/assets/index-D-HrdKMa.js",
      "status": 200,
      "bytes": 475387,
      "sha256": "d5000591cbbb0a5131d1901d2b0005ae593c43c2a71eb31c1b4075ff9d2cf6b4",
      "preference": false,
      "toggle": false
    },
    {
      "path": "/assets/index-DeeNCK54.css",
      "status": 200,
      "bytes": 45943,
      "sha256": "60d6a7e5f8d37d5a30f5e35c22e355c06be1cf0c33278bea2d5cc1f257aedbc0",
      "light_header": false
    },
    {
      "path": "/assets/entry-C_UaijQM.js",
      "status": 200,
      "bytes": 2296980,
      "sha256": "41a99a9f956f390d68213586e17eff5a49ae07798f5bab41d63f772591d881a2",
      "preference": true,
      "toggle": true
    },
    {
      "path": "/assets/entry-HzgbzTR4.css",
      "status": 200,
      "bytes": 611635,
      "sha256": "f7ded708c18550c3d79f29b36670711b42025317e89de9aa9d0ef395e8b07b1f",
      "light_header": true
    }
  ]
}
```

Exact rendered compact evidence:1920x1080 FONT12 header153→141px/cart502→514px/payment bottom1056px; FONT20 header235→223/cart411→423/payment1047. 1366x768 FONT12 header195/cart192/payment744 unchanged, expansion291/cart96; FONT20 header223/cart134/payment714 unchanged, expansion261/cart96. 1280x600 FONT12 header195/cart24/payment576 unchanged, no extra expansion; FONT20 header289/cart0/payment546 unchanged, no extra expansion. Inherited short-viewport large-font cart0 is not an overall POS PASS. All controls remained within header; minimum protects their natural wrapped height. Browser evidence is isolated synthetic actual StorePosPanel/Chromium, not physical mouse/touch or USER/LAB acceptance. Earlier pre-correction browser metadata/CLI viewport evidence is superseded by exact CDP viewport measurements. Earlier cancelled/docs-only skipped release was not live; final ordinary exact guarded release above is the valid release. Previous healthy rollback revision f45e6c53d63edb2b0b512f3a48d4d84665708713 retained by guard artifact11706681156.


## 11/10/2026 18:15 Athens — item2 expanded central menu / ASSIGNED / USER compact-height limitation

Same owner `codex/pos-header-bright-resize-20261011`, bounded source branch `codex/pos-header-central-menu-20261011`. User image(20261011-150837).png shows actual LAB «ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ» / «Εργαστήριο Χειριστής1» /FONT20/light header and three rows; cropped150924 shows wireless/Chat/Barcode/work-card/radio second auxiliary row. User states bar cannot move further up because buttons obstruct and explicitly requests one central button beside store containing those controls, except Refresh/Logout which stay directly visible. Physical source revision/shift not independently known; no sale/payment/stock/shift action. This is expanded item2 requirement, not item1 or item3 acceptance; previous exactab717 release/CI evidence remains historical and physical compact-height requirement is not accepted.

Use one «Λειτουργίες POS» button immediately beside selected-store button; move secondary header launchers and recording/font/calculator/Netlink into its overlay panel, keeping Refresh/Logout outside. Closed panel must not consume header rows; accessible keyboard/Escape/outside-close and focus return; mount persistent radio/screen recording once so closing menu never stops/restarts them. Keep same store/module/runtime permission gates, existing correct wireless TABLES entry, modal handlers, invoice dock/online order hosts, unread chat indication and item1 per-operator calculator state. Store switch closes panel; no API/business/entitlement/fiscal change. Older08–09Oct USER accepted auxiliary placement is historical and superseded only by this explicit requested location, while correct wireless target remains protected. No other owner takeover; currentmain7b29742 and newest tracker/pending/POS manual/aux/header checkpoints reviewed.

Required: actual mounted control integration and exact rendered before/after1920x1080/1366x768/1280x600 FONT12/20, smaller closed header, popup viewport containment, correct enabled/disabled launchers, wireless entry without order, menu close/reopen radio/audio continuity, no resize/menu API mutations, calculator/scanner regressions. Node20 build/full source+main CI/native isolated E2E then ordinary guarded healthy exact deployment before user check. New physical USER/LAB acceptance NOT TESTED; manual gets no new PASS. Items3–9 stay queued. Single next action: green claim merged on main before source, then implement this one presentation change. Checkpoint `CHECKPOINTS/CHANGES/2026-10-11-pos-header-bright-resize.md`.
