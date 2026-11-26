import assert from "node:assert/strict";
import test from "node:test";
import {authenticateErganiTrial,submitErganiTrialWorkCard} from "../src/services/ergani-trial-work-card.js";

const card = {
  employerTaxId:"000000000", employeeTaxId:"000000001", branchNumber:"0",
  firstName:"Δείγμα", lastName:"Δοκιμή", type:"OUT", referenceDate:"2026-11-27",
  occurredAt:new Date("2026-11-27T04:00:00.456Z")
};

test("submits only to trial and accepts a single protocol receipt", async () => {
  const result = await submitErganiTrialWorkCard({token:"test-token", card, fetchImpl:async (url, options) => {
    assert.equal(url, "https://trialv2eservices.yeka.gr/WebServicesApi/api/Documents/WRKCardSE");
    assert.equal(options.redirect, "error");
    const [event] = JSON.parse(options.body).Cards.Card[0].Details.CardDetails;
    assert.equal(event.f_type, "1");
    assert.equal(event.f_date, "2026-11-27T06:00:00+02:00");
    return Response.json([{id:"1", protocol:"TEST1"}]);
  }});
  assert.deepEqual(result, {status:"ACCEPTED", reference:"TEST1", error:null});
});

test("rejects a validation error and does not resend an uncertain submission", async () => {
  for (const response of [new Response("", {status:400}), Response.json([]), new Response("", {status:503})]) {
    let requests = 0;
    const result = await submitErganiTrialWorkCard({token:"test-token", card, fetchImpl:async () => {
      requests += 1;
      return response;
    }});
    assert.equal(requests, 1);
    assert.equal(result.status, response.status === 400 ? "REJECTED" : "UNKNOWN");
    assert.equal(result.reference, null);
  }
});

test("concurrent processing sends the same recorded departure only once", async () => {
  const {sendRecordedDigitalWorkCard} = await import("../src/services/digital-work-card-submission.js");
  const row = {
    id:"session", storeId:"store", employeeId:"employee", entryStatus:"ACCEPTED",
    departureRequestId:"request", departureStatus:"PENDING", departureAt:card.occurredAt
  };
  const matches = where => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {digitalWorkSession:{
    findFirst:async ({where}) => matches(where) ? {...row} : null,
    updateMany:async ({where, data}) => {
      if (!matches(where)) return {count:0};
      Object.assign(row, data);
      return {count:1};
    }
  }};
  let sent = 0;
  const options = {
    db, storeId:row.storeId, employeeId:row.employeeId, sessionId:row.id,
    requestId:row.departureRequestId, type:"OUT", token:"test-token",
    identity:card, referenceDate:card.referenceDate,
    fetchImpl:async () => {
      sent += 1;
      return Response.json([{id:"1", protocol:"TRIAL1"}]);
    }
  };
  assert.deepEqual(await sendRecordedDigitalWorkCard({...options, storeId:"other"}), {sent:false});
  await assert.rejects(sendRecordedDigitalWorkCard({...options, token:""}));
  assert.equal(row.departureStatus, "PENDING");
  const results = await Promise.all([sendRecordedDigitalWorkCard(options), sendRecordedDigitalWorkCard(options)]);
  assert.equal(sent, 1);
  assert.equal(results.filter(result => result.sent).length, 1);
  assert.equal(row.departureStatus, "ACCEPTED");
  assert.equal(row.departureErganiReference, "TRIAL1");
});

test("authentication uses the trial endpoint and returns only the access token", async () => {
  const token = await authenticateErganiTrial({username:"test", password:"test-password", fetchImpl:async (url, options) => {
    assert.equal(url, "https://trialv2eservices.yeka.gr/WebServicesApi/api/Authentication");
    assert.deepEqual(JSON.parse(options.body), {Username:"test", Password:"test-password", Usertype:"02"});
    assert.equal(options.redirect, "error");
    return Response.json({accessToken:"trial-token", refreshToken:"unused"});
  }});
  assert.equal(token, "trial-token");
  await assert.rejects(authenticateErganiTrial({username:"test", password:"test-password",
    fetchImpl:async () => Response.json({error:"test-password"}, {status:401})}),
    {message:"Η δοκιμαστική σύνδεση στο ΕΡΓΑΝΗ δεν επιβεβαιώθηκε."});
});
