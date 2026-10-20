import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Only the standalone wholesale graph is cached. No retail entry, API or
// authenticated response is an input to this public application shell.
export function wholesaleShellFiles(bundle){
  const entry=Object.values(bundle).find(x=>x.type==='chunk'&&x.isEntry&&x.facadeModuleId?.replaceAll('\\','/').endsWith('/wholesale.html'));
  if(!entry)throw Error('Wholesale entry missing from offline shell build');
  const names=new Set(),visit=name=>{
    if(names.has(name))return;
    const chunk=bundle[name];if(!chunk)throw Error('Missing wholesale shell dependency: '+name);
    names.add(name);
    if(chunk.type==='chunk'){
      for(const child of [...chunk.imports,...chunk.dynamicImports])visit(child);
      for(const css of chunk.viteMetadata?.importedCss||[])visit(css);
      for(const asset of chunk.viteMetadata?.importedAssets||[])visit(asset);
    }
  };
  visit(entry.fileName);
  for(const name of names)if(!/^assets\/[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..'))throw Error('Invalid wholesale shell asset');
  return ['/wholesale/','/wholesale-app/wholesale.webmanifest','/pwa-192.png','/pwa-512.png',...[...names].sort().map(x=>'/'+x)];
}

export function wholesaleOfflineBuild({readResource=readFile}={}){
  return {name:'wholesale-offline-shell',apply:'build',async generateBundle(_options,bundle){
    const files=wholesaleShellFiles(bundle),digest=createHash('sha256');
    for(const value of Object.values(bundle).sort((a,b)=>a.fileName.localeCompare(b.fileName)))if(files.includes('/'+value.fileName)||value.fileName==='wholesale.html')digest.update(value.fileName).update(value.code??value.source??'');
    for(const relative of ['../public/wholesale-app/wholesale.webmanifest','../public/pwa-192.png','../public/pwa-512.png'])digest.update(await readResource(new URL(relative,import.meta.url)));
    const template=await readResource(new URL('../wholesale-sw.template.js',import.meta.url),'utf8');
    digest.update(template);
    this.emitFile({type:'asset',fileName:'wholesale-sw.js',source:template.replace('__WHOLESALE_SHELL_FILES__',JSON.stringify(files)).replace('__WHOLESALE_SHELL_VERSION__',digest.digest('hex').slice(0,24))});
  }};
}
