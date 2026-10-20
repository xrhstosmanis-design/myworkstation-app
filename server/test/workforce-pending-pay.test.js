import test from "node:test";
import assert from "node:assert/strict";
import {employeeSchema} from "../src/routes/workforce-v2-validation.js";
import {assertNoPendingRemuneration,assertRemunerationCanBeDeferred} from "../src/workforce-pending-pay.js";
import {payrollGross} from "../src/workforce-v2-payroll.js";

const employee=(extra={})=>({
  fullName:"Synthetic pending cashier",baseStoreId:"own-store",paymentType:"UNSET",
  hourlyRate:null,dailyRate:null,fixedMonthlyAmount:null,effectiveFrom:"2026-10-20",
  maxDaysPerWeek:4,maxHoursPerWeek:32,minimumDaysOff:3,canChangeStore:false,
  worksMorning:false,worksAfternoon:false,worksNight:false,worksWeekend:false,
  roleIds:["cashier"],primaryRoleId:"cashier",storeAccess:[{storeId:"own-store",canSchedule:true}],
  confirmed:true,reason:"Create pending profile",...extra
});

test("a pending employee retains contract limits without a pay amount",()=>{
  const result=employeeSchema.parse(employee());
  assert.equal(result.paymentType,"UNSET");
  assert.equal(result.hourlyRate,null);
  assert.equal(result.dailyRate,null);
  assert.equal(result.fixedMonthlyAmount,null);
  assert.equal(result.maxHoursPerWeek,32);
  assert.equal(result.maxDaysPerWeek,4);
});

test("pending pay refuses supplied money, including a fabricated zero",()=>{
  for(const field of ["hourlyRate","dailyRate","fixedMonthlyAmount"])
    for(const amount of [0,1,9.99])
      assert.equal(employeeSchema.safeParse(employee({[field]:amount})).success,false);
});

test("known pay types still require a positive value",()=>{
  for(const [paymentType,field] of [["HOURLY","hourlyRate"],["DAILY","dailyRate"],["FIXED_MONTHLY","fixedMonthlyAmount"]]){
    assert.equal(employeeSchema.safeParse(employee({paymentType})).success,false);
    assert.equal(employeeSchema.safeParse(employee({paymentType,[field]:0})).success,false);
    assert.equal(employeeSchema.safeParse(employee({paymentType,[field]:12.34})).success,true);
  }
});

test("pending pay does not weaken confirmation, role or contract validation",()=>{
  for(const change of [{confirmed:false},{roleIds:[]},{primaryRoleId:"other"},{maxHoursPerWeek:0},{maxDaysPerWeek:0}])
    assert.equal(employeeSchema.safeParse(employee(change)).success,false);
});

test("payroll refuses a pending worker even among configured workers",()=>{
  assert.doesNotThrow(()=>assertNoPendingRemuneration([{paymentType:"HOURLY"},{paymentType:"DAILY"},{paymentType:"FIXED_MONTHLY"}]));
  for(const rows of [[{paymentType:"UNSET"}],[{paymentType:"HOURLY"},{paymentType:"UNSET"}]])
    assert.throws(()=>assertNoPendingRemuneration(rows),error=>error.status===409&&error.code==="WORKFORCE_REMUNERATION_PENDING");
});

test("unknown pay never calculates to zero, even with supplied rates",()=>{
  assert.equal(payrollGross({paymentType:"UNSET",actualMinutes:480,hourlyRate:10,dailyRate:80,fixedAmount:1000}),null);
  assert.equal(payrollGross({paymentType:"HOURLY",actualMinutes:480,hourlyRate:10}),80);
  assert.equal(payrollGross({paymentType:"DAILY",workDays:4,dailyRate:80}),320);
  assert.equal(payrollGross({paymentType:"FIXED_MONTHLY",fixedAmount:1000}),1000);
});

test("an existing configured pay basis cannot be erased as pending",()=>{
  assert.doesNotThrow(()=>assertRemunerationCanBeDeferred({paymentType:"UNSET"}));
  for(const paymentType of ["HOURLY","DAILY","FIXED_MONTHLY"])
    assert.throws(()=>assertRemunerationCanBeDeferred({paymentType}),error=>error.status===409);
});
