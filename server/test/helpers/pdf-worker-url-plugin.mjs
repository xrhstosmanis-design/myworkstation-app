// Node/esbuild fixtures need Vite's ?url asset-import contract.
// Resolve the real local worker file to a URL; do not execute or stub PDF.js.
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function pdfWorkerUrlPlugin(){
  return {name:'pdf-worker-url-for-node-tests',setup(builder){
    builder.onResolve({filter:/^pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url$/},args=>({
      path:createRequire(join(args.resolveDir||process.cwd(),'pdf-worker-fixture.cjs')).resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
      namespace:'mws-pdf-worker-url'
    }));
    builder.onLoad({filter:/.*/,namespace:'mws-pdf-worker-url'},args=>({
      contents:`export default ${JSON.stringify(pathToFileURL(args.path).href)};`,loader:'js'
    }));
  }};
}
