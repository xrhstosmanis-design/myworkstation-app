# Actual isolated Chat UI evidence

All screenshots use synthetic fixtures, not a physical user acceptance or production Chat data.

Web: exact source main2625a7913ccfa162dfa2342d976de6e172110a8f full CI41313547280, isolated-chat-mobile-browser artifact13085534996, ZIP SHA256d050ac2bc5a85c9e147b7b2e7d736d87481d03aa777b69582bd04dffbaca4668 independently matched. Three viewport conversation geometry, visible composer, whole-photo markers and real two-finger pinch were asserted by actual Chromium.

Native: source PR3447 final headbdf9c8d315adae9c2c8a4b97617041cd39704463 Android CI41312235219, artifact13085763727 SHA256ce46a743ee2691fd8888ca59b9edd4d716eaec0c34b7c37fb4a240d965347718 independently matched. Native Android treef9bafe0cb663f77edaca2ca818da40e48aa0e2c2 equals the signed source. Capture1 and all55 actual instrumentation tests passed. Screenshots are normal and large-font synthetic Activity layouts.

Touch diagnostics: focused actual Chromium probe41312235288 artifact13086390510 SHA256446635c046aa7ccf87edfb30ae92f0a76b1045c7aa30fc4718269204461b9be7 on the same final source head. Long press remains open after finger release; no photo preview/fetch occurs. Normal fresh tap still opens the photo.

Stable-signing workflow41313678816 attempt2 independently repeated compile/unit/lint, capture1 and full55 before durable signing, after exact source-main full CI succeeded. Attempt1 correctly stopped at the pending exact-main CI gate and never accessed key material. Public verification is recorded separately.

Physical/LAB/USER acceptance remains NOT TESTED; one combined phone batch only. No production Chat send/read/ack/Push/email was performed.
