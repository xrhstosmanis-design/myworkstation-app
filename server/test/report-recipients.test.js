import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReportRecipients,reportRecipientListSchema } from "../src/services/report-recipients.js";
test("one email and empty settings remain compatible",()=>{
 assert.equal(reportRecipientListSchema.parse(""),"");
 assert.equal(reportRecipientListSchema.parse(" OWNER@example.com "),"owner@example.com");
});
test("two report recipients persist separately and duplicates send once",()=>{
 assert.equal(reportRecipientListSchema.parse("owner@example.com, manager@example.gr"),"owner@example.com, manager@example.gr");
 assert.deepEqual(normalizeReportRecipients(["OWNER@example.com","owner@example.com, manager@example.gr"]),["owner@example.com","manager@example.gr"]);
});
test("invalid recipients and injected headers are rejected",()=>{
 for(const value of ["owner@example.com, invalid","owner@example.com,","owner@example.com\r\nBcc:other@example.com",Array.from({length:11},(_,i)=>"u"+i+"@example.com").join(",")])
 assert.equal(reportRecipientListSchema.safeParse(value).success,false);
});
