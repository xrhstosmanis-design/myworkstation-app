import assert from 'node:assert/strict';

export const DISPATCH_TABLES=Object.freeze(['AutomaticReportDispatchPolicy','AutomaticReportAutomationGrant','AutomaticReportRecipient','AutomaticReportRecipientConsent','AutomaticReportPayload','AutomaticReportDeliverySlot'].sort());
export function schemaIdentifier(schema){
  if(typeof schema!=='string'||! /^[a-z_][a-z0-9_]{0,62}$/.test(schema))throw new Error('PROVISION_SCHEMA_INVALID');
  return '"'+schema+'"';
}
export async function assertDispatchStorageAbsent(tx,schema){
  schemaIdentifier(schema);
  const objects=await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) UNION ALL SELECT t.typname AS name FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND (t.typname=ANY($2::text[]) OR t.typname=ANY($3::text[]))`,schema,DISPATCH_TABLES,DISPATCH_TABLES.map(n=>'_'+n));
  if(objects.length)throw new Error('PROVISION_STORAGE_EXISTS');
}

// PostgreSQL deparses under the same explicit search_path for every capture.
// Only structured namespace fields are normalized; SQL literals are untouched.
export async function captureDispatchCatalog(tx,schema){
  const identifier=schemaIdentifier(schema);
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${identifier}, pg_temp`);
  const [version]=await tx.$queryRawUnsafe('SELECT current_setting(\'server_version_num\')::int AS version');
  const tables=[];
  for(const name of DISPATCH_TABLES){
    const rows=await tx.$queryRawUnsafe(`SELECT c.oid::text AS oid,c.relkind::text AS kind,c.relpersistence::text AS persistence,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced_rls,c.relispartition AS partition,c.relreplident::text AS replica_identity,c.reloptions AS options,c.relacl::text AS acl FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`,schema,name);
    if(rows.length!==1)throw new Error('PROVISION_CATALOG_RELATION_MISSING');
    const {oid,...relation}=rows[0];
    const columns=await tx.$queryRawUnsafe(`SELECT a.attnum AS position,a.attname AS name,tn.nspname AS type_schema,t.typname AS type,a.atttypmod AS modifier,a.attndims AS dimensions,a.attnotnull AS not_null,a.attidentity::text AS identity,a.attgenerated::text AS generated,a.attisdropped AS dropped,cn.nspname AS collation_schema,coll.collname AS collation,pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) AS default_expression FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_type t ON t.oid=a.atttypid LEFT JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_catalog.pg_collation coll ON coll.oid=a.attcollation LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=coll.collnamespace WHERE a.attrelid=$1::oid AND a.attnum>0 ORDER BY a.attnum`,oid);
    const constraints=await tx.$queryRawUnsafe(`SELECT co.conname AS name,co.contype::text AS type,co.condeferrable AS deferrable,co.condeferred AS deferred,co.convalidated AS validated,co.conislocal AS local,co.coninhcount AS inherited,co.connoinherit AS no_inherit,co.conkey AS columns,co.confkey AS referenced_columns,rn.nspname AS referenced_schema,rc.relname AS referenced_table,co.confupdtype::text AS update_action,co.confdeltype::text AS delete_action,co.confmatchtype::text AS match,pg_catalog.pg_get_constraintdef(co.oid,false) AS definition FROM pg_catalog.pg_constraint co LEFT JOIN pg_catalog.pg_class rc ON rc.oid=co.confrelid LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace WHERE co.conrelid=$1::oid ORDER BY co.conname`,oid);
    const indexes=await tx.$queryRawUnsafe(`SELECT ic.relname AS name,am.amname AS method,i.indnatts AS attributes,i.indnkeyatts AS key_attributes,i.indisunique AS unique,i.indisprimary AS primary,i.indisexclusion AS exclusion,i.indimmediate AS immediate,i.indisclustered AS clustered,i.indisvalid AS valid,i.indcheckxmin AS check_xmin,i.indisready AS ready,i.indislive AS live,i.indisreplident AS replica_identity,i.indnullsnotdistinct AS nulls_not_distinct,i.indkey::text AS keys,i.indoption::text AS options,ic.reloptions AS relation_options,pg_catalog.pg_get_expr(i.indexprs,i.indrelid,false) AS expressions,pg_catalog.pg_get_expr(i.indpred,i.indrelid,false) AS predicate,ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid,k,false) FROM pg_catalog.generate_series(1,i.indnatts) k) AS definitions,ARRAY(SELECT onsp.nspname||'.'||op.opcname FROM pg_catalog.unnest(i.indclass::oid[]) WITH ORDINALITY x(id,pos) JOIN pg_catalog.pg_opclass op ON op.oid=x.id JOIN pg_catalog.pg_namespace onsp ON onsp.oid=op.opcnamespace ORDER BY x.pos) AS opclasses,ARRAY(SELECT CASE WHEN x.id=0 THEN NULL ELSE cn.nspname||'.'||co.collname END FROM pg_catalog.unnest(i.indcollation::oid[]) WITH ORDINALITY x(id,pos) LEFT JOIN pg_catalog.pg_collation co ON co.oid=x.id LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace ORDER BY x.pos) AS collations,(SELECT conname FROM pg_catalog.pg_constraint WHERE conindid=i.indexrelid AND conrelid=i.indrelid LIMIT 1) AS constraint FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=ic.relam WHERE i.indrelid=$1::oid ORDER BY ic.relname`,oid);
    const [extras]=await tx.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgrelid=$1::oid AND NOT tgisinternal) AS triggers,(SELECT count(*)::int FROM pg_catalog.pg_policy WHERE polrelid=$1::oid) AS policies,(SELECT count(*)::int FROM pg_catalog.pg_rewrite WHERE ev_class=$1::oid) AS rules,(SELECT count(*)::int FROM pg_catalog.pg_inherits WHERE inhrelid=$1::oid OR inhparent=$1::oid) AS inheritance,(SELECT count(*)::int FROM pg_catalog.pg_depend WHERE classid='pg_catalog.pg_class'::regclass AND objid=$1::oid AND deptype='e') AS extension_memberships`,oid);
    const types=await tx.$queryRawUnsafe(`SELECT t.typname AS name,t.typtype::text AS kind,t.typrelid::text=$1 AS own_relation,tn.nspname AS element_schema,et.typname AS element_type FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_catalog.pg_type et ON et.oid=t.typelem LEFT JOIN pg_catalog.pg_namespace tn ON tn.oid=et.typnamespace WHERE n.nspname=$2 AND (t.typname=$3 OR t.typname=$4) ORDER BY t.typname`,oid,schema,name,'_'+name);
    for(const c of constraints)if(c.referenced_schema===schema)c.referenced_schema='$TARGET_SCHEMA';
    for(const t of types)if(t.element_schema===schema)t.element_schema='$TARGET_SCHEMA';
    const [count]=await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${identifier}."${name}"`);
    tables.push({name,relation,columns,constraints,indexes,extras,types,rows:count.count});
  }
  return {format:'MWS_DISPATCH_CATALOG_V1',serverMajor:Math.floor(version.version/10000),tables};
}
export function assertDispatchCatalog(actual,expected){
  if(!expected||expected.format!=='MWS_DISPATCH_CATALOG_V1'||!Array.isArray(expected.tables))throw new Error('PROVISION_ORACLE_INVALID');
  assert.deepEqual(expected.tables.map(t=>t.name),DISPATCH_TABLES,'PROVISION_ORACLE_TABLE_SET');
  for(const t of expected.tables){
    if(t.relation.kind!=='r'||t.relation.persistence!=='p'||t.relation.rls||t.relation.forced_rls||t.relation.partition||t.rows!==0||t.columns.some(c=>c.dropped||c.type_schema!=='pg_catalog')||Object.values(t.extras).some(n=>n!==0))throw new Error('PROVISION_ORACLE_UNSAFE');
    if(t.types.length!==2||!t.types.some(x=>x.name===t.name&&x.kind==='c'&&x.own_relation===true)||!t.types.some(x=>x.name==='_'+t.name&&x.kind==='b'&&x.element_schema==='$TARGET_SCHEMA'&&x.element_type===t.name))throw new Error('PROVISION_ORACLE_TYPES');
  }
  try{assert.deepEqual(actual,expected);}catch{throw new Error('PROVISION_CATALOG_MISMATCH');}
}
