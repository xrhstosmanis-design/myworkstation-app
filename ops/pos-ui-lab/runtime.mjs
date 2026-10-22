import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const sourceRevision=process.env.RENDER_GIT_COMMIT||'local-modern-layout-unreleased';
const defaultDirectory=fileURLToPath(new URL('./dist/',import.meta.url));
export async function startPreview({port=Number(process.env.PORT||8080),host='0.0.0.0',directory=defaultDirectory,environment=process.env}={}){
  // This runtime has no database/client/router imports and accepts no credentials.
  for(const [key,value] of Object.entries(environment)){
    if(value&&(/^(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|JWT_SECRET|PGHOST|PGHOSTADDR|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGPASSFILE|PGOPTIONS|PGSERVICE|PGSERVICEFILE|PGSSLMODE|PGSSLROOTCERT)$/.test(key)||/(?:DATABASE|POSTGRES|SUPABASE).*(?:URL|KEY|PASSWORD)$/i.test(key)||/^(SMTP_|SENDGRID_|MAILGUN_|NETLINK_|RBS_|MYDATA_|STRIPE_|OPENAI_API_KEY|AZURE_OPENAI_|VAPID_PRIVATE)/i.test(key)))throw new Error('POS visual LAB refuses inherited application credentials.');
  }
  const files=new Map();
  for(const [url,name,type] of [['/','index.html','text/html; charset=utf-8'],['/lab.js','lab.js','text/javascript; charset=utf-8'],['/lab.css','lab.css','text/css; charset=utf-8']])files.set(url,{data:await readFile(path.join(directory,name)),type});
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), payment=(), usb=(), serial=()');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; worker-src 'none'");
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Οπτικό LAB μόνο — η καταχώρηση δεν επιτρέπεται.',code:'VISUAL_LAB_WRITE_DENIED'});
    let pathname;
    try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return json(400,{error:'Μη έγκυρη διαδρομή.',code:'VISUAL_LAB_INVALID_URL'});}
    if(pathname==='/api/health')return json(200,{ok:true,testOnly:true,mode:'visual-only',sourceRevision,revision:environment.RENDER_GIT_COMMIT||'local',database:false,transactions:false,providers:false});
    const file=files.get(pathname);
    if(!file)return json(404,{error:'Η διαδρομή δεν διατίθεται στο οπτικό LAB.',code:'VISUAL_LAB_ROUTE_DENIED'});
    res.writeHead(200,{'Content-Type':file.type});res.end(req.method==='HEAD'?undefined:file.data);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {server,close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startPreview().then(({server,close})=>{
    console.log(JSON.stringify({event:'pos-visual-lab-ready',sourceRevision,port:server.address().port,transactions:false}));
    let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;await close();process.exit(0);});
  }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
