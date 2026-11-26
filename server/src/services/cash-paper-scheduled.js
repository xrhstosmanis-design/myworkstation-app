import {createCashPaperProvider} from './cash-paper-provider.js';
import {createCashPaperRepository} from './cash-paper-repository.js';
import {createCashPaperReader} from './cash-paper-reader.js';
import {readCashChatEvidence} from './cash-chat-evidence.js';
import {companyModuleState,effectiveModuleEnabled} from '../middleware/module-access.js';
import {walletActivitySchema} from './ai-wallet-activity.js';

const maxAttachments=3;
const maxCompletedPeriodAgeMs=24*60*60_000;

async function canReadChatPapers(db,{companyId,storeId}){
  const license=await companyModuleState(companyId,{db});
  if(!license?.licenseAllowed)return false;
  for(const moduleKey of ['STORE_CHAT','AI_READER']){
    const [override]=await db.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule"
      WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`;
    if(!effectiveModuleEnabled(license.activeModules.includes(moduleKey),override?{...override,configured:true}:{configured:false}))return false;
  }
  return true;
}

export function createScheduledCashPaperReader(db,{
  repository=createCashPaperRepository(db),
  reader=createCashPaperReader({repository,provider:createCashPaperProvider()}),
  discover=readCashChatEvidence,
  authorized=canReadChatPapers,
  env=process.env
}={}){
  return async ({companyId,storeId},period)=>{
    const final=period.stage==='FINAL';
    const now=Date.parse(period.now),from=Date.parse(period.from),to=Date.parse(period.to);
    if(env.AI_OWNER_WALLET_ENABLED!=='true'||!Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(now)||
      from>=to||now<to||(!final&&now>=to+maxCompletedPeriodAgeMs))return 'DONE';
    const scope={companyId,storeId,generation:period.generation};
    try{
      if(await repository.generation(scope)!==scope.generation)return 'DONE';
      const [slot]=await db.$queryRaw`SELECT 1 FROM "AutomaticReportDeliverySlot"
        WHERE "companyId"=${companyId} AND "storeId"=${storeId}
          AND "record"->'input'->>'reportType'='CASH' AND "record"->'input'->>'frequency'='DAILY'
          AND "record"->'input'->>'periodFrom'=${period.from} AND "record"->'input'->>'periodTo'=${period.to}
          AND (NOT ${final} OR "record"->'input'->>'stage'='FINAL') LIMIT 1`;
      if(slot||!await authorized(db,scope))return 'DONE';
      const actor=await db.user.findUnique({where:{id:period.actorId},select:{id:true,role:true,fullName:true,mustChangePassword:true}});
      if(actor?.role!=='SUPER_ADMIN'||actor.mustChangePassword)return 'DONE';
      const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'});
      const cashDay=formatter.format(new Date(from)),endDay=formatter.format(new Date(to));
      const discovery=await discover(db,scope,{from:new Date(from),to:new Date(final?Math.min(now+1,to+maxCompletedPeriodAgeMs):now+1),cashDay});
      const candidates=discovery.sources.filter(source=>source.checksum&&Number.isSafeInteger(source.sizeBytes)&&
        source.sizeBytes>0&&source.sizeBytes<=7*1024*1024&&source.references[0]?.messageId);
      const inspected=await Promise.all(candidates.map(async source=>({source,reading:await repository.get(scope,source.checksum)})));
      const selected=inspected.filter(({source,reading})=>{
        if(source.references.some(reference=>reference.declaredCashDay===cashDay))return true;
        if(final&&source.references.some(reference=>reference.declaredCashDay))return false;
        const printedDay=reading.extraction?.documentDate;
        return reading.status!=='EXTRACTED_UNVERIFIED'||!printedDay||(printedDay>=cashDay&&printedDay<=endDay);
      }).slice(0,maxAttachments);
      const readings=selected.map(({reading})=>reading);
      if(readings.some(reading=>{
        const pendingAt=reading.status==='PENDING'?reading.requestedAt:reading.rereadRequestedAt;
        const elapsed=now-Date.parse(pendingAt);
        return Number.isFinite(elapsed)&&elapsed<120_000;
      }))return 'MORE';
      const index=readings.findIndex(reading=>reading.status==='NOT_READ'||reading.canReread===true);
      if(index<0)return 'DONE';
      const {source}=selected[index],messageId=source.references[0].messageId;
      scope.activity=walletActivitySchema.parse({version:1,companyId,storeId,purpose:'CASH_PAPER_READING',surface:'CASH_REVIEW',
        execution:'BACKGROUND',actor:null,terminalPos:null,documentId:messageId,documentNumber:null,jobId:null});
      const operation=readings[index].canReread===true?'reread':'read';
      const result=await reader[operation](scope,actor,{messageId,checksum:source.checksum});
      if(result?.status==='PENDING')return 'MORE';
      return readings.slice(index+1).some(reading=>reading.status==='NOT_READ'||reading.canReread===true)?'MORE':'DONE';
    }catch{
      // An unavailable or uncertain reading remains visible as pending evidence.
      return 'DONE';
    }
  };
}
