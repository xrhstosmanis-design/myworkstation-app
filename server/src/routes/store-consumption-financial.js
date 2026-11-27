import {Router} from 'express';
import {prisma} from '../prisma.js';
import {requireStoreModule,isPlatformSuperAdmin} from '../middleware/module-access.js';
import {requireStaffGrant,staffError} from '../services/backoffice-staff-access.js';
import {consumptionFinancialFilters,readStoreConsumptionFinancialReport} from '../services/store-consumption-financial-report.js';
import {operationalFinancialReports} from '../../../shared/financial-consumption.mjs';

export function createStoreConsumptionFinancialRouter({db=prisma,moduleAccess=requireStoreModule,requireGrant=requireStaffGrant,reader=readStoreConsumptionFinancialReport}={}){
  const router=Router();
  for(const [report,{capability}] of Object.entries(operationalFinancialReports)){
    router.get(`/${report}`,moduleAccess('INVENTORY'),async(req,res,next)=>{
      res.set('Cache-Control','private, no-store');
      try{
        const storeId=req.query.storeId,store=req.targetStore,user=req.user;
        if(typeof storeId!=='string'||!storeId||store?.id!==storeId)throw staffError();
        const verify=async()=>{
          if(user?.tokenType==='STORE_OPERATOR')throw staffError();
          if(user?.supportContext&&(user.supportContext.companyId!==store.companyId||user.supportContext.storeId&&user.supportContext.storeId!==storeId))throw staffError();
          if(user?.staffAccess){
            if(user.storeId!==storeId||user.companyId!==store.companyId||req.staffGrant?.capability!==capability)throw staffError();
            if((await requireGrant(db,user,storeId,capability)).grant.profile!=='MANAGER')throw staffError();
          }else if(!isPlatformSuperAdmin(user)&&(user?.role!=='OWNER'||user.companyId!==store.companyId||user.supportContext))throw staffError();
        };
        await verify();
        const filters=consumptionFinancialFilters(req.query);
        const result=await reader(db,{companyId:store.companyId,storeId,report,filters});
        await verify();
        res.json(result);
      }catch(error){next(error)}
    });
  }
  return router;
}
export default createStoreConsumptionFinancialRouter();
