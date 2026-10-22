import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const folder=fileURLToPath(new URL('./',import.meta.url));
const output=fileURLToPath(new URL('./dist/',import.meta.url));
await mkdir(output,{recursive:true});
await build({
  entryPoints:[folder+'client.jsx'],outfile:output+'lab.js',bundle:true,
  platform:'browser',format:'esm',target:['es2022'],jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'},
  minify:true,sourcemap:false,legalComments:'none',logLevel:'warning',
  plugins:[{name:'visual-lab-disabled-pdf-worker',setup(builder){
    builder.onResolve({filter:/\?url$/},args=>{
      if(args.path!=='pdfjs-dist/build/pdf.worker.min.mjs?url')throw new Error('Unsupported LAB asset: '+args.path);
      return {path:args.path,namespace:'visual-lab-disabled-asset'};
    });
    builder.onLoad({filter:/.*/,namespace:'visual-lab-disabled-asset'},()=>({loader:'js',contents:'export default "/visual-lab-unavailable/pdf.worker.mjs";'}));
  }}],
});
await writeFile(output+'index.html','<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyWorkStation LAB — οπτικός έλεγχος</title><link rel="stylesheet" href="/lab.css"></head><body><div id="root"></div><script type="module" src="/lab.js"></script></body></html>');
console.log('POS visual-only LAB built: dist/index.html, dist/lab.js, dist/lab.css. No production build or server imports.');
