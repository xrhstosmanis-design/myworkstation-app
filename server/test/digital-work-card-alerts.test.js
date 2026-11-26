import assert from "node:assert/strict";
import test from "node:test";
import {digitalWorkCardAlertKinds, sendDigitalWorkCardAlert} from "../src/services/digital-work-card-alerts.js";

test("trial attendance alerts identify rest day, missing schedule and uncertain submissions", () => {
  assert.deepEqual(digitalWorkCardAlertKinds({type:"IN",status:"ACCEPTED",declaredRestDay:true}), ["REST_DAY"]);
  assert.deepEqual(digitalWorkCardAlertKinds({type:"IN",status:"ACCEPTED"}), ["NO_SCHEDULE"]);
  assert.deepEqual(digitalWorkCardAlertKinds({type:"OUT",status:"UNKNOWN"}), ["OUT_UNKNOWN"]);
  assert.deepEqual(digitalWorkCardAlertKinds({type:"OUT",status:"ACCEPTED"}), []);
});

test("concurrent alert attempts send one email to the configured LAB recipients", async () => {
  let reserved = false;
  let sends = 0;
  const db = {
    digitalWorkSession:{findFirst:async ({where}) => {
      assert.deepEqual(where,{id:"session", storeId:"store", store:{companyId:"company"}});
      return {entryAt:new Date("2026-11-26T20:00:00Z"), employee:{fullName:"Δείγμα"}, store:{name:"LAB"}};
    }},
    digitalWorkAlert:{
      createMany:async () => {
        if (reserved) return {count:0};
        reserved = true;
        return {count:1};
      },
      update:async ({data}) => assert.equal(data.status, "SENT")
    }
  };
  const options = {
    db, companyId:"company", storeId:"store", sessionId:"session", kind:"REST_DAY",
    audience:"LAB", trialRecipients:"lab@example.com", mail:async ({to}) => {
      assert.deepEqual(to,["lab@example.com"]);
      sends += 1;
      return {accepted:["lab@example.com"],rejected:[]};
    }
  };
  await Promise.all([sendDigitalWorkCardAlert(options), sendDigitalWorkCardAlert(options)]);
  assert.equal(sends, 1);
});

test("overtime sends an alert only above the configured threshold after accepted departure", () => {
  const event = {
    type:"OUT", status:"ACCEPTED", declaredEndAt:"2026-11-27T04:00:00Z",
    departureAt:"2026-11-27T04:15:01Z", overtimeThresholdMinutes:15
  };
  assert.deepEqual(digitalWorkCardAlertKinds(event), ["OVERTIME"]);
  assert.deepEqual(digitalWorkCardAlertKinds({...event, departureAt:"2026-11-27T04:15:00Z"}), []);
  assert.deepEqual(digitalWorkCardAlertKinds({...event, overtimeThresholdMinutes:undefined}), []);
});

test("store-management alerts are restricted to owners of the same company and its store manager", async () => {
  const db = {
    digitalWorkSession:{findFirst:async ({where}) => {
      assert.deepEqual(where,{id:"session", storeId:"store", store:{companyId:"company"}});
      return {entryAt:new Date(), employee:{fullName:"Δείγμα"}, store:{name:"Δείγμα", responsibleEmail:"manager@example.com"}};
    }},
    user:{findMany:async ({where}) => {
      assert.deepEqual(where,{companyId:"company",role:"OWNER"});
      return [{email:"owner@example.com"},{email:"MANAGER@example.com"}];
    }},
    digitalWorkAlert:{
      createMany:async () => ({count:1}),
      update:async ({data}) => assert.equal(data.status,"SENT")
    }
  };
  let sends = 0;
  await sendDigitalWorkCardAlert({
    db, companyId:"company", storeId:"store", sessionId:"session", kind:"REST_DAY",
    audience:"STORE_MANAGEMENT", trialRecipients:"lab@example.com",
    mail:async ({to}) => {
      sends += 1;
      assert.deepEqual(to,["owner@example.com","manager@example.com"]);
      return {accepted:to,rejected:[]};
    }
  });
  assert.equal(sends, 1);
});
