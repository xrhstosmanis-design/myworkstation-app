#!/usr/bin/env python3
"""Build the timing-compatible proposal; never apply a patch or change application files."""
import argparse
import hashlib
import re
import sys
from pathlib import Path

INPUTS = {
    'candidate.patch': '3254e85967745ada000a1bcf4be46ced88df787c37bf67f681012b801679b3fa',
    'v2-real-helpers.test.mjs': '90bd908326a12f0b1dda48e12e626b981e282aa10cf5ea665af4a879374f62d5',
    'v3-timing-cases.mjs': '25ea0739838b3781ed49962507b6a1b2156f5060828bdc3e617cb2c556d95a60',
    'v3-shared-cases.mjs': 'b3520fb17b6438751548599d7a1857918831607b6532713b42b7d42e71c5599d',
}
EXPECTED_PATCH_SHA256 = '528afc2c440164dc089e5cb62d451212edb7f13573b3a8a50687c85250512def'
BASE_BLOBS = {
    'server/src/routes/commerce-pos-v244.js': '919672b42e1b4fb286011c693c2651316242ac43',
    'server/test/pos-fast-header-latency.test.js': '7df6792514c5d6932a90dc60ade9f9d3a8cc1b00',
    'server/src/lib/pos-fast-header-timing.js': '7b16ed709102d79ced482329e1664b11e0cc728e',
}
TEST_NAMES = ['pos-fast-header-pdf-total-safety', 'pos-fast-header-pdf-real-helpers', 'pos-fast-header-pdf-timing-shared']

def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Expected one source boundary: {old[:90]}')
    return text.replace(old, new, 1)

def verified(root, name):
    data = (root / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != INPUTS[name]:
        raise ValueError(f'Changed input refused: {name}')
    return data.decode('utf-8')

def adapt_test(text, real):
    text = once(text, "import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport {EventEmitter} from 'node:events';\nimport {pathToFileURL as timingFileUrl} from 'node:url';\nconst {createFastHeaderTiming}=await import(process.env.OCR_EVIDENCE_ROOT?timingFileUrl(resolve(process.env.OCR_EVIDENCE_ROOT,'production/pos-fast-header-timing.mjs')):new URL('../src/lib/pos-fast-header-timing.js',import.meta.url));")
    text = once(text, '    Buffer,crypto,round2,', '    Buffer,crypto,round2,\n    createFastHeaderTiming:res=>createFastHeaderTiming(res,{...timingOptions,emit:event=>{timings.push(event);return timingOptions.emit?.(event)}}),')
    text = once(text, 'let handler,result,error,status=200,walletScopes=0;', 'let handler,result,error,status=200,walletScopes=0;\n  const timings=[];')
    if real:
        text = once(text, 'transportSteps=null}={})', 'transportSteps=null,timingOptions={},transportNow=null,transportTimeout=null}={})')
        text = once(text, "'FAST_OPENAI_HEADER_ATTEMPTS',`${schemaSource}", "'FAST_OPENAI_HEADER_ATTEMPTS','Date',`${schemaSource}")
        text = once(text, 'fakeFetch,deps.process,AbortSignal,deps.console,throwIfWalletError,timeoutMs,attempts)', 'fakeFetch,deps.process,transportTimeout?{timeout:transportTimeout}:AbortSignal,deps.console,throwIfWalletError,timeoutMs,attempts,transportNow?{now:transportNow}:Date)')
        text = once(text, 'if(step instanceof Error)throw step;', "if(typeof step==='function')return step();\n      if(step instanceof Error)throw step;")
    else:
        text = once(text, 'footerVat=0,footerPayable=0}={})', 'footerVat=0,footerPayable=0,timingOptions={}}={})')
    text = once(text, "const res={status(value){status=value;return this;},json(value){assert.equal(result,undefined,'one response only');result=value;return this;}};", """const res=new EventEmitter();
  res.status=value=>{status=value;return res};
  res.json=value=>{assert.equal(result,undefined,'one response only');result=value;res.emit('finish');return res};""")
    text = once(text, 'await handler(req,res,value=>{assert.equal(error,undefined);error=value;});', """await handler(req,res,value=>{assert.equal(error,undefined);error=value;res.emit('finish');});
  res.emit('close');res.emit('finish');
  if(!timingOptions.disableAssert){
    assert.equal(timings.filter(e=>e.stage==='request_total').length,1,'exactly one terminal timing event');
    assert.equal(new Set(timings.map(e=>e.correlationId)).size,1,'request-local correlation');
    for(const e of timings){
      assert.deepEqual(Object.keys(e).sort(),(e.stage==='openai_attempt'?['attempt','correlationId','elapsedMs','outcome','stage']:['correlationId','elapsedMs','outcome','stage']));
      assert.ok(Number.isFinite(e.elapsedMs)&&e.elapsedMs>=0);
      assert.match(e.correlationId,/^[0-9a-f-]{36}$/i);
    }
    assert.doesNotMatch(JSON.stringify(timings),/SYNTHETIC|synthetic|company-a|store-a|supplier-a|SYN-42|FULL-43|099999999|088888888|secret|data:|base64|filename|taxId|totalGross|documentNumber|Authorization/i);
  }""")
    return once(text, 'walletScopes,transportRequests};' if real else 'walletScopes};', 'walletScopes,transportRequests,timings};' if real else 'walletScopes,timings};')

def new_file_patch(name, text):
    path = f'server/test/{name}.test.js'
    lines = text.splitlines()
    return f'diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{len(lines)} @@\n' + ''.join('+' + line + '\n' for line in lines)

def assemble(root):
    previous = verified(root, 'candidate.patch').replace('\n diff --git ', '\ndiff --git ')
    boundary = 'diff --git a/server/test/pos-fast-header-pdf-total-safety.test.js '
    prefix, added = previous.split(boundary, 1)
    start = added.index('\n@@ ')
    added_lines = added[start:].splitlines()[2:]
    if not all(line.startswith('+') for line in added_lines):
        raise ValueError('Unexpected original added-file patch')
    original_test = ''.join(line[1:] + '\n' for line in added_lines)
    originals = adapt_test(original_test, False)
    real = adapt_test(verified(root, 'v2-real-helpers.test.mjs'), True)
    shared = real[:real.index('async function run(')] + '\n' + verified(root, 'v3-shared-cases.mjs')
    real += '\n' + verified(root, 'v3-timing-cases.mjs')
    # Source contexts are updated to the merged #3655 timing wrappers; the
    # actual monetary-safety delta remains exactly the V1 change.
    prefix = once(prefix, 'normalizeAzure(await callAzure({contentData:dataUrl,mimeType,timeoutMs:FAST_AZURE_HEADER_TIMEOUT_MS}))', 'normalizeAzure(await timing.measure("azure_header",()=>callAzure({contentData:dataUrl,mimeType,timeoutMs:FAST_AZURE_HEADER_TIMEOUT_MS})))')
    prefix = once(prefix, 'await azureSupplierMatch(req.user.companyId,parsed.supplier)', 'await timing.measure("azure_supplier_match",()=>azureSupplierMatch(req.user.companyId,parsed.supplier))')
    prefix = once(prefix, 'await callFastOpenAiHeader({prompt,filePart})', 'await timing.measure("openai_header",()=>callFastOpenAiHeader({prompt,filePart,timing}))')
    prefix = once(prefix, 'await matchSupplier(req.user.companyId,{name:supplierName,taxId:supplierTaxId})', 'await timing.measure("openai_supplier_match",()=>matchSupplier(req.user.companyId,{name:supplierName,taxId:supplierTaxId}))')
    parts = prefix.split('diff --git ')
    for i in range(1, len(parts)):
        offset = 5 if parts[i].startswith('a/server/src/') else 17
        parts[i] = re.sub(r'@@ -(\d+)(,\d+)? \+(\d+)(,\d+)? @@', lambda m: f'@@ -{int(m[1])+offset}{m[2] or ""} +{int(m[3])+offset}{m[4] or ""} @@', parts[i])
    prefix = 'diff --git '.join(parts)
    tests = {name: ''.join(line.rstrip() + '\n' for line in text.splitlines()) for name, text in zip(TEST_NAMES, [originals, real, shared])}
    patch = (prefix + ''.join(new_file_patch(name, text) for name, text in tests.items())).encode('utf-8')
    actual = hashlib.sha256(patch).hexdigest()
    if actual != EXPECTED_PATCH_SHA256:
        raise ValueError(f'Unexpected V3 output digest: {actual}')
    return patch

def verify_repository(root):
    for path, expected in BASE_BLOBS.items():
        data = (root / path).read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if actual != expected:
            raise ValueError(f'Current source differs; re-review required: {path}')
    for name in TEST_NAMES:
        if (root / f'server/test/{name}.test.js').exists():
            raise ValueError(f'New-test destination already exists: {name}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify-only', action='store_true')
    mode.add_argument('--output', type=Path, help='Write one NEW patch file; refuse overwrite')
    parser.add_argument('--repository', type=Path, help='Also verify exact merged timing source blobs; never apply')
    args = parser.parse_args()
    try:
        data = assemble(Path(__file__).resolve().parent)
        if args.repository:
            verify_repository(args.repository)
        if args.output:
            with args.output.open('xb') as handle:
                handle.write(data)
        print(f'V3 verified: {len(data)} bytes; SHA256 {EXPECTED_PATCH_SHA256}')
        print('No patch applied, application file changed, Git/network call, test execution or deployment.')
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
