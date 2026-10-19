import {
  createDeliverySlot, reconcileDeliverySlot, claimDelivery, startDelivery,
  completeDelivery, recoverDelivery
} from "./automatic-report-delivery-lifecycle.js";

// DORMANT repository contract, NOT production enrollment. The caller must
// separately provision and review this table, its lifecycle/backup/retention
// integration and a trusted eligibility reader before any production use:
// "AutomaticReportDeliverySlot" (
//   "slotId" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL,
//   "storeId" TEXT NOT NULL, "version" BIGINT NOT NULL,
//   "status" TEXT NOT NULL, "token" TEXT NULL, "record" JSONB NOT NULL
// ) with version BETWEEN 1 AND 9007199254740991 and status restricted to the
// core states. Fixture DDL belongs ONLY in the isolated native test.
// There is deliberately no schema creation, transaction retry, transport or
// runtime wiring here. An awaited start receipt means ATTEMPTING committed;
// it is not fresh authorization proof or permission to send independently of
// the future trusted adapter. Never invoke transport inside readEligibility.
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};

// Inspect descriptors before copying: JSON.stringify/structuredClone can invoke
// getters. Snapshot arguments before the first await or trusted callback.
function clone(value,depth=0,budget={nodes:0}){
  if(++budget.nodes>20000||depth>15)fail("INVALID_INPUT","Metadata exceeds validation bounds.");
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value!=="object")fail("INVALID_INPUT","Only plain JSON metadata is accepted.");
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)fail("INVALID_INPUT","Plain metadata required.");
  const descriptors=Object.getOwnPropertyDescriptors(value),result=array?[]:{};
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=="string"||["__proto__","constructor","prototype"].includes(key))fail("INVALID_INPUT","Unsafe metadata key.");
    if(array&&key==="length")continue;
    const d=descriptors[key];
    if(!d.enumerable||!Object.hasOwn(d,"value"))fail("INVALID_INPUT","Accessors and hidden metadata are forbidden.");
    if(array&&!/^(0|[1-9]\d*)$/.test(key))fail("INVALID_INPUT","Array properties are forbidden.");
    result[key]=clone(d.value,depth+1,budget);
  }
  if(array&&(value.length>1000||Object.keys(result).length!==value.length))fail("INVALID_INPUT","Dense bounded arrays required.");
  return result;
}
function freeze(value){if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function shape(value,keys){if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))fail("INVALID_INPUT","Unexpected or missing fields.");}
function text(value){if(typeof value!=="string"||!value||value!==value.trim()||value.length>200||/[\u0000-\u001f\u007f]/.test(value))fail("INVALID_INPUT","Explicit company/store scope required.");}
function scope(value,existing){
  const result=clone(value);shape(result,existing?["companyId","storeId","slotId"]:["companyId","storeId"]);
  text(result.companyId);text(result.storeId);
  if(existing&&(typeof result.slotId!=="string"||!/^[a-f0-9]{64}$/.test(result.slotId)))fail("INVALID_INPUT","Canonical slotId required.");
  return freeze(result);
}
function instant(value){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail("INVALID_INPUT","Canonical UTC instant required.");}
function jsonIdentity(value){return JSON.stringify(value,(_key,child)=>child&&typeof child==="object"&&!Array.isArray(child)?Object.fromEntries(Object.keys(child).sort().map(key=>[key,child[key]])):child);}
function canonical(row,s){
  try{
    const r=clone(row.record),valid=reconcileDeliverySlot(r,r.input);
    // BIGINT is selected as text: no lossy Number conversion of native values.
    if(jsonIdentity(r)!==jsonIdentity(valid)||row.slotId!==s.slotId||row.companyId!==s.companyId||row.storeId!==s.storeId||
      valid.slotId!==row.slotId||valid.input.companyId!==row.companyId||valid.input.storeId!==row.storeId||
      typeof row.version!=="string"||row.version!==String(valid.version)||row.status!==valid.status||row.token!==valid.token)
      fail("DELIVERY_CORRUPT","Stored delivery projections disagree.");
    return valid;
  }catch{fail("DELIVERY_CORRUPT","Stored delivery metadata is invalid.");}
}
async function load(tx,s,lock=false){
  const rows=lock?await tx.$queryRaw`SELECT "slotId","companyId","storeId","version"::text AS "version","status","token","record" FROM "AutomaticReportDeliverySlot" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "slotId"=${s.slotId} FOR UPDATE`
    :await tx.$queryRaw`SELECT "slotId","companyId","storeId","version"::text AS "version","status","token","record" FROM "AutomaticReportDeliverySlot" WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "slotId"=${s.slotId}`;
  if(!Array.isArray(rows)||rows.length>1)fail("DELIVERY_CORRUPT","Unexpected delivery row count.");
  return rows.length?canonical(rows[0],s):null;
}
async function persist(tx,s,before,after){
  const rows=await tx.$queryRaw`UPDATE "AutomaticReportDeliverySlot" SET "version"=${BigInt(after.version)},"status"=${after.status},"token"=${after.token},"record"=${JSON.stringify(after)}::jsonb
    WHERE "companyId"=${s.companyId} AND "storeId"=${s.storeId} AND "slotId"=${s.slotId}
      AND "version"=${BigInt(before.version)} AND "status"=${before.status} AND "token" IS NOT DISTINCT FROM ${before.token}
      AND "record"=${JSON.stringify(before)}::jsonb
    RETURNING "slotId","companyId","storeId","version"::text AS "version","status","token","record"`;
  if(rows.length!==1)fail("STALE_VERSION","Delivery changed before persistence.");
  return canonical(rows[0],s);
}

export function createAutomaticReportDeliveryRepository({db,readEligibility}){
  if(!db||typeof db.$transaction!=="function"||typeof readEligibility!=="function")fail("INVALID_INPUT","Database and trusted eligibility reader required.");
  async function mutate(rawScope,rawConfig,transition,start=false){
    const s=scope(rawScope,true),config=clone(rawConfig);
    // Callers cannot provide replacement records or eligibility assertions.
    if(start)shape(config,["expectedVersion","token","now"]);
    return await db.$transaction(async tx=>{
      const before=await load(tx,s,true);
      if(!before)fail("DELIVERY_NOT_FOUND","No delivery in selected scope.");
      let options=config;
      if(start){
        instant(config.now);
        const current=await readEligibility({tx,companyId:s.companyId,storeId:s.storeId,input:before.input,now:config.now});
        options={...config,current};
      }
      const after=transition(before,options);
      return await persist(tx,s,before,after);
    });
  }
  return Object.freeze({
    async create(rawScope,rawInput,rawConfig){
      const s=scope(rawScope,false),input=freeze(clone(rawInput)),config=clone(rawConfig);shape(config,["now"]);instant(config.now);
      if(input?.companyId!==s.companyId||input?.storeId!==s.storeId)fail("INVALID_INPUT","Input differs from selected scope.");
      return await db.$transaction(async tx=>{
        const current=await readEligibility({tx,companyId:s.companyId,storeId:s.storeId,input,now:config.now});
        const candidate=createDeliverySlot(input,{now:config.now,current});
        const inserted=await tx.$queryRaw`INSERT INTO "AutomaticReportDeliverySlot" ("slotId","companyId","storeId","version","status","token","record")
          VALUES (${candidate.slotId},${s.companyId},${s.storeId},${BigInt(candidate.version)},${candidate.status},${candidate.token},${JSON.stringify(candidate)}::jsonb)
          ON CONFLICT ("slotId") DO NOTHING RETURNING "slotId"`;
        if(inserted.length>1)fail("DELIVERY_CORRUPT","Unexpected inserted row count.");
        const selected={...s,slotId:candidate.slotId},existing=await load(tx,selected,true);
        if(!existing)fail("DELIVERY_CONFLICT","Slot conflicts outside selected scope.");
        const record=reconcileDeliverySlot(existing,candidate.input);
        return Object.freeze({created:inserted.length===1,record});
      });
    },
    async get(rawScope){const s=scope(rawScope,true);return await db.$transaction(tx=>load(tx,s));},
    claim:(s,c)=>mutate(s,c,claimDelivery),
    start:(s,c)=>mutate(s,c,startDelivery,true),
    complete:(s,c)=>mutate(s,c,completeDelivery),
    recover:(s,c)=>mutate(s,c,recoverDelivery)
  });
}
