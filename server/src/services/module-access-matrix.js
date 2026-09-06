import {userMayAccessModule} from "../middleware/module-access.js";

const accessReason=({effectiveActive,roleAllowed,explicitPermission=false})=>{
  if(!effectiveActive)return "Μη ενεργό ή εκτός περιόδου άδειας";
  if(!roleAllowed)return "Απαιτεί ειδικό περιορισμένο δικαίωμα";
  return explicitPermission?"Επιτρέπεται μόνο με ειδικό δικαίωμα":"Επιτρέπεται από την ενεργή άδεια";
};

export function buildModuleAccessMatrix({catalog=[],licenseAllowed=false,companyActiveModules=[],storeModules=[]}){
  const companyActive=new Set(companyActiveModules);
  const storeByKey=new Map(storeModules.map(module=>[module.key,module]));
  const rows=catalog.map(module=>{
    const storeState=storeByKey.get(module.key);
    const companyEnabled=Boolean(licenseAllowed)&&companyActive.has(module.key);
    const effectiveActive=Boolean(licenseAllowed)&&(storeState?.configured?Boolean(storeState.active):companyEnabled);
    const employeeRoleAllowed=userMayAccessModule({role:"EMPLOYEE"},module.key);
    const employeeWithPermission=userMayAccessModule({role:"EMPLOYEE",permissions:[`MODULE:${module.key}`]},module.key);
    return {
      key:module.key,
      name:module.name,
      category:module.category,
      commercialReady:Boolean(module.commercialReady),
      source:storeState?.configured?"STORE_OVERRIDE":"COMPANY",
      companyActive:companyEnabled,
      storeConfigured:Boolean(storeState?.configured),
      effectiveActive,
      superAdmin:{allowed:true,reason:"Μόνιμη πρόσβαση Super Admin"},
      owner:{allowed:effectiveActive,reason:accessReason({effectiveActive,roleAllowed:true})},
      employee:{allowed:effectiveActive&&employeeRoleAllowed,reason:accessReason({effectiveActive,roleAllowed:employeeRoleAllowed})},
      employeeWithPermission:{allowed:effectiveActive&&employeeWithPermission,reason:accessReason({effectiveActive,roleAllowed:employeeWithPermission,explicitPermission:!employeeRoleAllowed})}
    };
  });
  return {
    licenseAllowed:Boolean(licenseAllowed),
    summary:{
      modules:rows.length,
      ownerAllowed:rows.filter(row=>row.owner.allowed).length,
      employeeAllowed:rows.filter(row=>row.employee.allowed).length,
      employeeRestricted:rows.filter(row=>row.effectiveActive&&!row.employee.allowed).length
    },
    rows
  };
}
