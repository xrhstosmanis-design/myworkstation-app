import {readFileSync} from 'node:fs';
import {automaticReportEventConsentColumns} from './automatic-report-event-schema.js';

const fail=()=>{throw Object.assign(new Error('Report authorization schema requires review.'),{status:409})};
const definition=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/automatic-report-consent-extension.proposed.json',import.meta.url),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// A pre-install inspection of the original lifecycle profile may exclude only
// these separately reviewed additions. The target installer validates the full
// catalogue, including both tables, before committing any transition.
export async function prepareAutomaticReportConsentInspection(tx,schema,manifest,{extensions}={}){
  const layouts={
    AutomaticReportSupplierComparisonConsent:manifest.knownColumns?.AutomaticReportRecipientConsent,
    AutomaticReportEventConsent:automaticReportEventConsentColumns
  };
  if(!Array.isArray(extensions)||extensions.length>2||new Set(extensions).size!==extensions.length||
    extensions.some(name=>!Object.hasOwn(layouts,name)||!layouts[name]||manifest.knownTables?.includes(name)))fail();
  if(!extensions.length)return {tx,evidence:[]};
  const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relkind::text AS kind,
    c.relowner=(SELECT own.relowner FROM pg_class own JOIN pg_namespace ownns ON ownns.oid=own.relnamespace WHERE ownns.nspname=$1 AND own.relname='Store') AS owner_valid,
    c.relispartition AS partition,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
    EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid) AS inherited,
    EXISTS(SELECT 1 FROM pg_rewrite w WHERE w.ev_class=c.oid AND w.rulename<>'_RETURN') AS rewritten
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`,schema,extensions);
  if(relations.length!==extensions.length||relations.some(row=>row.owner_valid!==true||row.kind!=='r'||row.partition||row.rls||row.forced||row.inherited||row.rewritten))fail();
  const columns=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,
    format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull",
    a.attidentity::text AS identity,a.attgenerated::text AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum`,schema,extensions);
  for(const name of extensions){
    const actual=columns.filter(column=>column.table===name);
    if(!same(actual.map(column=>[column.name,column.type,column.notNull]),layouts[name])||
      actual.some(column=>column.identity!==''||column.generated!==''||column.default_expression!==(definition.defaults[column.name]??null)))fail();
  }
  const triggers=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",t.tgname AS name
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND NOT t.tgisinternal`,schema,extensions);
  if(triggers.length)fail();
  const keys=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",k.contype::text AS kind,
    k.convalidated AS validated,k.condeferrable AS deferrable,
    k.confupdtype::text AS update_action,k.confdeltype::text AS delete_action,k.confmatchtype::text AS match_type,
    p.relname AS parent,pn.nspname AS "parentSchema",
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(num,pos)
      JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num ORDER BY u.pos) AS columns,
    ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(num,pos)
      JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.num ORDER BY u.pos) AS "parentColumns"
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_class p ON p.oid=k.confrelid LEFT JOIN pg_namespace pn ON pn.oid=p.relnamespace
    WHERE k.contype IN ('p','f') AND
      ((n.nspname=$1 AND c.relname=ANY($2::text[])) OR (pn.nspname=$1 AND p.relname=ANY($2::text[])))
    ORDER BY c.relname,k.contype`,schema,extensions);
  for(const name of extensions){
    const primary=keys.filter(key=>key.table===name&&key.kind==='p');
    const foreign=keys.filter(key=>key.table===name&&key.kind==='f');
    const expected=name==='AutomaticReportEventConsent'
      ?['companyId','storeId','reportType','recipientId']:['companyId','storeId','recipientId'];
    if(primary.length!==1||!same(primary[0].columns,expected)||primary[0].deferrable||
      foreign.length!==1||foreign[0].parent!=='AutomaticReportRecipient'||foreign[0].parentSchema!==schema||
      !same(foreign[0].columns,['companyId','storeId','recipientId'])||
      !same(foreign[0].parentColumns,['companyId','storeId','recipientId'])||
      !foreign[0].validated||foreign[0].deferrable||foreign[0].update_action!=='a'||foreign[0].delete_action!=='a'||foreign[0].match_type!=='s')fail();
  }
  if(keys.some(key=>extensions.includes(key.parent)))fail();
  const checks=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",k.convalidated AS validated,
    k.condeferrable AS deferrable,pg_get_constraintdef(k.oid,true) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND k.contype='c'
    ORDER BY c.relname,definition`,schema,extensions);
  const indexes=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",i.indisprimary AS "primary",
    i.indisunique AS "unique",i.indisvalid AS valid,i.indisready AS ready,i.indimmediate AS immediate,
    pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_expr(i.indexprs,i.indrelid) AS expression,
    ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY u(num,pos)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.num ORDER BY u.pos) AS columns
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) ORDER BY c.relname`,schema,extensions);
  for(const name of extensions){
    const actual=checks.filter(check=>check.table===name);
    if(actual.some(check=>!check.validated||check.deferrable)||
      !definition.checks[name]?.some(allowed=>same([...allowed].sort(),actual.map(check=>check.definition).sort())))fail();
    const own=indexes.filter(index=>index.table===name),primary=keys.find(key=>key.table===name&&key.kind==='p');
    if(own.length!==1||!own[0].primary||!own[0].unique||!own[0].valid||!own[0].ready||!own[0].immediate||
      own[0].predicate!==null||own[0].expression!==null||!same(own[0].columns,primary.columns))fail();
  }
  const excluded=new Set(extensions);
  const tracked=new Proxy(tx,{get(target,key){
    if(key==='$queryRawUnsafe')return async(sql,...values)=>{
      const rows=await target.$queryRawUnsafe(sql,...values);
      // The lifecycle inspector uses these fields only for catalogue rows.
      // Application rows and every undeclared relation remain visible.
      return rows.filter(row=>!excluded.has(row.table)&&!excluded.has(row.child)&&
        !(row.kind!==undefined&&excluded.has(row.name)));
    };
    const value=Reflect.get(target,key);
    return typeof value==='function'?value.bind(target):value;
  }});
  return {tx:tracked,evidence:{relations,columns,keys,checks,indexes}};
}
