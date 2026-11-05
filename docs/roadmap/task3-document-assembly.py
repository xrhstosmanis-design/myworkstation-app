#!/usr/bin/env python3
"""Isolated documentation assembly only; this helper must never enter main."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'f3135fac766371807d219f0e4c32df2d777de3be'
MAIN = 'b7c75d4ec908919acaa21d967ae81f29b4d6aadf'
BRANCH = 'tools/task3-document-assembly-20261105'
DOC_BRANCH = 'docs/task3-lab-readiness-20261105'
EXPECTED = {
    'CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md': '1b4758594b5de6cd7150c8482ad4cd048040aef1',
    'docs/roadmap/OPEN_WORK_TRACKER.md': '4789f4201abf7bb9a43f724b9bd214f68f68019c',
    'docs/roadmap/PENDING_WORK.md': '7d1d0367cab2a7398be876330ae2672f939e7657',
    'CHECKPOINTS/CHANGES/2026-11-04-invoice-credit-third-header.md': '706eee0e3a0845a654b61cd1cd77f048ceb97a77',
    'CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md': '6f266cf08b06504e2318cba3fce724fafaf6b40c',
}
PREFIX = '''## 05/11/2026 - INVOICE-CREDIT-HOSTED-PREP-01 / RETAINED OWNER / BEFORE-SOURCE CLAIM / OPEN

Retained task3 owner /root. Documentation branch docs/task3-lab-readiness-20261105, PR3669; subsequent bounded source branch fix/task3-lab-preparation-20261105. This claim becomes published only after normal documentation CI and main integration. It does not transfer invoice-reading, payment/credit, stock or peer ownership. Parent INVOICE-CREDIT-CONSOLIDATION-01 and INVOICE-CREDIT-THIRD-HEADER-01 remain OPEN.

Source3659 is already merged at608cecc and its ordinary release was verified earlier. Fresh source mainb7c75d4 retains the correction; guarded deployment41988328490 reports SUCCESS. These receipts supersede old source-candidate/CI-pending wording, not the historical pair PASS, third-member review FAIL or acceptance gate. No new hosted consolidation has been executed. The last measured LAB readiness had one credit but no applied-credit draft/inbound-credit/common-credit family; do not treat that old inventory as a fresh action baseline.

Authenticated access to the exact LAB works. Executor navigation remains unreliable: the latest bounded rund866940d-9d3f-44ea-b22b-61d6ad0f7e03 reported a recorder utility without a visible close control and did not reach InvoiceInboxPanel. It also inferred an equivalence between pending-confirmation and Pending Center buttons that source inspection does not establish. No screenshot was returned. These are executor limitations, not a confirmed application defect. Stop repeated metered blind navigation and do not change user permissions or ask for another login on this evidence.

Bounded preparation scope, implemented in separate reviewed stages only after this claim is published: first a deterministic, explicitly selected-store entry to the EXISTING invoice view, preserving the normal Backoffice and its role/module/session/lifecycle boundaries; no standalone replacement or speculative event-handler fix. Then complete the existing preparation-route inventory and, only if needed, a read-only readiness preview plus narrowly allowlisted, idempotent creation of NEW synthetic inbound attachments and unpaid NEW/DRAFT records in MYWORKSTATION LAB. No arbitrary tenant targeting, old-record reuse or global defaults.

Ordinary attachment upload creates only an attachment/inbox row, not a common-credit family. Fixture preparation must never forge paid state, signed payments, applied-credit audits, canonical aliases or success flags. Any required NEW synthetic payment and OFFSET/CASH_RETURN application must use the unchanged ordinary application writers with their real confirmations and audit. No direct shared-database seed, isolated-test-schema helper, external myDATA/OCR/AI call, company VAT/integration edit, stock/fiscal posting or historical payment/credit replay. Protect H/G, reserved I, all old originals, existing acceptance and peer work.

Required source gates: complete relevant checkpoint/manual inspection; scoped normal/denied/stale-context tests; no outbound calls or fabricated credit proof; exact full native PR/main CI and independent review; ordinary guarded healthy release. Only then prepare one uniquely identified synthetic family, inspect setup changes, record fresh per-action BEFORE/AFTER and untouched CONTROL, and perform normal original/MARK/header/reason/root-table-confirmed reconciliation and retry. Preserve canonical identity, signed credit/original positive payment, rows/files, allocations and stock. OFFSET and CASH_RETURN are separate evidence scopes. Source, CI, setup or equal snapshots alone never closes task3.

This documentation update prepends the same entry to the three complete registries and both relevant checkpoints, preserving every prior byte as an exact suffix. Regenerate the canonical tracker PDF; preserve accepted manuals and the numbered acceptance snapshot because no new functional PASS exists. Any isolated document-build helper is excluded from the final documentation tree and ancestry. Checkpoint: CHECKPOINTS/CHANGES/2026-11-05-task3-hosted-preparation-design.md. Single next: verify and publish the synchronized documentation claim, then implement only the first bounded entry stage. No business mutation or runtime deployment is authorized by a documentation build.

'''
PDF = 'output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf'
EVIDENCE = 'CHECKPOINTS/EVIDENCE/task3-hosted-preparation-20261105/registry-sync.json'
OUT = Path('/tmp/task3-document-assembly')

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def main():
    require(os.environ.get('GITHUB_REPOSITORY') == 'xrhstosmanis-design/myworkstation-app', 'Wrong repository')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/' + BRANCH, 'Helper branch only')
    require(git('ls-remote', 'origin', 'refs/heads/' + DOC_BRANCH).decode().split()[0] == SOURCE, 'Documentation head changed')
    require(git('ls-remote', 'origin', 'refs/heads/main').decode().split()[0] == MAIN, 'Main changed; reconcile peers first')
    subprocess.run(['git', 'merge-base', '--is-ancestor', SOURCE, 'HEAD'], cwd=ROOT, check=True)
    OUT.mkdir(parents=True, exist_ok=True)
    prefix = PREFIX.encode('utf-8')
    records = []
    originals = {}
    for path, expected in EXPECTED.items():
        old = git('show', SOURCE + ':' + path)
        require(blob(old) == expected, 'Unexpected source blob: ' + path)
        require((ROOT / path).read_bytes() == old, 'Modified source before assembly: ' + path)
        require(prefix not in old, 'Prefix already exists: ' + path)
        originals[path] = old
    # Only after every input passed the preflight do any local writes occur.
    for path, old in originals.items():
        new = prefix + old
        (ROOT / path).write_bytes(new)
        require(new[len(prefix):] == old and new.count(prefix) == 1, 'Lossless-prefix invariant failed')
        records.append({'path': path, 'beforeBlob': blob(old), 'afterBlob': blob(new), 'beforeBytes': len(old), 'afterBytes': len(new), 'preservedSuffix': True, 'sha256': hashlib.sha256(new).hexdigest()})
    original_pdf = git('show', SOURCE + ':' + PDF)
    (OUT / 'original-tracker.pdf').write_bytes(original_pdf)
    subprocess.run([sys.executable, str(ROOT / 'docs/roadmap/generate-open-work-tracker.py')], cwd=ROOT, check=True)
    import fitz
    document = fitz.open(ROOT / PDF)
    require(document.page_count > 0, 'Empty PDF')
    first_text = ''.join(document[n].get_text() for n in range(min(4, document.page_count)))
    require('INVOICE-CREDIT-HOSTED-PREP-01' in first_text, 'New entry absent from PDF')
    pages = sorted(set([0, 1, 2, document.page_count - 1]))
    for index in pages:
        if 0 <= index < document.page_count:
            document[index].get_pixmap(matrix=fitz.Matrix(1.3, 1.3)).save(OUT / ('tracker-page-%04d.png' % (index + 1)))
    pdf_bytes = (ROOT / PDF).read_bytes()
    pdf_record = {'path': PDF, 'beforeBlob': blob(original_pdf), 'afterBlob': blob(pdf_bytes), 'sha256': hashlib.sha256(pdf_bytes).hexdigest(), 'pages': document.page_count, 'source': 'docs/roadmap/OPEN_WORK_TRACKER.md', 'sourceSha256': hashlib.sha256((ROOT / 'docs/roadmap/OPEN_WORK_TRACKER.md').read_bytes()).hexdigest(), 'generatorBlob': git('rev-parse', SOURCE + ':docs/roadmap/generate-open-work-tracker.py').decode().strip(), 'renderedSamplePages': [p + 1 for p in pages if p < document.page_count], 'humanVisualReview': 'PENDING'}
    document.close()
    proof = {'schemaVersion': 1, 'observedAt': datetime.now(timezone.utc).isoformat(), 'sourceCommit': SOURCE, 'sourceMain': MAIN, 'documentationPR': 3669, 'helperBranch': BRANCH, 'applicationSourceChanged': False, 'businessMutationsSubmitted': False, 'hostedConsolidation': 'NOT EXECUTED', 'prefixSha256': hashlib.sha256(prefix).hexdigest(), 'files': records, 'pdf': pdf_record, 'claimPublication': 'AWAITING FINAL DOCUMENTATION CI AND MAIN MERGE'}
    evidence = ROOT / EVIDENCE
    require(not evidence.exists(), 'Evidence path already exists')
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(proof, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    allowed = list(EXPECTED) + [PDF, EVIDENCE]
    subprocess.run(['git', 'add', '--', *allowed], cwd=ROOT, check=True)
    staged = git('diff', '--cached', '--name-only').decode().splitlines()
    require(set(staged) == set(allowed), 'Unexpected staged paths')
    # PDF syntax has significant trailing spaces (including xref entries).
    # Keep strict whitespace checks on every UTF-8 output; validate the PDF
    # using its parser, content marker, exact source hash and rendered pages.
    subprocess.run(['git', 'diff', '--cached', '--check', '--', *EXPECTED, EVIDENCE], cwd=ROOT, check=True)
    for path in allowed:
        dest = OUT / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / path, dest)
    (OUT / 'allowed-output-paths.json').write_text(json.dumps(allowed, indent=2) + '\n')
    (OUT / 'document-proof.json').write_text(json.dumps(proof, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'result': 'DOCUMENTS ASSEMBLED; NOT PUBLISHED', 'records': records, 'pdf': pdf_record}, ensure_ascii=False))

if __name__ == '__main__':
    main()
