export const workforceToday=()=>new Date().toISOString().slice(0,10);
export const emptyWorkforceEmployee=storeId=>({
  fullName:"",phone:"",email:"",baseStoreId:storeId||"",paymentType:"HOURLY",hourlyRate:"",fixedMonthlyAmount:"",effectiveFrom:workforceToday(),
  maxDaysPerWeek:"5",maxHoursPerWeek:"40",minimumDaysOff:"2",canChangeStore:false,worksMorning:true,worksAfternoon:true,worksNight:false,worksWeekend:true,
  notes:"",roleIds:[],primaryRoleId:"",storeIds:storeId?[storeId]:[]
});
export const workforceMigrationStatusLabel={READY:"Έτοιμο",NEEDS_REVIEW:"Χρειάζεται έλεγχο",ALREADY_LINKED:"Ήδη συνδεδεμένο",BLOCKED:"Μπλοκαρισμένο"};
export const formatWorkforceMoney=value=>value===null||value===undefined?"—":Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
