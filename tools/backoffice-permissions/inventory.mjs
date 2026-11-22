// Review inventory, never an authorization policy. Dynamic controls and route
// paths remain explicit unresolved candidates; discovery cannot grant access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {parse}=createRequire(import.meta.url)('@babel/parser');
export function walk(node,visit){if(!node||typeof node!=='object')return;if(node.type)visit(node);for(const [k,v] of Object.entries(node)){if(['loc','start','end','comments','tokens'].includes(k))continue;if(Array.isArray(v))v.forEach(n=>walk(n,visit));else if(v&&typeof v==='object')walk(v,visit)}}
const literal=node=>node?.type==='StringLiteral'?node.value:node?.type==='TemplateLiteral'?node.quasis.map((q,i)=>q.value.cooked+(i<node.expressions.length?'${…}':'')).join(''):null;
const dynamicPath=node=>!literal(node)||Boolean(node?.type==='TemplateLiteral'&&node.expressions.length);
const childText=node=>{if(node?.type==='JSXText')return node.value;if(node?.type==='StringLiteral')return node.value;if(node?.type==='JSXExpressionContainer')return childText(node.expression);if(node?.type==='JSXElement')return node.children.map(childText).join(' ');return ''};
const resolve=(root,file,spec)=>{if(!spec.startsWith('.'))return null;const p=path.resolve(path.dirname(file),spec.split('?')[0]);return [p,p+'.jsx',p+'.js',p+'.mjs',path.join(p,'index.js')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()&&/\.(jsx?|mjs)$/.test(p)&&p.startsWith(root+path.sep))||null};
export function scanSource(source,file){
 const ast=parse(source,{sourceType:'unambiguous',plugins:['jsx','importAttributes'],errorRecovery:false}),imports=[],controls=[],requests=[],routes=[];
 walk(ast,node=>{
  if(node.type==='ImportDeclaration')imports.push(node.source.value);
  if(node.type==='CallExpression'&&node.callee.type==='Import'&&literal(node.arguments[0]))imports.push(literal(node.arguments[0]));
  if(node.type==='JSXElement'&&['button','form','select','input','textarea'].includes(node.openingElement.name?.name)){
   const tag=node.openingElement.name.name,attributes=node.openingElement.attributes;
   const get=name=>{const v=attributes.find(a=>a.type==='JSXAttribute'&&a.name.name===name)?.value;return literal(v)||literal(v?.expression)};
   controls.push({file,line:node.loc.start.line,tag,label:(get('aria-label')||get('title')||node.children.map(childText).join(' ')).replace(/\s+/g,' ').trim(),handlers:attributes.filter(a=>a.name?.name?.startsWith('on')).map(a=>a.name.name),dynamic:!node.children.some(c=>childText(c).trim())&&!get('aria-label')&&!get('title')});
  }
  if(node.type!=='CallExpression')return;
  if((node.callee.type==='Identifier'&&['api','request','fetch','read','scoped','scopedApi'].includes(node.callee.name))||literal(node.arguments[0])?.startsWith('/api/')){
   const options=node.arguments[1],method=options?.type==='ObjectExpression'?options.properties.find(p=>p.key?.name==='method'||p.key?.value==='method'):null;
   requests.push({file,line:node.loc.start.line,path:literal(node.arguments[0]),method:method?literal(method.value):options&&options.type!=='ObjectExpression'?'UNKNOWN':'GET',dynamic:dynamicPath(node.arguments[0])||Boolean(method&&!literal(method.value))||Boolean(options&&options.type!=='ObjectExpression')});
  }
  if(node.callee.type==='MemberExpression'&&['get','post','put','patch','delete','all','use'].includes(node.callee.property?.name)&&/^(router|app)$|Router$/.test(node.callee.object?.name||'')){
   routes.push({file,line:node.loc.start.line,method:node.callee.property.name.toUpperCase(),path:literal(node.arguments[0]),dynamic:dynamicPath(node.arguments[0])});
  }
 });
 return {imports,controls,requests,routes};
}
export function inventory(root){
 const queue=['client/src/main.jsx','client/src/components/commerce/CommerceLauncher.jsx','client/src/entry.jsx'].map(f=>path.join(root,f)),seen=new Set(),files=[],controls=[],requests=[],routes=[],unresolvedImports=[],parseErrors=[];
 const scan=(source,file)=>{try{return scanSource(source,file)}catch(error){parseErrors.push({file,message:error.message});return {imports:[...source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]),controls:[],requests:[],routes:[]}}};
 while(queue.length){const file=queue.shift();if(seen.has(file))continue;seen.add(file);const relative=path.relative(root,file),source=fs.readFileSync(file,'utf8'),s=scan(source,relative);files.push({path:relative,sha256:crypto.createHash('sha256').update(source).digest('hex')});controls.push(...s.controls);requests.push(...s.requests);for(const spec of s.imports){const resolved=resolve(root,file,spec);if(resolved)queue.push(resolved);else if(spec.startsWith('.')&&/\.(jsx?|mjs)(\?|$)/.test(spec))unresolvedImports.push({file:relative,spec})}}
 function serverFiles(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())serverFiles(p);else if(/\.(js|mjs)$/.test(p)){const s=scan(fs.readFileSync(p,'utf8'),path.relative(root,p));routes.push(...s.routes)}}}
 serverFiles(path.join(root,'server/src'));
 for(const a of [files,controls,requests,routes,unresolvedImports])a.sort((a,b)=>(a.file||a.path).localeCompare(b.file||b.path)||(a.line||0)-(b.line||0));
 return {schemaVersion:1,purpose:'REVIEW CANDIDATES ONLY; entry graph includes POS/platform/bootstrap branches, which require explicit Owner BackOffice classification; dynamic HTML and runtime-generated controls require manual review. No discovered route/control grants access.',files,controls,requests,routes,unresolvedImports,parseErrors,totals:{parseErrors:parseErrors.length,files:files.length,controls:controls.length,requests:requests.length,routes:routes.length,dynamicControls:controls.filter(x=>x.dynamic).length,dynamicRequests:requests.filter(x=>x.dynamic).length,dynamicRoutes:routes.filter(x=>x.dynamic).length}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),result=inventory(root),target=process.argv[2];if(target)fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));if(target)console.log(JSON.stringify(result.totals));
}
