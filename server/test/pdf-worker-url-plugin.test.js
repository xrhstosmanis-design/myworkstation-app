import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {pdfWorkerUrlPlugin} from './helpers/pdf-worker-url-plugin.mjs';
const clientLoader=fileURLToPath(new URL('../../client/src/lib/invoice-pdf-count-loader.js',import.meta.url));
const require=createRequire(clientLoader);
const worker=require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const options={stdin:{contents:'import url from "pdfjs-dist/build/pdf.worker.min.mjs?url";export default url;',resolveDir:dirname(clientLoader),sourcefile:'worker-asset-fixture.mjs'},bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent'};
test('negative control: plain esbuild cannot interpret the Vite worker URL default import',async()=>{
  await assert.rejects(build(options),error=>error.errors?.some(item=>/No matching export/.test(item.text))===true);
});
test('test bundler exports the real local worker URL without executing or substituting its code',async()=>{
  const result=await build({...options,plugins:[pdfWorkerUrlPlugin()]}),module={exports:{}};
  new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
  assert.equal(module.exports.default,pathToFileURL(worker).href);
  assert.ok(existsSync(fileURLToPath(module.exports.default)));
assert.equal(dirname(worker),dirname(require.resolve('pdfjs-dist/build/pdf.mjs')));
  assert.doesNotMatch(result.outputFiles[0].text,/WorkerMessageHandler/);
});
test('the actual production PDF count loader still compiles with real PDF.js, not a parser stub',async()=>{
  const result=await build({entryPoints:[clientLoader],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent',plugins:[pdfWorkerUrlPlugin()]});
  assert.match(result.outputFiles[0].text,/getDocument/);
  assert.ok(result.outputFiles[0].text.includes(pathToFileURL(worker).href));
});
