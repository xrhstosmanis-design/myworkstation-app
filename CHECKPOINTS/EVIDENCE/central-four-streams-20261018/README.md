# Isolated source diagnostics - 18 October 2026

Pinned source revision:25ce0fc2f60502b123f25324fef4205463596174. Runtime:Node24.19.0. No production data, credentials, DB writes or networked business action.

These are diagnostic fixtures, not deployable modules. JavaScript and package.json snapshots have an additional .txt suffix to prevent accidental runtime/package discovery. snapshot-map.json maps stored names to original isolated filenames. Restore into a NEW empty directory outside the application checkout using this Python command from this evidence directory:

```python
import json, pathlib, shutil
source = pathlib.Path.cwd()
target = pathlib.Path("/tmp/myworkstation-central-diagnostics")
target.mkdir(exist_ok=False)
for stored, original in json.loads((source / "snapshot-map.json").read_text()).items():
    out = target / original
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / stored, out)
```

Run from each restored wsN directory:
- ws1:node --test server/test/automatic-report-policy.test.js server/test/automatic-report-weekly.test.js
- ws2:node --test diagnostic.test.mjs
- ws3:node --experimental-vm-modules diagnostic.cjs
- ws4:node --test diagnostic.test.mjs

WS1 result10passed; WS2 result3passed; WS4 result5passed. WS3 executes4observations confirming the current function's per-product count behavior and absence of a completeness flag, not4correct unique-sale outcomes. Grouped SQL rows are mocked; no nativePostgreSQL query executed. WS4 source-schema assertion is static, not a full parser/auth check. Do not total these into22functionalPASS.

Actual runtime correction/integration remains OPEN under retained owners. Prior accepted financial fixtures must not be replayed. Nothing here grants ownership or production access.
