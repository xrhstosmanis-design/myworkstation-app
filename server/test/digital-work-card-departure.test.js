import assert from "node:assert/strict";
import test from "node:test";
import {cashShiftRequiresDigitalDeparture,digitalWorkCardDeparture} from "../src/services/digital-work-card-departure.js";

const shift = {
  entryAcceptedAt: "2026-11-26T22:00:00+02:00",
  declaredEndAt: "2026-11-27T06:00:00+02:00"
};

test("reminder starts exactly three minutes before declared end across midnight", () => {
  assert.equal(digitalWorkCardDeparture({...shift, now:"2026-11-27T05:56:59+02:00"}).showReminder, false);
  assert.equal(digitalWorkCardDeparture({...shift, now:"2026-11-27T03:57:00Z"}).showReminder, true);
  assert.equal(digitalWorkCardDeparture({...shift, now:"2026-11-27T06:05:00+02:00"}).showReminder, true);
});

test("reminder requires an accepted entry and clears after an accepted departure", () => {
  const now = "2026-11-27T06:05:00+02:00";
  assert.equal(digitalWorkCardDeparture({...shift, entryAcceptedAt:null, now}).showReminder, false);
  assert.equal(digitalWorkCardDeparture({...shift, departureAt:now, now}).showReminder, true);
  assert.equal(digitalWorkCardDeparture({...shift, departureAcceptedAt:now, now}).showReminder, false);
  assert.equal(digitalWorkCardDeparture({...shift, declaredEndAt:null, now}).showReminder, false);
});

test("reason is required at ten minutes early, and whitespace leaves it pending", () => {
  const onThreshold = {...shift, departureAt:"2026-11-27T05:50:00+02:00"};
  assert.equal(digitalWorkCardDeparture(onThreshold).requiresReason, true);
  assert.equal(digitalWorkCardDeparture({...onThreshold, reason:" "}).reasonPending, true);
  assert.equal(digitalWorkCardDeparture({...onThreshold, reason:"Άδεια υπευθύνου"}).reasonPending, false);
  assert.equal(digitalWorkCardDeparture({...shift, departureAt:"2026-11-27T05:50:01+02:00"}).requiresReason, false);
});

test("cash shift close only requires departure for its own employee and work session", () => {
  const cashShift = {storeId:"store-a", employeeId:"employee-a", cashShiftId:"cash-a"};
  const workSession = {...cashShift, ...shift};
  const requiresDeparture = session => cashShiftRequiresDigitalDeparture({...cashShift, workSession:session});

  assert.equal(requiresDeparture(null), false);
  assert.equal(requiresDeparture({...workSession, entryAcceptedAt:null}), false);
  assert.equal(requiresDeparture({...workSession, employeeId:"employee-b"}), false);
  assert.equal(requiresDeparture({...workSession, storeId:"store-b"}), false);
  assert.equal(requiresDeparture({...workSession, cashShiftId:"cash-b"}), false);
  assert.equal(requiresDeparture(workSession), true);
  assert.equal(requiresDeparture({...workSession, departureAt:"2026-11-27T06:00:00+02:00"}), true);
  assert.equal(requiresDeparture({...workSession, departureAcceptedAt:"2026-11-26T14:00:00+02:00"}), true);
  assert.equal(requiresDeparture({...workSession, departureAcceptedAt:"2026-11-27T06:00:00+02:00"}), false);
});
