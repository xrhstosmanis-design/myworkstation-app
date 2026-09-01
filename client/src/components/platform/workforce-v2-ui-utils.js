export const workforceToday=()=>new Date().toISOString().slice(0,10);
export const emptyWorkforceEmployee=storeId=>({
  fullName:"",phone:"",email:"",baseStoreId:storeId||"",paymentType:"HOURLY",hourlyRate:"",fixedMonthlyAmount:"",effectiveFrom:workforceToday(),
  maxDaysPerWeek:"5",maxHoursPerWeek:"40",minimumDaysOff:"2",canChangeStore:false,worksMorning:true,worksAfternoon:true,worksNight:false,worksWeekend:true,
  notes:"",roleIds:[],primaryRoleId:"",storeIds:storeId?[storeId]:[]
});
export const emptyWorkforceRule=employeeId=>({
  employeeId:employeeId||"",ruleType:"NO_WEEKEND",severity:"ERROR",relatedEmployeeId:"",numericValue:"",validFrom:"",validTo:"",note:""
});
export const emptyWorkforceShiftTemplate=()=>({
  name:"Πρωί",code:"",category:"MORNING",startTime:"07:00",endTime:"15:00",minimumPeople:"1",maximumPeople:"",
  requiredRoleId:"",requiresSupervisor:false,changeAllowed:true
});
export const workforceMigrationStatusLabel={READY:"Έτοιμο",NEEDS_REVIEW:"Χρειάζεται έλεγχο",ALREADY_LINKED:"Ήδη συνδεδεμένο",BLOCKED:"Μπλοκαρισμένο"};
export const workforceRuleSeverityLabel={WARNING:"Προειδοποίηση",ERROR:"Σφάλμα",APPROVAL_REQUIRED:"Χρειάζεται έγκριση"};
export const formatWorkforceMoney=value=>value===null||value===undefined?"—":Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
export const workforceDateInput=value=>value?new Date(value).toISOString().slice(0,10):"";
